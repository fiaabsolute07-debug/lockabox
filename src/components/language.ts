/** English only (owner decision 2026-09-27, DECISIONS #13). Shared by the server layout and the client. */
export type Language = 'en';
export const LOCALES: Record<Language, string> = { en: 'en-US' };
/** Set once the visitor closes the first-visit "not financial advice" screen (value '1'); lets the server skip rendering it. */
export const DISCLAIMER_COOKIE = 'lab_nfa';
