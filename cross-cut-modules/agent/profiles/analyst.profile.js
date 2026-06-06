/**
 * Analyst agent profile — extends chat with analyst read tools at runtime.
 */
import { registerProfileTools } from '../toolRegistry.js';
import { MULTI_HOP_TOOLS } from './assessment.profile.js';

registerProfileTools('analyst', [...MULTI_HOP_TOOLS]);

export const ANALYST_PROFILE_ID = 'analyst';
