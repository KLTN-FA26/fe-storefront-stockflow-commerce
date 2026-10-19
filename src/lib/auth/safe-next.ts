import { APP_ROUTES } from "@/constants/routes";

/**
 * Where to go after signing in. Only a same-origin relative path is accepted (an open redirect to
 * `//evil.example` or `https://…` would turn the login page into a phishing relay), and never the
 * login page itself.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\"))
    return fallback;
  try {
    const url = new URL(next, "http://placeholder.invalid");
    if (url.origin !== "http://placeholder.invalid") return fallback;
    if (url.pathname === APP_ROUTES.login || url.pathname.startsWith(`${APP_ROUTES.login}/`)) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** `/login?next=<where the customer was>`; no `next` for the home page or the login page itself. */
export function loginUrl(from?: string): string {
  const next = safeNextPath(from, "/");
  return next === "/" ? APP_ROUTES.login : `${APP_ROUTES.login}?next=${encodeURIComponent(next)}`;
}
