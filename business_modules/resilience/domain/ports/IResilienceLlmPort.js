/**
 * @typedef {object} IResilienceLlmPort
 * @property {(articles: object[], opts?: object) => Promise<object[]>} extractSignals
 * @property {(scoredComponents: object, allSignals: object[], date: string, totalArticles: number, opts?: object) => Promise<object>} generateNarratives
 */

export {};
