import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { mock, test } from 'node:test';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createApp } from '../../app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

test('GET /api/chatbot/manual-reports reads repo chatbot inbox', async (t) => {
  const inbox = join(PROJECT_ROOT, 'chatbot');
  await mkdir(inbox, { recursive: true });
  const testName = `chatbot-route-test-${Date.now()}.md`;
  await writeFile(join(inbox, testName), '# Route test hello\nBody line.\n', 'utf8');

  t.after(async () => {
    await rm(join(inbox, testName), { force: true });
  });

  const app = await createApp({
    apiKey: 'test-key',
    fetchArticlesForDay: mock.fn(),
    timezone: 'Asia/Jerusalem',
    authRequired: false,
  });

  const list = await app.inject({ method: 'GET', url: '/api/chatbot/manual-reports' });
  assert.equal(list.statusCode, 200);
  const body = JSON.parse(list.body);
  assert.equal(body.inboxRelative, 'chatbot');
  assert.ok(Array.isArray(body.files));
  const row = body.files.find((f) => f.fileName === testName);
  assert.ok(row);
  assert.ok(String(row.snippet).includes('Route test'));

  const fileRes = await app.inject({
    method: 'GET',
    url: `/api/chatbot/manual-reports/file?${new URLSearchParams({ name: testName }).toString()}`,
  });
  assert.equal(fileRes.statusCode, 200);
  const detail = JSON.parse(fileRes.body);
  assert.equal(detail.fileName, testName);
  assert.ok(String(detail.content).includes('Route test hello'));

  await app.close();
});
