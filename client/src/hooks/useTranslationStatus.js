import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Translation feature flags from GET /api/resilience/display-capabilities.
 */
export function useTranslationStatus() {
  const { getIdToken, apiReady } = useAuth();
  const [status, setStatus] = useState({
    translationEnabled: false,
    supportedLocales: ['en', 'he', 'ru'],
    pretranslateConfigured: false,
    ready: false,
  });

  useEffect(() => {
    if (!apiReady) return undefined;
    let cancelled = false;
    void (async () => {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      try {
        const res = await fetch('/api/resilience/display-capabilities', { headers });
        if (!res.ok) throw new Error('status fetch failed');
        const body = await res.json();
        if (!cancelled) {
          setStatus({
            translationEnabled: body.translationEnabled === true,
            supportedLocales: Array.isArray(body.supportedLocales)
              ? body.supportedLocales
              : ['en', 'he', 'ru'],
            pretranslateConfigured: body.pretranslateConfigured === true,
            ready: true,
          });
        }
      } catch {
        if (!cancelled) {
          setStatus((prev) => ({ ...prev, ready: true }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [apiReady, getIdToken]);

  return status;
}
