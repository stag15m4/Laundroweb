// Browser requests use the custom domain while Railway supplies an internal
// request URL. Trust configured public origins, never forwarded Host headers.
export function outboundOriginAllowed(request: Request) {
  const supplied = request.headers.get("origin");
  if (!supplied || supplied === "null") return false;
  const allowed = new Set(["https://laundroweb.erwinmills.com"]);
  for (const value of [process.env.NEXTAUTH_URL, process.env.PHONE_PUBLIC_URL]) {
    if (!value) continue;
    try { const url = new URL(value); if (url.protocol === "https:" && !url.username && !url.password) allowed.add(url.origin); } catch { /* Invalid config grants no access. */ }
  }
  if (process.env.NODE_ENV !== "production") allowed.add(new URL(request.url).origin);
  return allowed.has(supplied);
}
