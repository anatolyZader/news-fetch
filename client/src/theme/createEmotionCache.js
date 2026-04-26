import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

const cacheRegistry = { ltr: null, rtl: null };

export function getEmotionCache(direction) {
  if (direction === 'rtl') {
    if (!cacheRegistry.rtl) {
      cacheRegistry.rtl = createCache({
        key: 'mui-rtl',
        stylisPlugins: [prefixer, rtlPlugin],
      });
    }
    return cacheRegistry.rtl;
  }
  if (!cacheRegistry.ltr) {
    cacheRegistry.ltr = createCache({ key: 'mui', stylisPlugins: [prefixer] });
  }
  return cacheRegistry.ltr;
}
