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
      name: 'business-module-cross-import',
      severity: 'warn',
      comment:
        'Import sibling business modules only via their index.js facade or cross-cut-modules (warn until legacy paths migrated)',
      from: { path: '^business_modules/([^/]+)/' },
      to: {
        path: '^business_modules/([^/]+)/',
        pathNot: [
          '^business_modules/$1/',
          '^business_modules/[^/]+/index.js$',
        ],
      },
    },
    {
      name: 'cross-cut-no-business-internals',
      severity: 'warn',
      comment:
        'Cross-cut modules should not import business module internals (warn until wired via composition)',
      from: { path: '^cross-cut-modules/' },
      to: {
        path: '^business_modules/[^/]+/(app|domain|infrastructure|input)/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules', 'client/dist', 'tools/docs-site', 'analyst-site', 'tests', 'scripts'],
    },
    tsPreCompilationDeps: false,
    combinedDependencies: true,
    exclude: {
      path: ['node_modules', 'client/dist', 'tools/docs-site', 'analyst-site'],
    },
  },
  allowed: [
    {
      from: { path: '^business_modules/' },
      to: {
        path: '^business_modules/(audio|geo|pbo_report_|pool|radio|resilience|scheduled_stream_capture|signals_extraction|video)/',
        pathNot: ['^business_modules/[^/]+/index.js$'],
      },
    },
    {
      from: { path: '^cross-cut-modules/' },
      to: { path: '^business_modules/' },
    },
  ],
};
