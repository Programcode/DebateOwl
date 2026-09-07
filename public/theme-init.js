// Prevent flash of wrong theme before React mounts.
(function () {
  try {
    var pathname = window.location.pathname;
    if (pathname === '/app' || pathname.indexOf('/app/') === 0) {
      document.documentElement.classList.add('app-shell');
    }
  } catch {
    // Ignore unavailable location or document globals.
  }

  try {
    var settings = JSON.parse(localStorage.getItem('debate-trainer-settings') || '{}');
    var theme = settings && settings.state && settings.state.theme;
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else if (theme === 'light') document.documentElement.classList.add('light');
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark');
  } catch {
    // Ignore unavailable or malformed browser storage and use the default theme.
  }
})();
