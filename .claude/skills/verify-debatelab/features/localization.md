# Localization

The interface runs in English, Spanish and Hungarian. Every page names itself in the tab title in the interface language ("Generálás · DebateOwl" in the app, "Felhasználási feltételek | DebateOwl by Pi-Stack" on public pages), form validation and server refusals read in that language, the language switcher sits in every header, and `?lang=es|hu|en` links and the Hungarian and Spanish pages (`/hu`, `/es`, `/hu/tools/…`, `/es/tools/…`) open the app in that language.

## Sub-features

- loc-titles: `document.title` on app and public routes, per language, and a switch retitling the page without a reload. App routes read `<page> · DebateOwl` (`usePrivateRouteHead`); public pages use the `pageHead` catalog section (`usePageHead`), whose English text is also what the prerender writes.
- loc-validation: an empty Attack submit shows `validation.caseTextRequired` in the interface language, and nothing shows before the first submit. Generate, Brainstorm and Factoids use the same keys.
- loc-switcher: the switcher on `/login`, the 404 page, and the other public pages (`PublicPageShell`), besides the landing page and the app header.
- loc-links: `/?lang=hu` switches and saves the language, sets `<html lang>`, and drops the parameter; `/es` and `/hu` are prerendered pages of their own that keep their address, and Start from `/hu` leads into the app in Hungarian.
- loc-server-error: a refused promo code shows `serverErrors.promoInvalid` in the interface language while redeem-promo still answers in English beside its `code`.

## How to get to it (user POV)

- The globe button in any header, then a language under "Interface language".
- A link with `?lang=hu`, or the address `/hu` or `/es`.
- Settings, `Upgrade to Pro`, `Have a promo code?`, then an unknown code and `Apply`, for the translated refusal.

## Driving it with verify.sh + Playwright

```bash
$H drive recipes/localization --project desktop-chromium
$H drive recipes/localization --project mobile-chromium   # 375 px
```

`01-document-titles.json` in the loc-titles evidence lists the title of every route in each language.

## Gotchas

- The switcher's own name is translated (`langSwitcher.label`); match it in all three languages.
- The recipe reads the catalogs from `src/locales/`, so its expectations follow the strings. Match on keys, never on copied text.
- The promo field shows only for an account that would start a Checkout, so the recipe marks its Pro demo user expired first.
- `/es` and `/hu` are files in `dist/` (`hu/index.html`), listed with their tool pages in `src/config/localized-routes.json`. Choosing another language with the switcher on one of them moves to that language's address.
