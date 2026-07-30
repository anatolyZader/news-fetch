import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Whether the signed-in user may request analyst display (`?view=analyst`).
 */
export function useDisplayCapabilities() {
  const { getIdToken, apiReady, user } = useAuth();
  const [canViewAnalyst, setCanViewAnalyst] = useState(false);
  const [showBudgetPanel, setShowBudgetPanel] = useState(false);
  const [canControlBudget, setCanControlBudget] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    (async () => {
      setReady(false);
      const headers = new Headers();
      const token = await getIdToken();
      if (cancelled) return;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      try {
        const res = await fetch('/api/resilience/display-capabilities', { headers });
        if (res.ok) {
          const body = await res.json();
          if (!cancelled) {
            setCanViewAnalyst(body.canViewAnalyst === true);
            setShowBudgetPanel(body.showBudgetPanel === true || body.canViewAnalyst === true);
            setCanControlBudget(body.canControlBudget === true || body.canViewAnalyst === true);
          }
        } else if (!cancelled) {
          setCanViewAnalyst(false);
          setShowBudgetPanel(false);
          setCanControlBudget(false);
        }
      } catch {
        if (!cancelled) {
          setCanViewAnalyst(false);
          setShowBudgetPanel(false);
          setCanControlBudget(false);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [apiReady, getIdToken, user?.email]);

  return { canViewAnalyst, showBudgetPanel, canControlBudget, ready };
}
