#!/usr/bin/env node
/**
 * Post-deploy prompt optimization verification.
 *
 * Usage:
 *   node cross-cut-modules/llm/input/verifyPromptOptimization.js              # offline smoke (CI)
 *   node cross-cut-modules/llm/input/verifyPromptOptimization.js --flags
 *   node cross-cut-modules/llm/input/verifyPromptOptimization.js --audit 2026-06-08
 *   node cross-cut-modules/llm/input/verifyPromptOptimization.js --live
 *   npm run verify:prompt-optimization
 */
import { runVerifyPromptOptimizationCli } from './verifyPromptOptimizationInput.js';

runVerifyPromptOptimizationCli()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
