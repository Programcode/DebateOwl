import { requireOptionalNativeModule } from 'expo';

/**
 * The app's StoreKit 2 module (modules/store-kit), as plain JSON. It links
 * into every native build; Expo Go and a build from before it have no module,
 * so storeKit() is null there and nothing here is ever called. purchases.ts
 * owns the flow; screens go through it, not through this file.
 *
 * Errors the module throws carry a `code`: ERR_UNKNOWN_PRODUCT,
 * ERR_INVALID_ACCOUNT_TOKEN, ERR_UNVERIFIED (StoreKit could not verify the
 * transaction's signature), ERR_PURCHASE_NOT_ALLOWED (Screen Time or a
 * parent turned purchases off), ERR_NETWORK, ERR_CANCELLED (the App Store
 * sign-in that sync() shows was dismissed), ERR_NO_WINDOW_SCENE (a sheet was
 * asked for while the app was not on screen) and ERR_STORE_KIT for the rest.
 */

export type PeriodUnit = 'day' | 'week' | 'month' | 'year';

export interface SubscriptionPeriod {
  unit: PeriodUnit;
  value: number;
}

export interface IntroOffer {
  displayPrice: string;
  period: SubscriptionPeriod;
  paymentMode: 'freeTrial' | 'payAsYouGo' | 'payUpFront';
  periodCount: number;
}

export interface StoreProduct {
  id: string;
  displayName: string;
  description: string;
  /** The localized price, ready to show, e.g. "4,99 €". */
  displayPrice: string;
  /** The price as a decimal string, for arithmetic only. */
  price: string;
  currencyCode: string;
  /** Missing for a product that is not a subscription. */
  period?: SubscriptionPeriod;
  introOffer?: IntroOffer;
  isEligibleForIntroOffer: boolean;
}

/** One verified transaction, as the app-store-purchase function takes it. */
export interface StoreTransaction {
  transactionId: string;
  productId: string;
  /** The transaction's JWS (jwsRepresentation). */
  signedTransaction: string;
  /** The subscription's renewal info JWS, when StoreKit has it. */
  signedRenewalInfo?: string;
  /** The account the purchase was made for, lowercased; null when it set none (an offer code redeemed in the App Store app, Family Sharing). */
  appAccountToken: string | null;
  /** ISO 8601; null for a product that does not expire. */
  expiresAt: string | null;
}

export type StorePurchaseResult =
  | ({ status: 'purchased' } & StoreTransaction)
  | { status: 'pending' }
  | { status: 'cancelled' };

export interface StoreKitModule {
  products(ids: string[]): Promise<StoreProduct[]>;
  /** Shows Apple's purchase sheet. The transaction is left unfinished: finish() it once the server has it. */
  purchase(productId: string, appAccountToken: string): Promise<StorePurchaseResult>;
  finish(transactionId: string): Promise<void>;
  currentEntitlements(): Promise<StoreTransaction[]>;
  unfinished(): Promise<StoreTransaction[]>;
  /** AppStore.sync(): may ask for the Apple ID password. */
  sync(): Promise<void>;
  showManageSubscriptions(): Promise<void>;
  presentOfferCodeRedeemSheet(): Promise<void>;
  addListener(event: 'onTransactionUpdate', listener: (transaction: StoreTransaction) => void): { remove: () => void };
}

let loaded: StoreKitModule | null | undefined;

export function storeKit(): StoreKitModule | null {
  if (loaded === undefined) loaded = requireOptionalNativeModule<StoreKitModule>('DebateOwlStoreKit');
  return loaded;
}

/** The code a native StoreKit error carries, or undefined for anything else. */
export function storeKitErrorCode(error: unknown): string | undefined {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : undefined;
}
