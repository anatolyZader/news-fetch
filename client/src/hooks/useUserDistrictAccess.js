import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Loads user home-front district access (`GET /api/user/district-access`).
 */
export function useUserDistrictAccess() {
  const { getIdToken, apiReady } = useAuth();
  const [access, setAccess] = useState(null);
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
        const res = await fetch('/api/user/district-access', { headers });
        if (res.ok) {
          const body = await res.json();
          if (!cancelled) setAccess(body);
        } else if (!cancelled) {
          setAccess({ enforcementEnabled: false, unrestricted: true, districtIds: [], allowedReportScopes: [] });
        }
      } catch {
        if (!cancelled) {
          setAccess({ enforcementEnabled: false, unrestricted: true, districtIds: [], allowedReportScopes: [] });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [apiReady, getIdToken]);

  return { access, ready };
}
