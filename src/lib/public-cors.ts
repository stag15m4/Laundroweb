// CORS allow-list for the handful of endpoints a browser on the public
// marketing site (clinton-laundry-works, a separate static site with no
// server of its own) needs to call directly. Scoped to exact origins, never
// a wildcard or a reflected Origin header -- a wildcard here would let any
// third-party page embed a copy of the refund form and submit through its
// own visitors' browsers. This doesn't gate who can POST at all (anyone can
// already do that directly with curl; CORS only restricts browser JS), just
// which *browsers* are told they're allowed to read the response.
const ALLOWED_ORIGINS = [
  "https://clintonlaundryworks.com",
  "https://www.clintonlaundryworks.com",
  ...(process.env.NODE_ENV !== "production" ? ["http://localhost:3000"] : []),
];

export function corsHeaders(origin: string | null): HeadersInit {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
  }
  return {};
}
