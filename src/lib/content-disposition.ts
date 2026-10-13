/**
 * Builds a Content-Disposition header value that's safe for any filename.
 *
 * Headers only accepts values in the one-byte ByteString range, so a
 * filename with an accented letter, an em dash, or anything else outside
 * plain ASCII would throw a TypeError when the response is constructed --
 * turning a perfectly normal download into a 500. `filename=` carries an
 * ASCII-safe fallback for older clients; `filename*` carries the exact
 * UTF-8 name per RFC 5987/6266 for everything else.
 */
export function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'") || "file";
  const encoded = encodeURIComponent(filename);
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
