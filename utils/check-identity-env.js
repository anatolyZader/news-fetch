#!/usr/bin/env node
/**
 * Quick sanity check for Identity Platform env before starting the server.
 * Run: npm run check-identity-env
 */
import 'dotenv/config';

const authRequired = process.env.AUTH_REQUIRED === 'true';
const projectId = (process.env.FIREBASE_PROJECT_ID ?? '').trim();
const gac = (process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '').trim();

console.log('AUTH_REQUIRED:', authRequired);

if (!authRequired) {
  console.log('→ API routes are public (no JWT). Set AUTH_REQUIRED=true to enforce Identity Platform.');
  process.exit(0);
}

let ok = true;
if (projectId) {
  console.log('✓ FIREBASE_PROJECT_ID is set');
} else {
  console.error('✗ FIREBASE_PROJECT_ID is missing (required when AUTH_REQUIRED=true).');
  ok = false;
}

if (gac) {
  console.log('✓ GOOGLE_APPLICATION_CREDENTIALS is set (local / explicit key)');
} else {
  console.log('⚠ GOOGLE_APPLICATION_CREDENTIALS not set — OK on Cloud Run if the runtime SA has Identity Toolkit Admin.');
}

if (!ok) {
  console.error('\nSee docs/IDENTITY_PLATFORM_SETUP.md');
  process.exit(1);
}

console.log('\n→ Run: npm start');
process.exit(0);
