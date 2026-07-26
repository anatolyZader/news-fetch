import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveChatModel,
  chatModel,
  chatStrongModel,
} from '../../../cross-cut-modules/agent/agentConfig.js';
import { HAIKU_MODEL, SONNET_MODEL } from '../../../cross-cut-modules/llm/modelIds.js';

const ROUTER_ENV = ['CHAT_MODEL', 'CHAT_MODEL_STRONG', 'CHAT_MODEL_ROUTER'];
const saved = {};

describe('resolveChatModel (hybrid router)', () => {
  beforeEach(() => {
    for (const k of ROUTER_ENV) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ROUTER_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('escalates deep-dive slices to the strong model', () => {
    for (const slice of ['temporal', 'compare', 'component', 'full']) {
      assert.equal(resolveChatModel(slice), SONNET_MODEL, slice);
    }
  });

  it('keeps cheap slices on the base chat model', () => {
    for (const slice of ['standard', 'minimal', 'hub', undefined, '']) {
      assert.equal(resolveChatModel(slice), HAIKU_MODEL, String(slice));
    }
  });

  it('CHAT_MODEL_ROUTER=0 pins everything to the base model', () => {
    process.env.CHAT_MODEL_ROUTER = '0';
    assert.equal(resolveChatModel('temporal'), HAIKU_MODEL);
    assert.equal(resolveChatModel('standard'), HAIKU_MODEL);
  });

  it('honors CHAT_MODEL and CHAT_MODEL_STRONG overrides', () => {
    process.env.CHAT_MODEL = 'base-x';
    process.env.CHAT_MODEL_STRONG = 'strong-y';
    assert.equal(chatModel(), 'base-x');
    assert.equal(chatStrongModel(), 'strong-y');
    assert.equal(resolveChatModel('standard'), 'base-x');
    assert.equal(resolveChatModel('compare'), 'strong-y');
  });
});
