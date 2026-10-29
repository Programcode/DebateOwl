import { palette } from '@/theme/colors';
import type { CurrentDebateWidgetProps, WidgetColors } from '@/widgets/current-debate';

import type { DebateCounts } from './debates';
import i18n from './i18n';
import { nativeCapabilities } from './native-capabilities';
import { widgetOwl } from './widget-images';

/**
 * What the Current Debate's Home Screen widget shows: the motion and the
 * Debate tab's counts, or null when there is no Current Debate (signed out
 * or none started; one-off mode keeps it, as the Debate tab does). Counts
 * are null when the caller does not have them (the debate context); the last
 * counts published for the same debate are kept then, so the context and the
 * Debate tab can both publish.
 */
export type CurrentDebateSnapshot = { debateId?: string; motion: string; counts: DebateCounts | null } | null;

type CurrentDebateWidget = { updateSnapshot: (props: CurrentDebateWidgetProps) => void };

let enabled: boolean | undefined;
let widget: Promise<CurrentDebateWidget | null> | undefined;
let latest: CurrentDebateSnapshot | undefined;
let known: { debateId?: string; motion: string; counts: DebateCounts } | null = null;
let written: string | null = null;
let watchingLanguage = false;

/**
 * Gives the widget the Current Debate. Call it whenever the Current Debate,
 * its motion or its counts change, with null on sign-out. A no-op in Expo Go,
 * on the web, and in a development build without the App Group: only a build
 * with the widget extension has somewhere to write. Identical data is not
 * written again, because every write reloads the widget's timeline, which
 * iOS budgets. The labels follow the app's language and are written again
 * when it changes.
 */
export function publishCurrentDebate(snapshot: CurrentDebateSnapshot): void {
  enabled ??= nativeCapabilities().widgets;
  if (!enabled) return;
  if (snapshot?.counts) {
    known = { debateId: snapshot.debateId, motion: snapshot.motion, counts: snapshot.counts };
  } else if (snapshot && known && sameDebate(snapshot, known)) {
    snapshot = { ...snapshot, counts: known.counts };
  }
  latest = snapshot;
  if (!watchingLanguage) {
    watchingLanguage = true;
    i18n.on('languageChanged', () => {
      if (latest !== undefined) void write(latest);
    });
  }
  void write(snapshot);
}

// By id when both sides have one, otherwise by motion.
function sameDebate(a: { debateId?: string; motion: string }, b: { debateId?: string; motion: string }): boolean {
  return a.debateId && b.debateId ? a.debateId === b.debateId : a.motion === b.motion;
}

async function write(snapshot: CurrentDebateSnapshot): Promise<void> {
  try {
    widget ??= loadWidget();
    const [target, owlUri] = await Promise.all([widget, widgetOwl('mark')]);
    // A newer publish landed while this one waited; it writes instead.
    if (!target || snapshot !== latest) return;
    const props = widgetProps(snapshot, owlUri);
    const serialized = JSON.stringify(props);
    if (serialized === written) return;
    written = serialized;
    target.updateSnapshot(props);
  } catch (cause) {
    written = null;
    console.warn('Could not update the Current Debate widget:', cause instanceof Error ? cause.message : cause);
  }
}

// Only loaded once the build is known to have the widget module: creating the widget needs it.
async function loadWidget(): Promise<CurrentDebateWidget | null> {
  try {
    return (await import('@/widgets/current-debate')).default;
  } catch (cause) {
    console.warn('The Current Debate widget is not available:', cause instanceof Error ? cause.message : cause);
    return null;
  }
}

function colorsFor(scheme: 'light' | 'dark'): WidgetColors {
  const colors = palette[scheme];
  return {
    background: colors.background,
    heading: colors.heading,
    secondary: colors.secondary,
    primary: colors.primary,
    primaryFill: colors.primaryFill,
    onPrimary: colors.onPrimary,
  };
}

/** The widget's props in the app's current language. */
function widgetProps(snapshot: CurrentDebateSnapshot, owlUri: string | null): CurrentDebateWidgetProps {
  const t = i18n.t.bind(i18n);
  const counts = snapshot?.counts ?? null;
  const sources = counts ? { value: counts.sources, label: t('mobile.debate.statSources', { count: counts.sources }) } : null;
  const rounds = counts ? { value: counts.rounds, label: t('mobile.debate.statRounds', { count: counts.rounds }) } : null;
  return {
    motion: snapshot?.motion ?? null,
    title: t('nav.currentDebate'),
    // The Debate tab opens on In favor, so its results figure is that side's.
    stats:
      counts && sources && rounds
        ? [sources, { value: counts.results.pro, label: t('mobile.debate.statResults', { count: counts.results.pro }) }, rounds]
        : [],
    wideStats:
      counts && sources && rounds
        ? [
            sources,
            { value: counts.results.pro, label: t('debate.side.pro') },
            { value: counts.results.con, label: t('debate.side.con') },
            rounds,
          ]
        : [],
    spar: t('mobile.widget.spar'),
    emptyTitle: t('debate.noCurrentTitle'),
    emptyAction: t('debate.startNew'),
    openUrl: 'debatelab://',
    sparUrl: 'debatelab://sparring',
    newDebateUrl: 'debatelab://new-debate',
    owl: owlUri,
    light: colorsFor('light'),
    dark: colorsFor('dark'),
  };
}
