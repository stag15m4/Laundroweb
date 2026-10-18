import Anthropic from "@anthropic-ai/sdk";

/** The one model every manual feature uses. */
export const MANUALS_MODEL = "claude-opus-5-5";

/**
 * Server-side fallback: if a safety classifier declines a request (a false
 * positive on a wiring diagram, say), the API retries it on Anthropic's
 * recommended fallback model inside the same call instead of failing.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function anthropic(): Anthropic {
  if (!anthropicConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it in Railway to enable manual search.");
  }
  client ??= new Anthropic();
  return client;
}

/** A readable message for an error thrown by the SDK, for showing in the UI. */
export function describeAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Railway.";
  if (err instanceof Anthropic.RateLimitError) return "Anthropic rate limit hit. Wait a minute and try again.";
  if (err instanceof Anthropic.BadRequestError) return `Anthropic rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Anthropic API error${err.status ? ` ${err.status}` : ""}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
