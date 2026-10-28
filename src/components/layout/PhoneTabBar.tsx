import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Database, LayoutGrid, Settings, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRoutePrefetch } from '@/hooks/use-route-prefetch';
import { useCurrentDebate } from '@/lib/stores/debate-store';
import { navSectionFor } from '@/components/layout/nav-sections';
import { MAIN_CONTENT_ID } from '@/components/layout/SkipLink';
import { PHONE_TAB_MEDIA, isTextEntry, keyboardIsOpen, keyboardOverlap } from '@/components/layout/phone-tab-bar';

// Below `md` (768px) only. iPad portrait is 820px and keeps the header nav:
// four tabs would drop History and repeat the Current debate row already in the header.
const tabClass = cn(
  'flex min-h-14 min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5',
  'text-xs font-bold leading-tight text-muted-foreground transition-[color,background-color,transform] duration-150 active:scale-[0.97]',
  'motion-reduce:transition-none motion-reduce:active:scale-100',
);
const tabActiveClass = 'bg-brand-tint text-primary';

const tabs = [
  { to: '/app', key: 'tools', icon: LayoutGrid },
  { to: '/app/debate', key: 'currentDebate', icon: Target },
  { to: '/app/library', key: 'library', icon: Database },
  { to: '/app/settings', key: 'settings', icon: Settings },
] as const;

function pathOf(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

function PhoneTab({
  to,
  label,
  icon: Icon,
  active,
  current,
}: {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  active: boolean;
  current: boolean;
}) {
  const prefetch = useRoutePrefetch(to);
  return (
    <Link
      to={to}
      {...prefetch}
      aria-current={current ? 'page' : undefined}
      className={cn(tabClass, active && tabActiveClass)}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="block w-full text-balance text-center">{label}</span>
    </Link>
  );
}

function textEntryFocused() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  const inputType = active instanceof HTMLInputElement ? active.type : null;
  return isTextEntry(active.tagName, inputType, active.isContentEditable);
}

function moveFocusToMain() {
  const main = document.getElementById(MAIN_CONTENT_ID);
  if (!(main instanceof HTMLElement)) return;
  if (!main.hasAttribute('tabindex')) {
    main.setAttribute('tabindex', '-1');
    main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
  }
  main.focus({ preventScroll: true });
}

export function PhoneTabBar() {
  const { t } = useTranslation();
  const location = useLocation();
  const hasDebate = Boolean(useCurrentDebate());
  const section = navSectionFor(location.pathname, hasDebate);
  const path = pathOf(location.pathname);
  const navRef = useRef<HTMLElement>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardPx, setKeyboardPx] = useState(0);

  // The listener exists only while the tab bar does. Wider layouts never write
  // --native-keyboard-height, so main does not grow a keyboard pad there.
  useEffect(() => {
    const phone = window.matchMedia(PHONE_TAB_MEDIA);
    const viewport = window.visualViewport;
    let listening = false;

    const update = () => {
      if (!phone.matches || !viewport) return;
      const open = keyboardIsOpen(
        window.innerHeight,
        viewport.height,
        viewport.offsetTop,
        viewport.scale,
        textEntryFocused(),
      );
      if (open && navRef.current?.contains(document.activeElement)) moveFocusToMain();
      const overlap = open ? keyboardOverlap(window.innerHeight, viewport.height, viewport.offsetTop) : 0;
      setKeyboardOpen((current) => (current === open ? current : open));
      setKeyboardPx((current) => (current === overlap ? current : overlap));
    };
    const listen = () => {
      if (!viewport || listening) return;
      listening = true;
      viewport.addEventListener('resize', update);
      viewport.addEventListener('scroll', update);
      document.addEventListener('focusin', update);
      document.addEventListener('focusout', update);
    };
    const silence = () => {
      if (!viewport || !listening) return;
      listening = false;
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
    const sync = () => {
      if (!phone.matches) {
        silence();
        setKeyboardOpen(false);
        setKeyboardPx(0);
        return;
      }
      listen();
      update();
    };
    sync();
    phone.addEventListener('change', sync);
    return () => {
      silence();
      phone.removeEventListener('change', sync);
    };
  }, []);

  // The bar's real height, including the home-indicator inset, is what the page
  // pads by. A keyboard hides the bar, so the focused field can use that space.
  // At `md` and up both variables are removed, including a value left by a resize.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const phone = window.matchMedia(PHONE_TAB_MEDIA);
    const nav = navRef.current;
    const apply = () => {
      if (!phone.matches) {
        root.style.removeProperty('--phone-tab-reserve');
        root.style.removeProperty('--native-keyboard-height');
        return;
      }
      const reserve = !nav || keyboardOpen ? 0 : Math.round(nav.getBoundingClientRect().height);
      root.style.setProperty('--phone-tab-reserve', `${reserve}px`);
      root.style.setProperty('--native-keyboard-height', `${keyboardOpen ? keyboardPx : 0}px`);
    };
    apply();
    const observer = nav && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    if (nav && observer) observer.observe(nav);
    phone.addEventListener('change', apply);
    return () => {
      observer?.disconnect();
      phone.removeEventListener('change', apply);
      root.style.removeProperty('--phone-tab-reserve');
      root.style.removeProperty('--native-keyboard-height');
    };
  }, [keyboardOpen, keyboardPx]);

  return (
    <nav
      ref={navRef}
      aria-label={t('nav.mobileNavigation')}
      className={cn(
        'phone-tab-bar fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t-2 border-border bg-card/95 backdrop-blur-xl',
        'pl-(--native-safe-left) pr-(--native-safe-right) pb-(--native-safe-bottom) md:hidden',
        keyboardOpen && 'hidden',
      )}
    >
      {tabs.map((tab) => {
        // History, billing, and admin are not tabs, so none of these is current there.
        const active = tab.key === 'tools' ? section === 'tools'
          : tab.key === 'currentDebate' ? section === 'debate'
          : path === tab.to;
        return (
          <PhoneTab
            key={tab.to}
            to={tab.to}
            label={t(`nav.${tab.key}`)}
            icon={tab.icon}
            active={active}
            current={path === tab.to}
          />
        );
      })}
    </nav>
  );
}
