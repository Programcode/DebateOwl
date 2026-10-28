import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  resizable,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

// The Current Debate on the Home Screen (small and medium). expo-widgets
// serialises the function below and runs it in the widget extension's own
// runtime, which has only @expo/ui's SwiftUI views and modifiers: no hooks, no
// imports, nothing from outside the function body. Everything it shows comes
// in its props, written by src/lib/debate-widget.ts, which is also the only
// place that may import this file (creating the widget needs the native
// module, which Expo Go lacks). The name must match the widget entry in
// app.config.ts (withRound4).

export type WidgetStat = { value: number; label: string };

/** The DebateOwl colours the widget uses, from src/theme/colors.ts. */
export type WidgetColors = {
  background: string;
  heading: string;
  secondary: string;
  primary: string;
  primaryFill: string;
  onPrimary: string;
};

export type CurrentDebateWidgetProps = {
  /** The Current Debate's motion, or null when there is none (signed out or none started). */
  motion: string | null;
  /** "Current debate". */
  title: string;
  /** Sources, results and rounds, as the Debate tab shows them when it opens (the In favor side). */
  stats: WidgetStat[];
  /** The medium widget's row: sources, each side's results and rounds. */
  wideStats: WidgetStat[];
  spar: string;
  emptyTitle: string;
  emptyAction: string;
  openUrl: string;
  sparUrl: string;
  newDebateUrl: string;
  /** The owl mark in the shared App Group folder, or null to show a symbol instead. */
  owl: string | null;
  light: WidgetColors;
  dark: WidgetColors;
};

const CurrentDebateWidget = (props: CurrentDebateWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const colors = environment.colorScheme === 'dark' ? props.dark : props.light;
  const medium = environment.widgetFamily === 'systemMedium';
  const mark = props.owl ? (
    <Image uiImage={props.owl} modifiers={[resizable(), frame({ width: medium ? 22 : 18, height: medium ? 22 : 18 })]} />
  ) : (
    <Image systemName="bubble.left.and.bubble.right.fill" size={medium ? 16 : 14} color={colors.primary} />
  );
  const header = (
    <HStack spacing={6}>
      {mark}
      <Text
        modifiers={[
          font({ size: 12, weight: 'bold', design: 'rounded' }),
          foregroundStyle(colors.secondary),
          lineLimit(1),
        ]}>
        {props.title}
      </Text>
    </HStack>
  );

  if (props.motion === null) {
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[containerBackground(colors.background, 'widget'), widgetURL(props.newDebateUrl)]}>
        {header}
        <Spacer />
        <Text
          modifiers={[
            font({ size: medium ? 17 : 15, weight: 'semibold', design: 'rounded' }),
            foregroundStyle(colors.heading),
            lineLimit(2),
          ]}>
          {props.emptyTitle}
        </Text>
        <Text
          modifiers={[
            font({ size: 13, weight: 'bold', design: 'rounded' }),
            foregroundStyle(colors.primary),
            lineLimit(1),
          ]}>
          {props.emptyAction}
        </Text>
      </VStack>
    );
  }

  const row = (medium ? props.wideStats : props.stats).map((stat) => (
    <VStack key={stat.label} alignment="leading" spacing={0}>
      <Text modifiers={[font({ size: medium ? 20 : 17, weight: 'bold', design: 'rounded' }), foregroundStyle(colors.primary)]}>
        {String(stat.value)}
      </Text>
      <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(colors.secondary), lineLimit(1)]}>
        {stat.label}
      </Text>
    </VStack>
  ));

  return (
    <VStack
      alignment="leading"
      spacing={medium ? 8 : 6}
      modifiers={[containerBackground(colors.background, 'widget'), widgetURL(props.openUrl)]}>
      <HStack>
        {header}
        <Spacer />
        {medium ? (
          <Link destination={props.sparUrl}>
            <Text
              modifiers={[
                font({ size: 13, weight: 'bold', design: 'rounded' }),
                foregroundStyle(colors.onPrimary),
                padding({ horizontal: 12, vertical: 5 }),
                background(colors.primaryFill),
                clipShape('capsule'),
              ]}>
              {props.spar}
            </Text>
          </Link>
        ) : null}
      </HStack>
      <Text
        modifiers={[
          font({ size: medium ? 16 : 14, weight: 'semibold', design: 'rounded' }),
          foregroundStyle(colors.heading),
          lineLimit(medium ? 3 : 4),
        ]}>
        {props.motion}
      </Text>
      <Spacer />
      <HStack spacing={medium ? 16 : 10}>{row}</HStack>
    </VStack>
  );
};

export default createWidget<CurrentDebateWidgetProps>('CurrentDebate', CurrentDebateWidget);
