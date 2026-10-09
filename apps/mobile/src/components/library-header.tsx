import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/use-theme';

export type AddSourceKind = 'link' | 'note';

/**
 * The Library's large title and its round plus button, which opens a native
 * menu. "Scan pages" and "Choose a file" from the mock are not in the app yet.
 */
export function LibraryHeader({ title, onAdd, disabled }: { title: string; onAdd: (kind: AddSourceKind) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          icon="plus"
          variant="prominent"
          tintColor={colors.primary}
          disabled={disabled}
          accessibilityLabel={t('mobile.library.add')}>
          <Stack.Toolbar.MenuAction icon="link" onPress={() => onAdd('link')}>
            {t('mobile.library.pasteLink')}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="pencil.line" onPress={() => onAdd('note')}>
            {t('mobile.library.writeNote')}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}
