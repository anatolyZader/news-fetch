// @ts-check

const { themes: prismThemes } = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Srulik's lab docs",
  tagline: "Documentation for Srulik's lab — homefront decision support",
  url: 'https://docs.srulik.ai',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  favicon: 'img/favicon.ico',

  organizationName: 'srulik',
  projectName: 'srulik-docs',

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
          path: '../../cross-cut-modules/docs/content/pages',
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          exclude: [
            '**/_*.{md,mdx}',
            '**/_*/**',
            '**/README.md',
            '**/_template.page.md',
            '**/frontmatter.schema.json',
            // Internal-only: deploy/operator/dev runbooks should not be public.
            'getting-started/quickstart.md',
            'getting-started/install-and-run.md',
            'getting-started/deploy.md',
            'getting-started/auth-setup.md',
            'guides/operating-daily-pipeline.md',
            'operations/**',
          ],
          editUrl: 'https://github.com/<ORG>/<REPO>/tree/main/cross-cut-modules/docs/content/pages/',
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
            specPath: '../../openapi/openapi.yaml',
            outputDir: '../../cross-cut-modules/docs/content/pages/api/generated',
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
        title: "Srulik's lab",
        items: [
          { to: '/getting-started/using-the-app', label: 'Getting Started', position: 'left' },
          { to: '/concepts/system-dataflow', label: 'Concepts', position: 'left' },
          { to: '/guides/news-ingestion', label: 'Guides', position: 'left' },
          { to: '/api', label: 'API', position: 'left' },
          { href: 'https://srulik.ai', label: 'Product', position: 'right' },
        ],
      },
      colorMode: {
        defaultMode: 'light',
        respectPrefersColorScheme: true,
        disableSwitch: false,
      },
      footer: {
        style: 'light',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'Getting started', to: '/getting-started/using-the-app' },
              { label: 'Guides', to: '/guides/operator-workflow' },
              { label: 'API reference', to: '/api' },
            ],
          },
          {
            title: 'Product',
            items: [
              { label: "Srulik's lab app", href: 'https://srulik.ai' },
              { label: 'Decision support model', to: '/concepts/decision-support-model' },
            ],
          },
        ],
        copyright: `© ${new Date().getFullYear()} srulik.ai — Srulik's lab documentation.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

module.exports = config;
