import { loadJamRecorder } from './jam-loader';

void loadJamRecorder()
  .catch((): undefined => undefined)
  .then(() => import('./main'));
