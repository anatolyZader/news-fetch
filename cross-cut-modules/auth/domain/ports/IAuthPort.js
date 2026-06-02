/**
 * @typedef {object} IAuthPort
 * @property {(projectId: string) => void} init
 * @property {(bearerHeader: string, checkRevoked?: boolean) => Promise<object|null>} verifyToken
 * @property {(email: string) => Promise<boolean>} isEmailVerified
 */

export {};
