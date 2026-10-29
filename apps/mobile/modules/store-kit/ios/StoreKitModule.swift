import ExpoModulesCore
import StoreKit
import UIKit

// The Expo glue for StoreKitLogic.swift, which holds the StoreKit 2 work.
// src/lib/store-kit.ts loads it as DebateOwlStoreKit; purchases.ts owns the
// flow. Errors reach JavaScript as an Exception whose code is the
// StoreKitFailure's (ERR_CANCELLED, ERR_UNVERIFIED and the rest).
//
// Transaction.updates is listened to from the moment the module is created,
// as Apple asks, so a renewal or an approved Ask to Buy that arrives at launch
// is not missed; each verified one is sent as `onTransactionUpdate`.

public class StoreKitModule: Module {
  private var updates: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("DebateOwlStoreKit")

    Events("onTransactionUpdate")

    OnCreate {
      self.updates = StoreKitLogic.observeUpdates { [weak self] entry in
        self?.sendEvent("onTransactionUpdate", entry.mapValues { $0 as Any? })
      }
    }

    OnDestroy {
      self.updates?.cancel()
      self.updates = nil
    }

    AsyncFunction("products") { (ids: [String]) async throws -> [[String: Any]] in
      try await bridged { try await StoreKitLogic.products(ids) }
    }

    AsyncFunction("purchase") { (productId: String, appAccountToken: String) async throws -> [String: Any] in
      try await bridged { try await StoreKitLogic.purchase(productId, appAccountToken: appAccountToken) }
    }

    AsyncFunction("finish") { (transactionId: String) async in
      await StoreKitLogic.finish(transactionId)
    }

    AsyncFunction("currentEntitlements") { () async -> [[String: Any]] in
      await StoreKitLogic.currentEntitlements()
    }

    AsyncFunction("unfinished") { () async -> [[String: Any]] in
      await StoreKitLogic.unfinished()
    }

    AsyncFunction("sync") { () async throws in
      try await bridged { try await StoreKitLogic.sync() }
    }

    AsyncFunction("showManageSubscriptions") { @MainActor () async throws in
      guard let scene = SceneGeometry.foregroundActiveScene() else { throw NoWindowSceneException() }
      do {
        try await AppStore.showManageSubscriptions(in: scene)
      } catch {
        throw exception(error)
      }
    }

    AsyncFunction("presentOfferCodeRedeemSheet") { @MainActor () async throws in
      guard let scene = SceneGeometry.foregroundActiveScene() else { throw NoWindowSceneException() }
      do {
        try await AppStore.presentOfferCodeRedeemSheet(in: scene)
      } catch {
        throw exception(error)
      }
    }
  }
}

/// Runs StoreKit work and hands any failure to JavaScript with its code.
private func bridged<T>(_ work: () async throws -> T) async throws -> T {
  do {
    return try await work()
  } catch {
    throw exception(error)
  }
}

private func exception(_ error: Error) -> Exception {
  let failure = StoreKitLogic.failure(error)
  return Exception(name: "StoreKitError", description: failure.message, code: failure.code)
}

/// A sheet was asked for while no scene of the app is in the foreground. Its code is ERR_NO_WINDOW_SCENE, from the class name.
final class NoWindowSceneException: Exception, @unchecked Sendable {
  override var reason: String { "The app is not on screen." }
}
