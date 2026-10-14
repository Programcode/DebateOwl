import { isProOnlyModel, type FeatureConfig, type FeatureConfigChange } from './feature-config';
import type { SerialQueue } from './serial-queue';

type FeatureSettings = { config: FeatureConfig; pro: boolean };

/**
 * A tool's config, read in the settings write queue after every write made
 * before it, so the tool runs with the model just picked. A write that hangs
 * delays the tool by at most `waitMs`. The tool then reads the saved config and
 * applies the choice still being saved on top, because the row may still hold
 * the model it replaces. That includes a choice made after the tool started:
 * it is the latest one either way. A Pro model is left out without Pro access,
 * since its save will fail and roll back.
 */
export function readFeatureConfigAfterWrites(options: {
  writes: SerialQueue;
  read: () => Promise<FeatureSettings>;
  pending: () => FeatureConfigChange | null;
  waitMs: number;
}): Promise<FeatureConfig> {
  const { writes, read, pending, waitMs } = options;
  const withPending = ({ config, pro }: FeatureSettings): FeatureConfig => {
    const { model, reasoningEffort } = pending() ?? {};
    return {
      ...config,
      ...(model !== undefined && (pro || !isProOnlyModel(model)) ? { model } : {}),
      ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
    };
  };
  return new Promise<FeatureConfig>((resolve, reject) => {
    const fallback = setTimeout(() => void read().then((settings) => resolve(withPending(settings)), reject), waitMs);
    writes(read).then(
      ({ config }) => {
        clearTimeout(fallback);
        resolve(config);
      },
      (cause: unknown) => {
        clearTimeout(fallback);
        reject(cause);
      },
    );
  });
}
