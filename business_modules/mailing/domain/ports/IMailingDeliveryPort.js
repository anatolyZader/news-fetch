/**
 * Port: send transactional email (single message).
 *
 * Implementations: mailingResendAdapter (Resend HTTP API).
 *
 * @typedef {Object} TransactionalMailPayload
 * @property {string} from   Sender (e.g. "Name <noreply@domain.com>")
 * @property {string} to     Recipient email
 * @property {string} subject
 * @property {string} text  Plain text body
 * @property {string} [html] Optional HTML body
 */

/**
 * @typedef {Object} IMailingDeliveryPort
 * @property {(p: TransactionalMailPayload) => Promise<{ id?: string }>} sendTransactional
 */

export const MAILING_DELIVERY_PORT = Symbol('IMailingDeliveryPort');
