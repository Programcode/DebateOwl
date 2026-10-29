import { Capsule, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, lineLimit, monospacedDigit, padding, resizable } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { GeneratingActivityState } from '@/lib/generating-activity-state';

// A case, attack, brainstorm or factoids run on the Lock Screen and in the
// Dynamic Island while the model writes it: Ollie in the pose the app's own
// live draft uses, the step it is on, how many parts are written, and the time
// since it started (a SwiftUI timer text, so it counts without the app).
// Like timer-widgets.tsx, the layout runs in the widget extension's own runtime
// ('widget' directive): no imports or outside names, every string in the props.
//
// The app is suspended soon after it leaves the screen, and the stream stops
// with it. The activity then goes stale (generating-activity.ts sets the date),
// and says to open DebateOwl, which picks the answer up from the server.
//
// Only generating-activity.ts loads this file, and only in a build that has
// the widget extension (nativeCapabilities().liveActivity). Expo Go never does.

const GeneratingActivity = (props: GeneratingActivityState, environment: LiveActivityEnvironment) => {
  'widget';
  const BLUE = '#4CA6FD';
  const MINT = '#2FD39A';
  const CORAL = '#FF6B70';
  const TRACK = '#8E9FB666';
  const waiting = props.status === 'working' && environment.isStale === true;
  const accent = props.status === 'done' ? MINT : props.status === 'failed' ? CORAL : BLUE;
  const headline =
    props.status === 'done' ? props.labels.done : props.status === 'failed' ? props.labels.failed : waiting ? props.labels.waiting : props.phaseLabel;
  const symbol =
    props.status === 'done' ? 'checkmark.circle.fill' : props.status === 'failed' ? 'exclamationmark.circle.fill' : waiting ? 'hand.tap.fill' : 'sparkles';
  const owlUri = props.status === 'done' ? props.owls.done : props.status === 'failed' ? props.owls.failed : props.owls[props.phase];
  const owl = (size: number) =>
    owlUri ? (
      <Image uiImage={owlUri} modifiers={[resizable(), frame({ width: size, height: size })]} />
    ) : (
      <Image systemName={symbol} color={accent} size={size * 0.6} />
    );
  const elapsed = (size: number) =>
    props.status === 'working' ? (
      <Text
        timerInterval={{ lower: new Date(props.startedAt), upper: new Date(props.startedAt + 3_600_000) }}
        countsDown={false}
        modifiers={[font({ size, weight: 'semibold', design: 'rounded' }), monospacedDigit(), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}
      />
    ) : (
      <Image systemName={symbol} color={accent} size={size} />
    );
  // Research, write, check: filled up to the step the run is on; all three when it is done.
  const reached = props.status === 'done' ? 3 : props.phase === 'checking' ? 3 : props.phase === 'writing' ? 2 : 1;
  const steps = (width: number) => (
    <HStack spacing={4}>
      <Capsule modifiers={[frame({ width, height: 5 }), foregroundStyle(reached >= 1 ? accent : TRACK)]} />
      <Capsule modifiers={[frame({ width, height: 5 }), foregroundStyle(reached >= 2 ? accent : TRACK)]} />
      <Capsule modifiers={[frame({ width, height: 5 }), foregroundStyle(reached >= 3 ? accent : TRACK)]} />
    </HStack>
  );
  const detail = props.status === 'working' && props.partsLabel && !waiting ? `${props.title} · ${props.partsLabel}` : props.title;

  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 })]}>
        {owl(52)}
        <VStack alignment="leading" spacing={4}>
          <HStack spacing={6}>
            <Text modifiers={[font({ size: 13, weight: 'bold', design: 'rounded' }), foregroundStyle(accent), lineLimit(1)]}>{props.tool}</Text>
            <Spacer />
            {elapsed(13)}
          </HStack>
          <Text modifiers={[font({ size: 17, weight: 'semibold', design: 'rounded' }), lineLimit(1)]}>{headline}</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(1)]}>{detail}</Text>
          {props.status === 'failed' || waiting ? null : steps(40)}
        </VStack>
      </HStack>
    ),
    compactLeading: owlUri ? owl(22) : <Image systemName={symbol} color={accent} />,
    compactTrailing: props.status === 'working' && !waiting ? elapsed(14) : <Image systemName={symbol} color={accent} />,
    minimal: <Image systemName={symbol} color={accent} />,
    expandedLeading: <VStack modifiers={[padding({ leading: 6, top: 4 })]}>{owl(44)}</VStack>,
    expandedCenter: (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 13, weight: 'bold', design: 'rounded' }), foregroundStyle(accent), lineLimit(1)]}>{props.tool}</Text>
        <Text modifiers={[font({ size: 16, weight: 'semibold', design: 'rounded' }), lineLimit(1)]}>{headline}</Text>
      </VStack>
    ),
    expandedTrailing: <VStack modifiers={[padding({ trailing: 6, top: 4 })]}>{elapsed(15)}</VStack>,
    expandedBottom: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ horizontal: 6 })]}>
        <Text modifiers={[font({ size: 13 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(1)]}>{detail}</Text>
        {props.status === 'failed' || waiting ? null : steps(88)}
      </VStack>
    ),
  };
};

export const generatingActivity = createLiveActivity<GeneratingActivityState>('DebateOwlGenerating', GeneratingActivity);
