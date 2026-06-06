/**
 * @typedef {object} IResilienceAnalysisPort
 * @property {(text: string, senderName: string) => Promise<object>} analyzeMessage
 * @property {(turnHistory: object[], senderName: string) => Promise<object>} analyzeTurnHistory
 */

export const RESILIENCE_ANALYSIS_PORT = Symbol('IResilienceAnalysisPort');
