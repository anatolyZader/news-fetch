## Srulik's lab docs site (Docusaurus)

This site is the **primary** docs surface. It is deployed at **`docs.vibeswitch.ai`** today; prose and branding refer to the future **`docs.srulik.ai`** hostname until DNS cutover (markdown link targets use vibeswitch).

### Source of truth
- Human-written docs live in `../product_docs/`
- API reference is generated from `../../openapi/openapi.yaml`

### Local development

```bash
cd docs/docs-site
npm install
npm run gen:api
npm run start
```

### Build (Cloudflare Pages)
- **Build command**: `cd docs/docs-site && npm ci && npm run gen:api && npm run build`
- **Output directory**: `docs/docs-site/build`
- **Node.js version**: 20 (set in Cloudflare Pages env as `NODE_VERSION=20`)

### Notes
- Replace `editUrl` in `docusaurus.config.js` with your real repo URL.
