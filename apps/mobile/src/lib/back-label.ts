import type { TFunction } from 'i18next';

/** The back button names the tab a document was opened from, as mock 03's "Prepare". */
export function backLabel(t: TFunction, from: string | undefined, fallback: 'debate' | 'prepare' | 'practice'): string {
  const tab = from === 'debate' || from === 'prepare' || from === 'practice' ? from : from ? null : fallback;
  return tab ? t(`mobile.tabs.${tab}`) : t('common.back');
}
