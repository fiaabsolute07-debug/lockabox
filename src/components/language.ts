/** Language helpers shared by the server layout and the client (no 'use client': the layout calls resolveLanguage on the server). */
export type Language = 'en' | 'vi';
export const LANGUAGE_COOKIE = 'lab_lang';
/** Set once the visitor confirms 18+ (value '1'); lets the server skip rendering the age gate. */
export const AGE_COOKIE = 'lab_age';
export const LOCALES: Record<Language, string> = { en: 'en-US', vi: 'vi-VN' };

export function resolveLanguage(cookieValue?: string | null, acceptLanguage?: string | null): Language {
  if (cookieValue === 'vi' || cookieValue === 'en') return cookieValue;
  return acceptLanguage?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}
