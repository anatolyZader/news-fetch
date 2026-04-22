// @ts-check

const { themes: prismThemes } = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'VibeSwitch Docs',
  tagline: 'Production-grade documentation for VibeSwitch',
  url: 'https://docs.vibeswitch.ai',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  favicon: 'img/favicon.ico',

  organizationName: 'vibeswitch',
  projectName: 'vibeswitch-docs',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          id: 'classic',
          path: '../product_docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/<ORG>/<REPO>/tree/main/product_docs/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: false,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themes: ['docusaurus-theme-openapi-docs'],

  plugins: [
    [
      'docusaurus-plugin-openapi-docs',
      /** @type {import('docusaurus-plugin-openapi-docs').Options} */
      ({
        id: 'api',
        docsPluginId: 'classic',
        config: {
          vibeswitch: {
            specPath: '../openapi/openapi.yaml',
            outputDir: '../product_docs/api/generated',
            sidebarOptions: {
              groupPathsBy: 'tag',
              categoryLinkSource: 'tag',
            },
          },
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'VibeSwitch',
        items: [
          { to: '/getting-started/quickstart', label: 'Getting Started', position: 'left' },
          { to: '/api', label: 'API', position: 'left' },
          { href: 'https://vibeswitch.ai', label: 'Product', position: 'right' },
        ],
      },
      colorMode: {
        defaultMode: 'dark',
        respectPrefersColorScheme: true,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

module.exports = config;

