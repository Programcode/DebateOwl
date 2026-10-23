import { useTranslation } from 'react-i18next';

export const MAIN_CONTENT_ID = 'main-content';

/**
 * The first Tab stop on a page: hidden until focused, then it jumps past the header.
 * Focus moves to the main landmark without adding a hash route to the URL. The landmark
 * is focusable only for that jump, so a click elsewhere in it still leaves focus on body.
 */
export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        const target = document.getElementById(MAIN_CONTENT_ID);
        if (!target) return;
        event.preventDefault();
        if (!target.hasAttribute('tabindex')) {
          target.setAttribute('tabindex', '-1');
          target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
        }
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start' });
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-background focus:px-4 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
    >
      {t('common.skipToContent', 'Skip to main content')}
    </a>
  );
}
