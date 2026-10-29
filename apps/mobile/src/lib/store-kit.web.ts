import type { StoreKitModule, StoreProduct, StorePurchaseResult, StoreTransaction } from './store-kit';

export type {
  IntroOffer,
  PeriodUnit,
  StoreKitModule,
  StoreProduct,
  StorePurchaseResult,
  StoreTransaction,
  SubscriptionPeriod,
} from './store-kit';

/**
 * The web preview has no StoreKit. It acts as a store with placeholder
 * prices (not the App Store's) and records every call on
 * `window.__debatelabStoreKit.calls`, so the screenshot script can show the
 * plan screens and check what the app asked for. A purchase answers
 * `window.__debatelabStoreKit.outcome`, 'pending' (Ask to Buy) unless the
 * script sets another, so by default nothing is sent to the server. A
 * 'purchased' one carries no signature: the server refuses it, and it is
 * never kept as unfinished, so it is not sent again. The phone app uses
 * store-kit.ts.
 */

type StoreKitProbe = {
  __debatelabStoreKit?: { calls: { name: string; args: unknown[] }[]; outcome?: StorePurchaseResult['status'] };
};

function probe() {
  const target = window as unknown as StoreKitProbe;
  target.__debatelabStoreKit ??= { calls: [] };
  return target.__debatelabStoreKit;
}

function record(name: string, ...args: unknown[]) {
  probe().calls.push({ name, args });
}

const PLACEHOLDER_PRODUCTS: Record<string, Omit<StoreProduct, 'id'>> = {
  'com.pistack.debateowl.basic.monthly': {
    displayName: 'Basic',
    description: 'Basic monthly',
    displayPrice: '$4.99',
    price: '4.99',
    currencyCode: 'USD',
    period: { unit: 'month', value: 1 },
    introOffer: { displayPrice: '$0.00', period: { unit: 'week', value: 1 }, paymentMode: 'freeTrial', periodCount: 1 },
    isEligibleForIntroOffer: true,
  },
  'com.pistack.debateowl.pro.monthly': {
    displayName: 'Pro',
    description: 'Pro monthly',
    displayPrice: '$9.99',
    price: '9.99',
    currencyCode: 'USD',
    period: { unit: 'month', value: 1 },
    isEligibleForIntroOffer: false,
  },
};

let nextId = 1;

const preview: StoreKitModule = {
  async products(ids) {
    record('products', ids);
    return ids.flatMap((id) => {
      const product = PLACEHOLDER_PRODUCTS[id];
      return product ? [{ id, ...product }] : [];
    });
  },
  async purchase(productId, appAccountToken): Promise<StorePurchaseResult> {
    record('purchase', productId, appAccountToken);
    const outcome = probe().outcome ?? 'pending';
    if (outcome !== 'purchased') return { status: outcome };
    const transaction: StoreTransaction = {
      transactionId: `preview-${nextId++}`,
      productId,
      signedTransaction: 'preview',
      appAccountToken: appAccountToken.toLowerCase(),
      expiresAt: null,
    };
    return { status: 'purchased', ...transaction };
  },
  async finish(transactionId) {
    record('finish', transactionId);
  },
  async currentEntitlements() {
    record('currentEntitlements');
    return [];
  },
  async unfinished() {
    record('unfinished');
    return [];
  },
  async sync() {
    record('sync');
  },
  async showManageSubscriptions() {
    record('showManageSubscriptions');
  },
  async presentOfferCodeRedeemSheet() {
    record('presentOfferCodeRedeemSheet');
  },
  addListener() {
    return { remove: () => {} };
  },
};

export function storeKit(): StoreKitModule | null {
  return preview;
}

export function storeKitErrorCode(error: unknown): string | undefined {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : undefined;
}
