import { requireOptionalNativeModule } from 'expo';

import { nativeCapabilities } from './native-capabilities';
import type { SpotlightItem } from './spotlight-items';

/**
 * Spotlight search for the Current Debate's saved documents, through
 * expo-core-spotlight (2.x: 3.0 drops the config plugin app.config.ts adds).
 * It is reached by its native module name, so nothing here loads in Expo Go,
 * on the web or in a build without the package: there every call is a no-op.
 *
 * The Debate tab indexes the Current Debate's documents (spotlight-items.ts);
 * the debate context clears the index on sign-out and Delete all my data
 * clears it too. A tapped result opens its debatelab:// URL.
 */

export type SpotlightDomain = 'debates' | 'work';

type CoreSpotlightModule = {
  indexItems: (items: Record<string, unknown>[]) => Promise<void>;
  removeAllItemsFromDomain: (domain: string) => Promise<void>;
  removeAllItems: () => Promise<void>;
};

const domainId = (domain: SpotlightDomain) => `com.pistack.debateowl.${domain}`;

function spotlight(): CoreSpotlightModule | null {
  if (!nativeCapabilities().spotlight) return null;
  return requireOptionalNativeModule<CoreSpotlightModule>('ExpoCoreSpotlight');
}

/** Replaces everything indexed for one domain with these items, so deleted debates and cases leave Spotlight too. */
export async function indexForSpotlight(domain: SpotlightDomain, items: SpotlightItem[]): Promise<void> {
  const native = spotlight();
  if (!native) return;
  try {
    await native.removeAllItemsFromDomain(domainId(domain));
    if (items.length === 0) return;
    await native.indexItems(
      items.map((item) => ({
        uniqueIdentifier: item.url,
        url: item.url,
        title: item.title,
        contentDescription: item.description,
        keywords: item.keywords,
        domainIdentifier: domainId(domain),
      })),
    );
  } catch (cause) {
    console.warn('Could not update Spotlight:', cause instanceof Error ? cause.message : cause);
  }
}

/** Removes one domain's items, such as the documents of a debate that is no longer the Current Debate. */
export async function clearSpotlightDomain(domain: SpotlightDomain): Promise<void> {
  const native = spotlight();
  if (!native) return;
  try {
    await native.removeAllItemsFromDomain(domainId(domain));
  } catch (cause) {
    console.warn('Could not update Spotlight:', cause instanceof Error ? cause.message : cause);
  }
}

/** Removes every item this app indexed: one account's debates must not show in Spotlight for the next. */
export async function clearSpotlight(): Promise<void> {
  const native = spotlight();
  if (!native) return;
  try {
    await native.removeAllItems();
  } catch (cause) {
    console.warn('Could not clear Spotlight:', cause instanceof Error ? cause.message : cause);
  }
}
