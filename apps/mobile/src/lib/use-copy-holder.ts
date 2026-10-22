import { useEffect, useState } from 'react';

import { CopyHolder } from './offline-cache';

/**
 * A CopyHolder for one screen's reads; the copies it shows stop counting when
 * the screen closes. A screen that also shows what another screen read for it
 * passes the holder they share.
 */
export function useCopyHolder(shared?: CopyHolder): CopyHolder {
  const [holder] = useState(() => shared ?? new CopyHolder());
  useEffect(() => () => holder.release(), [holder]);
  return holder;
}
