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

/** Whether this build has Spotlight, so callers can skip reading what they would index. */
export function spotlightAvailable(): boolean {
  return spotlight() !== null;
}

// Every call runs in one queue, in the order it was made. A clear also counts a new generation at
// once, so indexing asked for before it (still queued, or waiting on iOS) never writes afterwards:
// a signed-out account's or an earlier debate's documents cannot come back.
let queue: Promise<void> = Promise.resolve();
let generation = 0;

function enqueue(run: () => Promise<void>, failure: string): Promise<void> {
  const next = queue.then(run).catch((cause: unknown) => console.warn(failure, cause instanceof Error ? cause.message : cause));
  queue = next;
  return next;
}

/** Replaces everything indexed for one domain with these items, so deleted debates and cases leave Spotlight too. */
export function indexForSpotlight(domain: SpotlightDomain, items: SpotlightItem[]): Promise<void> {
  const native = spotlight();
  if (!native) return Promise.resolve();
  const asked = generation;
  return enqueue(async () => {
    if (asked !== generation) return;
    await native.removeAllItemsFromDomain(domainId(domain));
    if (items.length === 0 || asked !== generation) return;
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
  }, 'Could not update Spotlight:');
}

/** Removes one domain's items, such as the documents of a debate that is no longer the Current Debate. */
export function clearSpotlightDomain(domain: SpotlightDomain): Promise<void> {
  const native = spotlight();
  if (!native) return Promise.resolve();
  generation += 1;
  return enqueue(() => native.removeAllItemsFromDomain(domainId(domain)), 'Could not update Spotlight:');
}

/** Removes every item this app indexed: one account's debates must not show in Spotlight for the next. */
export function clearSpotlight(): Promise<void> {
  const native = spotlight();
  if (!native) return Promise.resolve();
  generation += 1;
  return enqueue(() => native.removeAllItems(), 'Could not clear Spotlight:');
}
