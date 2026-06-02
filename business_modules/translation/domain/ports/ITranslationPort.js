/**
 * @typedef {object} ITranslationPort
 * @property {(report: object, lang: string) => Promise<object>} getTranslatedReport
 * @property {(posts: object[], lang: string) => Promise<object[]>} translateSocialPosts
 */

export const ITranslationPort = {};
