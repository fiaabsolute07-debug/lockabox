/** English only (owner decision 2026-09-27, DECISIONS #13). Shared by the server layout and the client. */
export type Language = 'en';
/** Set once the visitor confirms 18+ (value '1'); lets the server skip rendering the age gate. */
export const AGE_COOKIE = 'lab_age';
export const LOCALES: Record<Language, string> = { en: 'en-US' };
