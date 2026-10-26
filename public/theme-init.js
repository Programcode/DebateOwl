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
    var privateRoute = pathname === '/app' || pathname.indexOf('/app/') === 0
      || pathname === '/login' || pathname === '/auth/callback'
      || pathname === '/share' || pathname.indexOf('/share/') === 0;
    if (pathname === '/app' || pathname.indexOf('/app/') === 0 || pathname === '/login' || pathname === '/auth/callback') {
      document.documentElement.classList.add('app-shell');
    }
    // The shell HTML is noindex. Private routes keep that. The sources page is
    // public, including when the app-shell rewrite serves this document.
    var robots = document.querySelector('meta[name="robots"]');
    if (robots && privateRoute) robots.setAttribute('content', 'noindex, nofollow');
    else if (robots && pathname === '/expocit/sources') {
      robots.setAttribute('content', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
    }
  } catch {
    // Ignore unavailable location or document globals.
  }

  try {
    var settings = JSON.parse(localStorage.getItem('debate-trainer-settings') || '{}');
    var theme = settings && settings.state && settings.state.theme;
    // Light is the default; only an explicit System choice follows the device.
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else if (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark');
    else document.documentElement.classList.add('light');
  } catch {
    // Ignore unavailable or malformed browser storage and use the default theme.
  }
})();
