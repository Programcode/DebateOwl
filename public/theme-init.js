// Prevent flash of wrong theme before React mounts.
(function () {
  function showBootstrapError() {
    var root = document.getElementById('root');
    if (!root || !root.querySelector('[data-startup-shell]')) return;

    root.innerHTML = '<main class="app-startup-shell app-bootstrap-error" data-bootstrap-error aria-label="DebateLab failed to load">'
      + '<div class="app-startup-shell__card"><span class="app-startup-shell__brand">DebateLab</span>'
      + '<h1>Unable to load DebateLab</h1><p>Reload the page to try again.</p>'
      + '<button type="button">Reload</button></div></main>';
    var button = root.querySelector('button');
    if (button) button.addEventListener('click', function () { window.location.reload(); });
  }

  window.__showDebateBootstrapError = showBootstrapError;
  window.addEventListener('error', function (event) {
    var target = event.target;
    if (target && target.tagName === 'SCRIPT' && target.type === 'module') showBootstrapError();
  }, true);

  try {
    var pathname = window.location.pathname;
    if (pathname === '/app' || pathname.indexOf('/app/') === 0 || pathname === '/login') {
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
