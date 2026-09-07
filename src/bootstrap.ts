import { loadJamRecorder } from './jam-loader';

function showBootstrapError() {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <main class="app-startup-shell app-bootstrap-error" data-bootstrap-error aria-label="DebateLab failed to load">
      <div class="app-startup-shell__card">
        <span class="app-startup-shell__brand">DebateLab</span>
        <h1>Unable to load DebateLab</h1>
        <p>Reload the page to try again.</p>
        <button type="button">Reload</button>
      </div>
    </main>
  `;
  root.querySelector<HTMLButtonElement>('button')?.addEventListener('click', () => window.location.reload());
}

void import('./main').catch(showBootstrapError);
void loadJamRecorder().catch((): undefined => undefined);
