/**
 * @typedef {object} IMailingDeliveryPort
 * @property {(opts: { from: string, to: string, subject: string, html: string }) => Promise<{ ok: boolean, error?: string }>} sendEmail
 */

export const IMailingDeliveryPort = {};
