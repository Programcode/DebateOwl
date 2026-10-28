import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, createWidget, type LiveActivityEnvironment, type WidgetEnvironment } from 'expo-widgets';

import type { TimerActivityState } from '@/lib/timer';

// The timer on the Lock Screen and in the Dynamic Island, drawn by iOS from
// the props alone: the clocks are SwiftUI timer texts, so they count without
// the app running. Each layout runs in the widget extension's own runtime
// ('widget' directive), so it cannot use anything outside its function: every
// string comes in the props, in the app's language, and the colours are the
// app's plume blue (side A), coral (side B) and ink (both sides).
//
// Only live-activity.ts loads this file, and only in a build that has the
// widget extension (nativeCapabilities().liveActivity). Expo Go never does.

/** What the lock-screen widget shows: the running clock, or a quiet line when none runs. */
export interface TimerWidgetProps {
  state: TimerActivityState | null;
  idleTitle: string;
  idleLine: string;
}

const DebateTimerActivity = (props: TimerActivityState, environment: LiveActivityEnvironment) => {
  'widget';
  const HOUR = 3_600_000;
  const accent = props.side === 'a' ? '#4CA6FD' : props.side === 'b' ? '#FF8A8E' : '#A9B7C9';
  const at = props.pausedAt ?? Date.now();
  // A speech past its limit counts on as overtime; iOS marks the activity stale at the limit.
  const over = props.kind === 'speech' && (environment.isStale === true || at >= props.endsAt);
  const pauseTime = props.pausedAt === null ? undefined : new Date(props.pausedAt);
  const status = over ? props.labels.overtime : props.pausedAt !== null ? props.labels.paused : props.kind === 'prep' ? props.labels.prep : props.labels.speaking;
  const clock = (size: number) =>
    over ? (
      <Text
        timerInterval={{ lower: new Date(props.endsAt), upper: new Date(props.endsAt + HOUR) }}
        countsDown={false}
        pauseTime={pauseTime}
        modifiers={[font({ size, weight: 'bold', design: 'rounded' }), monospacedDigit(), foregroundStyle('#FF6B70')]}
      />
    ) : (
      <Text
        timerInterval={{ lower: new Date(props.startedAt), upper: new Date(props.endsAt) }}
        countsDown
        pauseTime={pauseTime}
        modifiers={[font({ size, weight: 'bold', design: 'rounded' }), monospacedDigit()]}
      />
    );
  const icon = props.kind === 'prep' ? 'hourglass' : props.pausedAt !== null ? 'pause.fill' : 'timer';
  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 })]}>
        <VStack alignment="leading" spacing={3}>
          <HStack spacing={6}>
            <Image systemName={icon} color={accent} size={15} />
            <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(accent)]}>{props.title}</Text>
          </HStack>
          <Text modifiers={[font({ size: 13 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(1)]}>{props.line}</Text>
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>{status}</Text>
        </VStack>
        <Spacer />
        {clock(40)}
      </HStack>
    ),
    compactLeading: <Image systemName={icon} color={accent} />,
    compactTrailing: clock(15),
    minimal: <Image systemName={icon} color={accent} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 6 })]}>
        <Text modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(accent)]}>{props.title}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>{status}</Text>
      </VStack>
    ),
    expandedTrailing: <VStack modifiers={[padding({ trailing: 6 })]}>{clock(30)}</VStack>,
    expandedBottom: (
      <Text modifiers={[font({ size: 13 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(1)]}>{props.line}</Text>
    ),
  };
};

const DebateTimerWidget = (props: TimerWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const state = props.state;
  if (!state) {
    if (environment.widgetFamily === 'accessoryInline') return <Text>{props.idleTitle}</Text>;
    if (environment.widgetFamily === 'accessoryCircular') return <Image systemName="timer" size={24} />;
    return (
      <VStack alignment="leading" spacing={1}>
        <HStack spacing={4}>
          <Image systemName="timer" size={13} />
          <Text modifiers={[font({ size: 14, weight: 'semibold' })]}>{props.idleTitle}</Text>
        </HStack>
        <Text modifiers={[font({ size: 13 }), lineLimit(2)]}>{props.idleLine}</Text>
      </VStack>
    );
  }
  const HOUR = 3_600_000;
  // The app adds a timeline entry at the limit, so the widget turns to overtime on time.
  const at = state.pausedAt ?? environment.date.getTime();
  const over = state.kind === 'speech' && at >= state.endsAt;
  const pauseTime = state.pausedAt === null ? undefined : new Date(state.pausedAt);
  const status = over ? state.labels.overtime : state.pausedAt !== null ? state.labels.paused : state.kind === 'prep' ? state.labels.prep : state.labels.speaking;
  const clock = (size: number) =>
    over ? (
      <Text
        timerInterval={{ lower: new Date(state.endsAt), upper: new Date(state.endsAt + HOUR) }}
        countsDown={false}
        pauseTime={pauseTime}
        modifiers={[font({ size, weight: 'bold', design: 'rounded' }), monospacedDigit()]}
      />
    ) : (
      <Text
        timerInterval={{ lower: new Date(state.startedAt), upper: new Date(state.endsAt) }}
        countsDown
        pauseTime={pauseTime}
        modifiers={[font({ size, weight: 'bold', design: 'rounded' }), monospacedDigit()]}
      />
    );
  if (environment.widgetFamily === 'accessoryInline') {
    return (
      <HStack>
        <Text>{`${state.title} `}</Text>
        {clock(14)}
      </HStack>
    );
  }
  if (environment.widgetFamily === 'accessoryCircular') {
    return (
      <VStack spacing={0}>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), lineLimit(1)]}>{state.title}</Text>
        {clock(15)}
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={0}>
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>{`${state.title} · ${status}`}</Text>
      {clock(26)}
    </VStack>
  );
};

export const timerActivity = createLiveActivity<TimerActivityState>('DebateTimerActivity', DebateTimerActivity);
export const timerWidget = createWidget<TimerWidgetProps>('DebateTimerWidget', DebateTimerWidget);
