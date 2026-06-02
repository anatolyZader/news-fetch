import { getTranslatedReport, translateSocialPosts } from '../app/translationService.js';

/** @returns {import('../domain/ports/ITranslationPort.js').ITranslationPort} */
export function createTranslationPort() {
  return { getTranslatedReport, translateSocialPosts };
}
