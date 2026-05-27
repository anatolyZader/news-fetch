import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHomefrontMarkdown } from '../../../../../business_modules/news-sites/domain/services/homefrontMarkdownParser.js';

test('parseHomefrontMarkdown reads dated export articles', () => {
  const path = resolve(
    'business_modules/news-sites/articles_extracted/articles-homefront-2026-05-23.md',
  );
  const content = readFileSync(path, 'utf8');
  const parsed = parseHomefrontMarkdown(content, path);

  assert.equal(parsed.date, '2026-05-23');
  assert.equal(parsed.filteredFrom, 382);
  assert.equal(parsed.filteredTo, 15);
  assert.ok(parsed.articles.length >= 1);
  assert.match(parsed.articles[0].title, /./);
  assert.match(parsed.articles[0].url, /^https?:\/\//);
});
