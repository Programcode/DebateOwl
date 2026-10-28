// Entry for /embed/debate-timer, a separate page from the app: it renders the
// free timer and nothing else, so a framing site gets no network calls beyond
// these static assets.
import { createInstance } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/nunito';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/jetbrains-mono';
import '../index.css';
import toolsEn from '../locales/tools/en.json';
import toolsEs from '../locales/tools/es.json';
import toolsHu from '../locales/tools/hu.json';
import { DebateTimer } from '@/components/free-tools/DebateTimer';
import site from '@/config/site.json';

const params = new URLSearchParams(window.location.search);
const lang = ['en', 'es', 'hu'].includes(params.get('lang') ?? '') ? params.get('lang')! : 'en';
document.documentElement.lang = lang;

// ?theme=light|dark; otherwise the visitor's system setting.
const theme = params.get('theme');
const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.add(dark ? 'dark' : 'light');

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources: {
    // The clock announcer reads `clock.*` from the default namespace. The app's
    // catalogs are large, so the embed carries a copy of just those strings.
    en: { translation: { clock: toolsEn.embedClock }, tools: toolsEn },
    es: { translation: { clock: toolsEs.embedClock }, tools: toolsEs },
    hu: { translation: { clock: toolsHu.embedClock }, tools: toolsHu },
  },
  ns: ['translation', 'tools'],
  defaultNS: 'translation',
  lng: lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// An entry point, not a module other code imports: fast refresh does not apply.
// eslint-disable-next-line react-refresh/only-export-components
function EmbeddedTimer() {
  const { t } = useTranslation('tools');
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <DebateTimer storageKey="debatelab-embed-timer-v1" embedded />
      <p className="pb-3 text-center text-xs text-muted-foreground">
        <a href={`${site.origin}/tools/debate-timer`} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">
          {t('embed.attribution')}
        </a>
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<EmbeddedTimer />);
