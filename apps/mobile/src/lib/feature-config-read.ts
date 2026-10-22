import { isProOnlyModel, type FeatureConfig, type FeatureConfigChange } from './feature-config';
import type { SerialQueue } from './serial-queue';

type FeatureSettings = { config: FeatureConfig; pro: boolean };

function sameChoice(left: FeatureConfigChange | null, right: FeatureConfigChange | null): boolean {
  return (left?.model ?? null) === (right?.model ?? null) && (left?.reasoningEffort ?? null) === (right?.reasoningEffort ?? null);
}

function withChoice({ config, pro }: FeatureSettings, choice: FeatureConfigChange | null): FeatureConfig {
  const { model, reasoningEffort } = choice ?? {};
  return {
    ...config,
    ...(model !== undefined && (pro || !isProOnlyModel(model)) ? { model } : {}),
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
  };
}

/**
 * A tool's config, read in the settings write queue after every write made
 * before it, so the tool runs with the model just picked. A write that hangs
 * delays the tool by at most `waitMs`. The tool then reads the saved config and
 * applies the choice still being saved on top, because the row may still hold
 * the model it replaces. That includes a choice made after the tool started:
 * it is the latest one either way. A Pro model is left out without Pro access,
 * since its save will fail and roll back.
 *
 * The fallback read copies the row and then waits on the entitlement. If the
 * save finishes in that gap it clears the choice, and the copied row is the
 * one the save replaced. That result is dropped and the row is read again,
 * so a hung write still in the queue cannot keep the tool on the old model.
 */
export function readFeatureConfigAfterWrites(options: {
  writes: SerialQueue;
  read: () => Promise<FeatureSettings>;
  pending: () => FeatureConfigChange | null;
  waitMs: number;
}): Promise<FeatureConfig> {
  const { writes, read, pending, waitMs } = options;
  return new Promise<FeatureConfig>((resolve, reject) => {
    let settled = false;
    const finish = (config: FeatureConfig) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      resolve(config);
    };
    const fail = (cause: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      reject(cause);
    };
    const fallback = setTimeout(() => {
      const choiceAtStart = pending();
      void read().then((settings) => {
        const choice = pending();
        if (choice === null && !sameChoice(choice, choiceAtStart)) {
          void read().then((fresh) => finish(withChoice(fresh, pending())), fail);
          return;
        }
        finish(withChoice(settings, choice));
      }, fail);
    }, waitMs);
    writes(read).then(({ config }) => finish(config), fail);
  });
}
