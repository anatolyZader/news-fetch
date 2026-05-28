/**
 * SonarCloud API client for /fix-sonar (issue queue = IDE Connected Mode scope).
 */

const SONAR_API = 'https://sonarcloud.io/api';

/**
 * @param {string} token
 * @param {string} url
 */
async function sonarJson(token, url) {
  const res = await fetch(url, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${token}:`).toString('base64') },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status} ${text.slice(0, 300)}`);
  }
  if (!text.trim()) return {};
  return JSON.parse(text);
}

/**
 * @param {string} component
 */
export function componentPath(component) {
  if (!component) return '';
  const idx = component.indexOf(':');
  return idx >= 0 ? component.slice(idx + 1) : component;
}

/**
 * @param {Record<string, unknown>} issue
 */
export function normalizeIssue(issue) {
  return {
    kind: 'issue',
    key: issue.key,
    type: issue.type,
    severity: issue.severity,
    status: issue.status,
    rule: issue.rule,
    file: componentPath(issue.component),
    line: issue.line ?? issue.textRange?.startLine ?? null,
    column: issue.textRange?.startOffset ?? null,
    message: issue.message,
    effort: issue.effort ?? null,
    source: 'sonarcloud',
  };
}

/**
 * @param {Record<string, unknown>} hotspot
 */
export function normalizeHotspot(hotspot) {
  return {
    kind: 'hotspot',
    key: hotspot.key,
    type: 'SECURITY_HOTSPOT',
    severity: hotspot.vulnerabilityProbability ?? hotspot.priority ?? 'UNKNOWN',
    status: hotspot.status,
    rule: hotspot.ruleKey,
    file: componentPath(hotspot.component),
    line: hotspot.line ?? null,
    column: null,
    message: hotspot.message,
    effort: null,
    source: 'sonarcloud',
  };
}

/**
 * Sort issues: by file path, then line (matches IDE panel grouping).
 * @param {Array<Record<string, unknown>>} items
 */
export function sortIssues(items) {
  return [...items].sort((a, b) => {
    const fc = String(a.file).localeCompare(String(b.file));
    if (fc !== 0) return fc;
    return (Number(a.line) || 0) - (Number(b.line) || 0);
  });
}

/**
 * @param {object} opts
 * @param {string} opts.token
 * @param {string} opts.projectKey
 * @param {string} [opts.statuses]
 * @param {string} [opts.types]
 * @param {boolean} [opts.inNewCode]
 * @param {string} [opts.branch]
 * @param {number} [opts.limit] max items (default: all)
 */
async function fetchIssuePages(opts) {
  const pageSize = 100;
  const maxItems = opts.limit ?? Number.POSITIVE_INFINITY;
  /** @type {Array<Record<string, unknown>>} */
  const issues = [];

  for (let page = 1; issues.length < maxItems; page += 1) {
    const q = new URLSearchParams({
      componentKeys: opts.projectKey,
      statuses: opts.statuses ?? 'OPEN,CONFIRMED,REOPENED',
      types: opts.types ?? 'BUG,CODE_SMELL,VULNERABILITY',
      ps: String(pageSize),
      p: String(page),
    });
    if (opts.inNewCode) q.set('inNewCodePeriod', 'true');
    if (opts.branch) q.set('branch', opts.branch);

    const data = await sonarJson(opts.token, `${SONAR_API}/issues/search?${q}`);
    const batch = data.issues ?? [];
    if (!batch.length) break;
    issues.push(...batch.map(normalizeIssue));
    const total = data.paging?.total ?? 0;
    if (page * pageSize >= total) break;
  }

  return issues;
}

/**
 * @param {object} opts
 * @param {string} opts.token
 * @param {string} opts.projectKey
 * @param {boolean} [opts.inNewCode]
 * @param {string} [opts.branch]
 * @param {number} [opts.limit]
 */
async function fetchHotspotPages(opts) {
  const pageSize = 100;
  const maxItems = opts.limit ?? Number.POSITIVE_INFINITY;
  /** @type {Array<Record<string, unknown>>} */
  const hotspots = [];

  for (let page = 1; hotspots.length < maxItems; page += 1) {
    const q = new URLSearchParams({
      projectKey: opts.projectKey,
      status: 'TO_REVIEW',
      ps: String(pageSize),
      p: String(page),
    });
    if (opts.inNewCode) q.set('inNewCodePeriod', 'true');
    if (opts.branch) q.set('branch', opts.branch);

    const data = await sonarJson(opts.token, `${SONAR_API}/hotspots/search?${q}`);
    const batch = data.hotspots ?? [];
    if (!batch.length) break;
    hotspots.push(...batch.map(normalizeHotspot));
    if (page * pageSize >= (data.paging?.total ?? 0)) break;
  }

  return hotspots;
}

/**
 * @param {object} opts
 * @param {string} opts.token
 * @param {string} opts.projectKey
 * @param {string} [opts.statuses]
 * @param {string} [opts.types]
 * @param {boolean} [opts.inNewCode]
 * @param {string} [opts.branch]
 * @param {number} [opts.limit] max items (default: all)
 * @param {boolean} [opts.hotspots]
 */
export async function fetchSonarCloudIssues(opts) {
  const maxItems = opts.limit ?? Number.POSITIVE_INFINITY;
  const issues = await fetchIssuePages(opts);
  const hotspots = opts.hotspots ? await fetchHotspotPages(opts) : [];

  const rows = sortIssues([
    ...issues.slice(0, maxItems),
    ...hotspots.slice(0, Math.max(0, maxItems - issues.length)),
  ]);

  return {
    projectKey: opts.projectKey,
    inNewCodePeriod: opts.inNewCode ?? false,
    branch: opts.branch || null,
    source: 'sonarcloud',
    count: rows.length,
    total: rows.length,
    items: rows,
  };
}

/**
 * @param {string} token
 * @param {string} projectKey
 * @returns {Promise<string[]>} active rule keys e.g. javascript:S3776
 */
export async function fetchActiveRuleKeys(token, projectKey) {
  /** @type {string[]} */
  const rules = [];
  const pageSize = 100;

  for (let page = 1; ; page += 1) {
    const q = new URLSearchParams({
      qprofile: `project:${projectKey}`,
      ps: String(pageSize),
      p: String(page),
    });
    let data;
    try {
      data = await sonarJson(token, `${SONAR_API}/rules/search?${q}`);
    } catch {
      return rules;
    }
    const batch = data.rules ?? [];
    if (!batch.length) break;
    for (const r of batch) {
      if (r.key) rules.push(String(r.key));
    }
    if (page * pageSize >= (data.paging?.total ?? 0)) break;
  }

  return rules;
}
