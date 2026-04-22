// Docusaurus MDX expects a default export for @theme/SchemaTabs.
// The upstream theme is shipped as CommonJS; use require() for interop.
// eslint-disable-next-line global-require, import/no-commonjs
const mod = require('docusaurus-theme-openapi-docs/lib/theme/SchemaTabs');

// eslint-disable-next-line import/no-commonjs
module.exports = mod?.default ?? mod;

