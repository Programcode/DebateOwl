import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import i18n, { appLanguageReady } from '@/i18n';
import { UrlLanguage } from '@/App';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { searchWithoutLanguage, urlLanguage } from '@/lib/url-language';

// IN-04: ?lang= links (and the /es and /hu redirects to them) open the app in that language.

function Where() {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname + search}</div>;
}

describe('?lang= links', () => {
  afterEach(async () => {
    useSettingsStore.getState().setLanguage('en');
    await appLanguageReady();
  });

  it('read only the app languages', () => {
    expect(urlLanguage('?lang=hu')).toBe('hu');
    expect(urlLanguage('?x=1&lang=ES')).toBe('es');
    expect(urlLanguage('?lang=fr')).toBeNull();
    expect(urlLanguage('')).toBeNull();
    expect(searchWithoutLanguage('?lang=hu&tab=saved')).toBe('?tab=saved');
    expect(searchWithoutLanguage('?lang=hu')).toBe('');
  });

  it('switch the language the way the switcher does and leave the address', async () => {
    render(
      <MemoryRouter initialEntries={['/?lang=hu&tab=saved#faq']}>
        <UrlLanguage />
        <Where />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/?tab=saved'));
    await appLanguageReady();
    expect(useSettingsStore.getState().language).toBe('hu');
    expect(i18n.language).toBe('hu');
    expect(document.documentElement.lang).toBe('hu');
  });
});
