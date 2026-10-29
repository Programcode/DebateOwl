import { requireOptionalNativeModule } from 'expo';

import { nativeCapabilities } from './native-capabilities';

/**
 * Spotlight search for debates and saved cases, through expo-core-spotlight
 * (2.x is the line for SDK 56 and 57; it needs its config plugin, which
 * app.config.ts adds once the package is installed). It is reached
 * by its native module name, so nothing here loads in Expo Go, on the web or
 * in a build without the package: there every call is a no-op.
 *
 * The Debate tab indexes the Current Debate's cases and the debate context
 * clears the index on sign-out. TODO(spotlight): install expo-core-spotlight@^2
 * for the development build, and clear the index after Delete all my data.
 */

/** One searchable item. Its URL is also its Spotlight identifier, which the package opens when the result is tapped. */
export type SpotlightItem = {
  /** An app link, such as `debatelab://case/<id>`. */
  url: `debatelab://${string}`;
  title: string;
  description?: string;
  keywords?: string[];
};

export type SpotlightDomain = 'debates' | 'cases';

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
