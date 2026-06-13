import { useEffect, useState } from 'react';

/**
 * Bottom inset when the virtual keyboard shrinks visualViewport (mobile fixed UI).
 */
export function useVisualViewportInset() {
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    const vv = globalThis.visualViewport;
    if (!vv) return undefined;

    function update() {
      const layoutHeight = globalThis.innerHeight ?? 0;
      const visibleBottom = (vv.offsetTop ?? 0) + (vv.height ?? layoutHeight);
      const inset = Math.max(0, Math.round(layoutHeight - visibleBottom));
      setBottomInset(inset);
    }

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    globalThis.addEventListener('resize', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      globalThis.removeEventListener('resize', update);
    };
  }, []);

  return bottomInset;
}
