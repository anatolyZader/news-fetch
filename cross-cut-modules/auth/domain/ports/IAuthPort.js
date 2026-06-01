/**
 * @typedef {object} IAuthPort
 * @property {(projectId: string) => void} initAuth
 * @property {(decoded: object) => boolean} isEmailVerified
 * @property {(bearerHeader: string | undefined, opts?: { checkRevoked?: boolean }) => Promise<{ decoded?: object, error?: string }>} verifyToken
 */

export {};
