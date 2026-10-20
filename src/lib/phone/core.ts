import { validateRequest } from "twilio";

export type PhoneContact = { name: string; number: string };
export const sidPattern = /^CA[0-9a-fA-F]{32}$/;
export const recordingPattern = /^RE[0-9a-fA-F]{32}$/;
export const phonePattern = /^\+1[2-9]\d{9}$/;
export function xml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
export function twiml(body: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
export function validSignature(
  token: string,
  url: string,
  params: URLSearchParams,
  supplied: string,
): boolean {
  const fields: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    fields[key] = values.length === 1 ? values[0] : values;
  }
  return validateRequest(token, supplied, url, fields);
}
export function parseContacts(value: unknown): PhoneContact[] {
  if (!Array.isArray(value) || value.length > 3)
    throw new Error("Add up to three on-call contacts.");
  const contacts = value.map((c) => {
    if (
      !c ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 80 ||
      typeof c.number !== "string" ||
      !phonePattern.test(c.number)
    ) {
      throw new Error(
        "Each contact needs a name and US/Canada number such as +19195551234.",
      );
    }
    return { name: c.name.trim(), number: c.number };
  });
  if (new Set(contacts.map((c) => c.number)).size !== contacts.length)
    throw new Error("Use a different number for each contact.");
  return contacts;
}
export function escalationTarget(
  contacts: PhoneContact[],
  attempt: number,
): PhoneContact | undefined {
  return contacts.length ? contacts[attempt % contacts.length] : undefined;
}
export function acknowledges(digits: string | null): boolean {
  return digits === "1";
}
