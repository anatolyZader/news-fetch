import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_TOOL_HANDLERS } from '../../../../business_modules/chat/app/chatToolHandlers.js';
import { PROPOSE_TOOL_NAMES } from '../../../../business_modules/chat/domain/chatConfig.js';
import { CORE_CHAT_TOOLS, ANALYST_READ_TOOLS, PROPOSE_TOOLS, OPERATOR_PROPOSE_TOOLS } from '../../../../business_modules/chat/domain/tools/chatToolSchemas.js';

const DIRECT_MUTATION_PREFIX_RE = /^(submit|update|delete|review|approve|reject|acknowledge|dismiss)/;

describe('chat tool mutation guard', () => {
  it('propose_* tools are not registered as direct handlers', () => {
    const handlerNames = Object.keys(CHAT_TOOL_HANDLERS);
    for (const name of PROPOSE_TOOL_NAMES) {
      assert.ok(!handlerNames.includes(name), `propose tool "${name}" must not be a direct handler`);
    }
  });

  it('direct handlers do not use mutation verb prefixes', () => {
    for (const name of Object.keys(CHAT_TOOL_HANDLERS)) {
      assert.ok(
        !DIRECT_MUTATION_PREFIX_RE.test(name),
        `handler "${name}" looks like a direct mutation tool`,
      );
    }
  });

  it('all propose tools are defined only in PROPOSE_TOOL_NAMES registry', () => {
    const allProposeInSchemas = [
      ...PROPOSE_TOOLS,
      ...OPERATOR_PROPOSE_TOOLS,
    ].map((t) => t.name);
    for (const name of allProposeInSchemas) {
      assert.ok(PROPOSE_TOOL_NAMES.has(name), `schema propose tool "${name}" missing from PROPOSE_TOOL_NAMES`);
    }
  });

  it('read tools in schemas are either handled or propose-only', () => {
    const handled = new Set(Object.keys(CHAT_TOOL_HANDLERS));
    const allReadTools = [...CORE_CHAT_TOOLS, ...ANALYST_READ_TOOLS].map((t) => t.name);
    for (const name of allReadTools) {
      assert.ok(handled.has(name), `read tool "${name}" has no handler`);
    }
  });
});
