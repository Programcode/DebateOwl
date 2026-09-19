import { scheduleJamRecorder } from './jam-loader';
import { mountApp } from './main';

const showBootstrapError = (): void => {
  (window as Window & { __showDebateBootstrapError?: () => void }).__showDebateBootstrapError?.();
};

try {
  mountApp();
} catch {
  showBootstrapError();
}
scheduleJamRecorder();
