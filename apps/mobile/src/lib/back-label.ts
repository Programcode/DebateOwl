import type { TFunction } from 'i18next';

/** The back button names the tab a document was opened from, as mock 03's "Prepare", or History. */
export function backLabel(t: TFunction, from: string | undefined, fallback: 'debate' | 'prepare' | 'practice'): string {
  if (from === 'history') return t('historyPage.title');
  if (from === 'you') return t('mobile.tabs.you');
  if (from === 'library') return t('mobile.tabs.library');
  const tab = from === 'debate' || from === 'prepare' || from === 'practice' ? from : from ? null : fallback;
  return tab ? t(`mobile.tabs.${tab}`) : t('common.back');
}
