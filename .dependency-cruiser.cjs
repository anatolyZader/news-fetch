/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-infrastructure',
      severity: 'error',
      comment: 'Domain layer must not import infrastructure or app layers',
      from: { path: '^business_modules/[^/]+/domain/' },
      to: {
        path: '^business_modules/[^/]+/(infrastructure|app)/',
      },
    },
    {
      name: 'domain-no-input',
      severity: 'error',
      comment: 'Domain layer must not import input/ transport layer',
      from: { path: '^business_modules/[^/]+/domain/' },
      to: {
        path: '^business_modules/[^/]+/input/',
      },
    },
    {
      name: 'business-module-cross-import',
      severity: 'error',
      comment:
        'Import sibling business modules only via their index.js facade or cross-cut-modules',
      from: { path: '^business_modules/([^/]+)/' },
      to: {
        path: '^business_modules/([^/]+)/',
        pathNot: [
          '^business_modules/$1/',
          '^business_modules/[^/]+/index.js$',
          '^business_modules/resilience_scorer/analyst/',
        ],
      },
    },
    {
      name: 'cross-cut-no-business-internals',
      severity: 'error',
      comment:
        'Cross-cut modules should not import business module internals (wire via composition or facades)',
      from: { path: '^cross-cut-modules/' },
      to: {
        path: '^business_modules/[^/]+/(app|domain|infrastructure|input)/',
        pathNot: '^business_modules/[^/]+/index.js$',
      },
    },
    {
      name: 'app-no-sibling-infrastructure',
      severity: 'error',
      comment: 'App layer must not import another module infrastructure/',
      from: { path: '^business_modules/([^/]+)/app/' },
      to: {
        path: '^business_modules/([^/]+)/infrastructure/',
        pathNot: '^business_modules/$1/infrastructure/',
      },
    },
    {
      name: 'cross-module-infrastructure-outside-composition',
      severity: 'error',
      comment:
        'Cross-module infrastructure imports are allowed only from composition/ (same-module infra OK)',
      from: { path: '^business_modules/([^/]+)/' },
      to: {
        path: '^business_modules/([^/]+)/infrastructure/',
        pathNot: '^business_modules/$1/infrastructure/',
      },
    },
    {
      name: 'cross-cut-no-business-infrastructure',
      severity: 'error',
      comment: 'Cross-cut modules must not import business module infrastructure/',
      from: { path: '^cross-cut-modules/' },
      to: {
        path: '^business_modules/[^/]+/infrastructure/',
        pathNot: '^business_modules/[^/]+/index.js$',
      },
    },
    {
      name: 'server-no-business-infrastructure',
      severity: 'error',
      comment: 'server.js must not import business module infrastructure/ (wire in composition/)',
      from: { path: String.raw`^server\.js$` },
      to: { path: '^business_modules/[^/]+/infrastructure/' },
    },
    {
      name: 'resilience-no-analyst-except-facades',
      severity: 'error',
      comment:
        'Operator resilience code must not import analyst/ except scoringFacade, shadowFacade, validation store wiring',
      from: {
        path: '^business_modules/resilience_scorer/',
        pathNot: [
          '^business_modules/resilience_scorer/app/scoringFacade\\.js$',
          '^business_modules/resilience_scorer/app/shadowFacade\\.js$',
          '^business_modules/resilience_scorer/app/assessment/socialQuarantineWiring\\.js$',
          '^business_modules/resilience_scorer/app/assessment/assessSignalsCli\\.js$',
          '^business_modules/resilience_scorer/app/assessment/assessmentStage\\.js$',
          '^business_modules/resilience_scorer/domain/services/socialQuarantineOverrides\\.js$',
          '^business_modules/resilience_scorer/analyst/',
        ],
      },
      to: { path: '^business_modules/resilience_scorer/analyst/' },
    },
    {
      name: 'client-no-analyst',
      severity: 'error',
      comment: 'Operator client must not import analyst quarantine code',
      from: { path: '^client/' },
      to: { path: '^business_modules/resilience_scorer/analyst/' },
    },
    {
      name: 'infrastructure-no-app',
      severity: 'error',
      comment:
        'Infrastructure must not import app/ (depend on domain/ports only) — sole exception: app/scoringFacade.js, the sanctioned layer-neutral bridge into analyst/. Scoped to resilience_scorer for now: chat/ and translation/ carry pre-existing infra→app edges (see docs/reviews/resilience_scorer-review-2026-07-18.md).',
      from: { path: '^business_modules/resilience_scorer/infrastructure/' },
      to: {
        path: '^business_modules/resilience_scorer/app/',
        pathNot: ['^business_modules/resilience_scorer/app/scoringFacade\\.js$'],
      },
    },
    {
      name: 'input-no-own-domain-or-infrastructure',
      severity: 'error',
      comment: 'Option B: input/ may only delegate to app/ or index.js (not own domain/ or infrastructure/)',
      from: { path: '^business_modules/([^/]+)/input/' },
      to: {
        path: '^business_modules/$1/(domain|infrastructure)/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules', 'client/dist', 'tools/docs-site', 'tests', 'scripts'],
    },
    tsPreCompilationDeps: false,
    combinedDependencies: true,
    exclude: {
      path: ['node_modules', 'client/dist', 'tools/docs-site'],
    },
  },
};
