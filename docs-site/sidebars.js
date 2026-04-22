/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: 'category',
      label: 'Getting Started',
      link: { type: 'generated-index', title: 'Getting Started' },
      items: [{ type: 'doc', id: 'getting-started/quickstart' }],
    },
    {
      type: 'category',
      label: 'Concepts',
      link: { type: 'generated-index', title: 'Concepts' },
      items: [{ type: 'doc', id: 'concepts/resilience-model' }],
    },
    {
      type: 'category',
      label: 'Guides',
      link: { type: 'generated-index', title: 'Guides' },
      items: [{ type: 'doc', id: 'guides/whatsapp-integration' }],
    },
    {
      type: 'category',
      label: 'Architecture',
      link: { type: 'generated-index', title: 'Architecture' },
      items: [{ type: 'doc', id: 'architecture/system-overview' }],
    },
    {
      type: 'category',
      label: 'Playbooks',
      link: { type: 'generated-index', title: 'Playbooks' },
      items: [{ type: 'doc', id: 'playbooks/common-failures' }],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [{ type: 'link', label: 'API', href: '/api' }],
    },
  ],
};

module.exports = sidebars;

