// Screens that LINE rich menu / deep links may open directly (?screen=...).
export const richMenuScreens = [
  "home", "plans", "coupon", "mycoupons", "sports", "wallet", "help", "membership", "trainer",
  "gymnos", "groups", "classhub", "classschedule", "livetv", "promotion",
] as const;

// Reads ?screen= from the page URL, or from LIFF's `liff.state` parameter, which carries
// the original path and query on the first redirect of a liff.line.me link.
export function screenFromSearch(search: string, allowed: readonly string[]): string | null {
  const params = new URLSearchParams(search);
  let screen = params.get("screen");
  const state = params.get("liff.state");
  if (!screen && state) {
    const query = state.includes("?") ? state.slice(state.indexOf("?") + 1) : "";
    screen = new URLSearchParams(query).get("screen");
  }
  return screen && allowed.includes(screen) ? screen : null;
}
