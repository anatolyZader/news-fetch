/**
 * Developer agent profile — extends chat with developer read tools at runtime.
 */
import { registerProfileTools } from '../toolRegistry.js';
import { MULTI_HOP_TOOLS } from './assessment.profile.js';

registerProfileTools('developer', [...MULTI_HOP_TOOLS]);

export const DEVELOPER_PROFILE_ID = 'developer';
