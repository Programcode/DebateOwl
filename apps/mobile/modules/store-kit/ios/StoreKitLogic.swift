import Foundation
import StoreKit

// StoreKit 2 for src/lib/store-kit.ts, as plain JSON dictionaries. This file
// uses only Foundation and StoreKit so it can be typechecked on its own
// (`swiftc -typecheck` against the macOS SDK); StoreKitModule.swift is the
// thin Expo glue around it.
//
// Nothing here finishes a transaction on its own. purchases.ts finishes one
// only after the app-store-purchase Edge Function has accepted it, so a
// purchase whose request is lost stays in Transaction.unfinished and is sent
// again. Unverified transactions are left out: the server would refuse them.

/// An error with the code JavaScript reads (`error.code`); the glue turns it into an Expo Exception.
struct StoreKitFailure: Error {
  let code: String
  let message: String
}

@available(iOS 15.0, macOS 12.0, *)
enum StoreKitLogic {
  // MARK: - Products

  static func products(_ ids: [String]) async throws -> [[String: Any]] {
    let products: [Product]
    do {
      products = try await Product.products(for: ids)
    } catch {
      throw failure(error)
    }
    var list: [[String: Any]] = []
    for product in products {
      list.append(await describe(product))
    }
    return list
  }

  private static func describe(_ product: Product) async -> [String: Any] {
    var entry: [String: Any] = [
      "id": product.id,
      "displayName": product.displayName,
      "description": product.description,
      "displayPrice": product.displayPrice,
      "price": NSDecimalNumber(decimal: product.price).stringValue,
      "currencyCode": product.priceFormatStyle.currencyCode,
      "isEligibleForIntroOffer": false,
    ]
    guard let subscription = product.subscription else { return entry }
    entry["period"] = period(subscription.subscriptionPeriod)
    if let offer = subscription.introductoryOffer {
      entry["introOffer"] = [
        "displayPrice": offer.displayPrice,
        "period": period(offer.period),
        "paymentMode": paymentMode(offer.paymentMode),
        "periodCount": offer.periodCount,
      ] as [String: Any]
    }
    entry["isEligibleForIntroOffer"] = await subscription.isEligibleForIntroOffer
    return entry
  }

  private static func period(_ period: Product.SubscriptionPeriod) -> [String: Any] {
    let unit: String
    switch period.unit {
    case .day: unit = "day"
    case .week: unit = "week"
    case .month: unit = "month"
    case .year: unit = "year"
    @unknown default: unit = "month"
    }
    return ["unit": unit, "value": period.value]
  }

  private static func paymentMode(_ mode: Product.SubscriptionOffer.PaymentMode) -> String {
    if mode == .freeTrial { return "freeTrial" }
    if mode == .payUpFront { return "payUpFront" }
    return "payAsYouGo"
  }

  // MARK: - Purchase

  /// Shows Apple's purchase sheet for `productId`, made out to `appAccountToken`
  /// (the Supabase user id). Returns the transaction unfinished.
  static func purchase(_ productId: String, appAccountToken: String) async throws -> [String: Any] {
    guard let token = UUID(uuidString: appAccountToken) else {
      throw StoreKitFailure(code: "ERR_INVALID_ACCOUNT_TOKEN", message: "The account token is not a UUID.")
    }
    let result: Product.PurchaseResult
    do {
      guard let product = try await Product.products(for: [productId]).first else {
        throw StoreKitFailure(code: "ERR_UNKNOWN_PRODUCT", message: "The App Store does not list \(productId).")
      }
      result = try await product.purchase(options: [.appAccountToken(token)])
    } catch {
      throw failure(error)
    }
    switch result {
    case .success(let verification):
      if case .unverified(_, let error) = verification {
        throw StoreKitFailure(code: "ERR_UNVERIFIED", message: error.localizedDescription)
      }
      guard var entry = await entry(verification) else {
        throw StoreKitFailure(code: "ERR_UNVERIFIED", message: "The purchase could not be verified.")
      }
      entry["status"] = "purchased"
      return entry
    case .pending:
      return ["status": "pending"]
    case .userCancelled:
      return ["status": "cancelled"]
    @unknown default:
      throw StoreKitFailure(code: "ERR_STORE_KIT", message: "Unknown purchase result.")
    }
  }

  /// Finishes the unfinished transaction with this id. One that is not
  /// unfinished any more was finished already, so there is nothing to do.
  static func finish(_ transactionId: String) async {
    guard let id = UInt64(transactionId) else { return }
    for await result in Transaction.unfinished {
      let transaction = result.unsafePayloadValue
      if transaction.id == id {
        await transaction.finish()
        return
      }
    }
  }

  // MARK: - Transactions

  static func currentEntitlements() async -> [[String: Any]] {
    var list: [[String: Any]] = []
    for await result in Transaction.currentEntitlements {
      if let entry = await entry(result) { list.append(entry) }
    }
    return list
  }

  static func unfinished() async -> [[String: Any]] {
    var list: [[String: Any]] = []
    for await result in Transaction.unfinished {
      if let entry = await entry(result) { list.append(entry) }
    }
    return list
  }

  /// Restore purchases. May ask for the Apple ID password; dismissing it is ERR_CANCELLED.
  static func sync() async throws {
    do {
      try await AppStore.sync()
    } catch {
      throw failure(error)
    }
  }

  /// Sends every verified Transaction.updates element (a renewal, an approved
  /// Ask to Buy, an offer code, a purchase on another device) until cancelled.
  static func observeUpdates(_ send: @escaping @Sendable ([String: Any]) -> Void) -> Task<Void, Never> {
    Task.detached(priority: .background) {
      for await result in Transaction.updates {
        if Task.isCancelled { return }
        if let entry = await entry(result) { send(entry) }
      }
    }
  }

  /// One verified transaction as store-kit.ts's StoreTransaction; nil when it is unverified.
  static func entry(_ result: VerificationResult<Transaction>) async -> [String: Any]? {
    guard case .verified(let transaction) = result else { return nil }
    var entry: [String: Any] = [
      "transactionId": String(transaction.id),
      "productId": transaction.productID,
      "signedTransaction": result.jwsRepresentation,
      "appAccountToken": transaction.appAccountToken.map { $0.uuidString.lowercased() as Any } ?? NSNull(),
      "expiresAt": transaction.expirationDate.map { $0.ISO8601Format(Date.ISO8601FormatStyle(includingFractionalSeconds: true)) as Any } ?? NSNull(),
    ]
    if let renewal = await renewalInfo(for: transaction) { entry["signedRenewalInfo"] = renewal }
    return entry
  }

  /// The subscription's signed renewal info, so the server learns whether it renews.
  private static func renewalInfo(for transaction: Transaction) async -> String? {
    guard transaction.productType == .autoRenewable else { return nil }
    if #available(iOS 17.2, macOS 14.2, *) {
      return await transaction.subscriptionStatus?.renewalInfo.jwsRepresentation
    }
    guard let groupID = transaction.subscriptionGroupID,
          let statuses = try? await Product.SubscriptionInfo.status(for: groupID) else { return nil }
    for status in statuses {
      if case .verified(let info) = status.renewalInfo, info.originalTransactionID == transaction.originalID {
        return status.renewalInfo.jwsRepresentation
      }
    }
    return nil
  }

  // MARK: - Errors

  static func failure(_ error: Error) -> StoreKitFailure {
    if let failure = error as? StoreKitFailure { return failure }
    if let error = error as? StoreKitError {
      switch error {
      case .userCancelled: return StoreKitFailure(code: "ERR_CANCELLED", message: error.localizedDescription)
      case .networkError: return StoreKitFailure(code: "ERR_NETWORK", message: error.localizedDescription)
      case .notAvailableInStorefront: return StoreKitFailure(code: "ERR_UNKNOWN_PRODUCT", message: error.localizedDescription)
      default: return StoreKitFailure(code: "ERR_STORE_KIT", message: error.localizedDescription)
      }
    }
    if let error = error as? Product.PurchaseError {
      switch error {
      case .purchaseNotAllowed: return StoreKitFailure(code: "ERR_PURCHASE_NOT_ALLOWED", message: error.localizedDescription)
      case .productUnavailable: return StoreKitFailure(code: "ERR_UNKNOWN_PRODUCT", message: error.localizedDescription)
      default: return StoreKitFailure(code: "ERR_STORE_KIT", message: error.localizedDescription)
      }
    }
    return StoreKitFailure(code: "ERR_STORE_KIT", message: error.localizedDescription)
  }
}
