// Back-office display preferences, kept in cookies so the server renders the chosen theme and
// language on the first paint (no flash of the default theme).
export type AdminTheme = "light" | "dark";
export type AdminLang = "th" | "en";

export const adminThemeCookie = "ppa_admin_theme";
export const adminLangCookie = "ppa_admin_lang";

export function readAdminTheme(value: string | undefined | null): AdminTheme {
  return value === "dark" ? "dark" : "light";
}

export function readAdminLang(value: string | undefined | null): AdminLang {
  return value === "en" ? "en" : "th";
}
