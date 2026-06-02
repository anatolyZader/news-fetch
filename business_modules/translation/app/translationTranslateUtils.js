export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getErrStatus(err) {
  return err?.status ?? err?.statusCode ?? err?.response?.status ?? err?.cause?.status;
}

export function isTransientTranslateError(err) {
  const status = getErrStatus(err);
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 524) {
    return true;
  }
  const msg = String(err?.message ?? '');
  return (
    /\b524\b/.test(msg) ||
    /\b502\b/.test(msg) ||
    /\b503\b/.test(msg) ||
    /\b504\b/.test(msg) ||
    /\btimeout\b/i.test(msg) ||
    /\betimedout\b/i.test(msg) ||
    /\beconnreset\b/i.test(msg)
  );
}

export async function runWithConcurrencyLimit(taskFns, limit) {
  const n = taskFns.length;
  if (n === 0) return [];
  const results = new Array(n);
  let nextIdx = 0;

  const workers = new Array(Math.min(limit, n)).fill(0).map(async () => {
    while (true) {
      const idx = nextIdx;
      nextIdx += 1;
      if (idx >= n) break;
      results[idx] = await taskFns[idx]();
    }
  });

  await Promise.all(workers);
  return results;
}
