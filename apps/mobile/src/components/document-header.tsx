import { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import type { IconName } from './icon-paths';

import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

type SFSymbol = Extract<ComponentProps<typeof Stack.Toolbar.MenuAction>['icon'], string>;

export interface HeaderAction {
  key: string;
  label: string;
  /** The SF Symbol on iOS, and the icon the web preview draws. */
  symbol: SFSymbol;
  icon: IconName;
  destructive?: boolean;
  onPress: () => void;
}

/** A button of its own in the bar, such as the Flowchart's "+". */
export interface HeaderButton {
  key: string;
  label: string;
  symbol: SFSymbol;
  icon: IconName;
  onPress: () => void;
}

/**
 * The document's navigation bar from mock 03: back to where it was opened,
 * a share button and a "..." menu, in the native iOS header.
 */
export function DocumentHeader({ backLabel, onShare, actions, buttons = [] }: { backLabel: string; onShare?: () => void; actions: HeaderAction[]; buttons?: HeaderButton[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerBackTitle: backLabel,
          headerBackTitleStyle: { fontFamily: fontFamily.regular },
          headerTransparent: true,
          headerBlurEffect: 'systemMaterial',
          headerShadowVisible: false,
          headerTintColor: colors.primary,
        }}
      />
      <Stack.Toolbar placement="right">
        {buttons.map((button) => (
          <Stack.Toolbar.Button key={button.key} icon={button.symbol} tintColor={colors.primary} onPress={button.onPress} accessibilityLabel={button.label} />
        ))}
        {onShare ? <Stack.Toolbar.Button icon="square.and.arrow.up" tintColor={colors.primary} onPress={onShare} accessibilityLabel={t('mobile.results.share')} /> : null}
        {actions.length > 0 ? (
          <Stack.Toolbar.Menu icon="ellipsis" tintColor={colors.primary} accessibilityLabel={t('nav.more')}>
            {actions.map((action) => (
              <Stack.Toolbar.MenuAction key={action.key} icon={action.symbol} destructive={action.destructive} onPress={action.onPress}>
                {action.label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        ) : null}
      </Stack.Toolbar>
    </>
  );
}
