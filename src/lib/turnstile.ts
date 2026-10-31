// Verifies a Cloudflare Turnstile token server-side. Fails closed: a missing
// or unset secret is treated as "not human" rather than silently skipping
// the check, so a misconfigured deployment can't accidentally ship with bot
// protection quietly disabled.
export async function verifyTurnstile(token: unknown, remoteIp?: string): Promise<boolean> {
  if (typeof token !== "string" || !token) return false;

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;

  const params = new URLSearchParams({ secret, response: token });
  if (remoteIp) params.set("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
