
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { WdfError } from "./wdf-pricing";

export async function agreementPdf(documentText: string, number: number, version: number, status: "DRAFT" | "ISSUED", documentSha: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Fail visibly instead of changing a party's legal name or negotiated terms.
  try { for (const line of documentText.split("\n")) regular.encodeText(line); }
  catch { throw new WdfError("The PDF contains unsupported characters. Use Latin-script text supported by the PDF font; remove emoji or unsupported symbols."); }
  pdf.setTitle("Clinton Laundry Works - Service Agreement #" + number + " v" + version);
  pdf.setSubject("Contract snapshot SHA-256: " + documentSha);
  pdf.setProducer("Laundroweb service agreements");
  const width = 504, left = 54, bottom = 58;
  let page = pdf.addPage([612, 792]), y = 738;
  function newPage() { page = pdf.addPage([612, 792]); y = 738; header(); }
  function header() {
    page.drawText("CLINTON LAUNDRY WORKS  |  AGREEMENT #" + number + "  |  VERSION " + version, { x: left, y, size: 9, font: bold, color: rgb(.15, .2, .3) });
    y -= 18;
    page.drawText(status === "DRAFT" ? "DRAFT - NOT ISSUED FOR SIGNATURE" : "ISSUED ORIGINAL - SIGNATURES REQUIRED", { x: left, y, size: 9, font: bold, color: status === "DRAFT" ? rgb(.65, .15, .1) : rgb(.2, .2, .2) });
    y -= 26;
  }
  function wrap(line: string, strong: boolean, size: number) {
    const font = strong ? bold : regular, result: string[] = [];
    let current = "";
    for (const word of line.split(/\s+/)) {
      if (!word) continue;
      const candidate = current ? current + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { current = candidate; continue; }
      if (current) result.push(current); current = "";
      for (const char of word) {
        if (font.widthOfTextAtSize(current + char, size) > width) { result.push(current); current = char; }
        else current += char;
      }
    }
    if (current) result.push(current);
    return result.length ? result : [""];
  }
  header();
  for (const paragraph of documentText.split("\n\n")) {
    const source = paragraph.split("\n"), title = /^\d+\./.test(source[0]) || source[0] === "LINEN RENTAL AND LAUNDRY SERVICE AGREEMENT";
    const entries = source.flatMap((line, i) => {
      const strong = i === 0 && title || line.startsWith("PROVIDER:") || line.startsWith("CUSTOMER:");
      const size = line === "LINEN RENTAL AND LAUNDRY SERVICE AGREEMENT" ? 14 : 10.5;
      return wrap(line, strong, size).map(text => ({ text, strong, size }));
    });
    // Keep a heading with its first lines; keep each signature block together
    // when it fits a page.
    const signature = source[0].startsWith("PROVIDER:") || source[0].startsWith("CUSTOMER:");
    const reserve = signature ? Math.min(entries.length, 30) * 15 : Math.min(entries.length, title ? 4 : 2) * 15;
    if (y - reserve < bottom) newPage();
    for (const line of entries) {
      if (y < bottom + 15) newPage();
      if (line.text) page.drawText(line.text, { x: left, y, size: line.size, font: line.strong ? bold : regular });
      y -= line.size === 14 ? 21 : 15;
    }
    y -= 10;
  }
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawLine({ start: { x: left, y: 43 }, end: { x: 558, y: 43 }, thickness: .5, color: rgb(.7, .7, .7) });
    pages[i].drawText("Agreement #" + number + " v" + version + " | text " + documentSha.slice(0, 16), { x: left, y: 29, size: 8, font: regular });
    pages[i].drawText("Page " + (i + 1) + " of " + pages.length, { x: 492, y: 29, size: 8, font: regular });
  }
  return pdf.save();
}
