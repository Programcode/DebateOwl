// Runs before the app's own scripts in every document (web({ initScripts })).
// It records what the page hides from the screen: uncaught errors, rejected
// promises, console.error, 5xx answers from Supabase, and PostgREST 406s. The
// student fixture reads the list at teardown and fails the test on anything it
// does not expect.
// sessionStorage keeps the list across reloads and navigations in the tab.
(() => {
  const KEY = "__agentic_errors";
  const record = (kind, text) => {
    try {
      const list = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      if (list.length < 50) list.push(`${kind}: ${String(text).slice(0, 500)} [${location.pathname}]`);
      sessionStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      // Storage can be unavailable in an opaque-origin frame; nothing to record there.
    }
  };
  const describe = (value) => (value instanceof Error ? `${value.name}: ${value.message}` : typeof value === "string" ? value : (() => {
    try { return JSON.stringify(value); } catch { return String(value); }
  })());

  window.addEventListener("error", (event) => record("pageerror", event.error ? describe(event.error) : event.message));
  window.addEventListener("unhandledrejection", (event) => record("unhandledrejection", describe(event.reason)));

  const consoleError = console.error.bind(console);
  console.error = (...args) => {
    record("console.error", args.map(describe).join(" "));
    consoleError(...args);
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    // Recording must never change what the app's request returns.
    try {
      // PostgREST answers 406 when a query asks for exactly one row
      // (.single()) and gets none; a lookup that can miss uses .maybeSingle().
      if (response.status >= 500 || response.status === 406) {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (response.status >= 500 ? /^\/(functions|rest|auth)\//.test(url.pathname) : url.pathname.startsWith("/rest/")) {
          const method = (init && init.method) || (input instanceof Request ? input.method : "GET");
          record("http", `${response.status} ${method.toUpperCase()} ${url.pathname}`);
        }
      }
    } catch {
      // An input this script cannot parse is the app's business, not a finding.
    }
    return response;
  };
})();
