/** Session constants with no imports, so the request proxy can use them without loading the database client. */
export const SESSION_COOKIE = "lowkey_session";
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
