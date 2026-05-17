import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Whether the signed-in user may request analyst display (`?view=analyst`).
 */
export function useDisplayCapabilities() {
  const { getIdToken, apiReady } = useAuth();
  const [canViewAnalyst, setCanViewAnalyst] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    (async () => {
      const headers = new Headers();
      const token = await getIdToken();
      if (cancelled) return;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      try {
        const res = await fetch('/api/resilience/display-capabilities', { headers });
        if (res.ok) {
          const body = await res.json();
          if (!cancelled) setCanViewAnalyst(body.canViewAnalyst === true);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [apiReady, getIdToken]);

  return { canViewAnalyst, ready };
}
