import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useDebates } from './debate-context';
import { isDebateInactive } from './debates';

// Asked once per debate while the app runs; Continue, Switch or Start new answers it.
const asked = new Set<string>();

/**
 * The website's inactive-debate check: after five days without work on the
 * Current Debate, the app asks whether the student is still preparing it.
 */
export function useInactiveDebateCheck() {
  const router = useRouter();
  const { status, current } = useDebates();
  useEffect(() => {
    if (status !== 'ready' || !current || asked.has(current.id) || !isDebateInactive(current)) return;
    const id = current.id;
    // Once the tabs have settled, so the sheet opens over them.
    const timer = setTimeout(() => {
      asked.add(id);
      router.push('/debate-check');
    }, 700);
    return () => clearTimeout(timer);
  }, [status, current, router]);
}
