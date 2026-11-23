import { formatCurrency } from "@/lib/utils";

export type RevenueExportEntry = {
  date: string;
  amount: number;
  source: string;
  machineLabel: string | null;
  collectedBy: string | null;
  notes: string | null;
  collectionId: string | null;
};

export type RevenueExportChangerLog = {
  date: string;
  amount: number;
  notes: string | null;
  collectionId: string | null;
};

export type RevenueExportData = {
  range: { from: string | null; to: string | null };
  entries: RevenueExportEntry[];
  changerLogs: RevenueExportChangerLog[];
  totals: { revenue: number; changerCash: number; entryCount: number };
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

function rangeLabel(range: RevenueExportData["range"]): string {
  if (!range.from && !range.to) return "All time";
  if (range.from && range.to) return `${range.from} to ${range.to}`;
  if (range.from) return `From ${range.from}`;
  return `Through ${range.to}`;
}

function rangeSpan(range: RevenueExportData["range"]): string {
  if (!range.from && !range.to) return "all-time";
  return `${range.from ?? "start"}-to-${range.to ?? "now"}`;
}

/**
 * One row per RevenueEntry, plus a clearly separate block for coin-changer
 * cash (it isn't revenue, so it never shares a row or a column with the
 * entries above it -- a spreadsheet SUM over the revenue amount column
 * must not need to know to skip it).
 */
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadBlob(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildRevenueCsv(data: RevenueExportData) {
  const lines: string[] = [];
  lines.push(["Date", "Amount", "Source", "Machine", "Collected By", "Notes", "Collection ID"].join(","));
  for (const e of data.entries) {
    lines.push(
      [
        day(e.date),
        e.amount.toFixed(2),
        e.source,
        e.machineLabel ?? "",
        e.collectedBy ?? "",
        e.notes ?? "",
        e.collectionId ?? "",
      ]
        .map((v) => csvEscape(String(v)))
        .join(",")
    );
  }

  if (data.changerLogs.length > 0) {
    lines.push("");
    lines.push("Coin changer cash (not revenue -- bills exchanged for quarters)");
    lines.push(["Date", "Amount", "Notes", "Collection ID"].join(","));
    for (const c of data.changerLogs) {
      lines.push(
        [day(c.date), c.amount.toFixed(2), c.notes ?? "", c.collectionId ?? ""]
          .map((v) => csvEscape(String(v)))
          .join(",")
      );
    }
  }

  downloadBlob(lines.join("\n"), "text/csv;charset=utf-8", `revenue-${rangeSpan(data.range)}.csv`);
}

export async function buildRevenuePdf(data: RevenueExportData, storeName = "Clinton Laundry Works") {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  const label = rangeLabel(data.range);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Revenue Export", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(storeName, 14, 25);
  doc.text(label, 14, 31);
  doc.text(
    `${data.totals.entryCount} entr${data.totals.entryCount === 1 ? "y" : "ies"} · ` +
      `${formatCurrency(data.totals.revenue)} revenue` +
      (data.totals.changerCash > 0 ? ` · ${formatCurrency(data.totals.changerCash)} coin changer cash` : ""),
    14,
    37
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 44,
    head: [["Date", "Amount", "Source", "Machine", "Collected By", "Notes"]],
    body: data.entries.map((e) => [
      day(e.date),
      formatCurrency(e.amount),
      e.source,
      e.machineLabel ?? "—",
      e.collectedBy ?? "—",
      e.notes ?? "",
    ]),
    foot: [["Total", formatCurrency(data.totals.revenue), "", "", "", ""]],
    styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" },
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 24, halign: "right" },
      2: { cellWidth: 24 },
      3: { cellWidth: 36 },
      4: { cellWidth: 32 },
      5: { cellWidth: 110 },
    },
    margin: { left: 14, right: 14 },
  });

  if (data.changerLogs.length > 0) {
    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + 20 > pageHeight - 14) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Coin changer cash — not revenue, bills exchanged for quarters", 14, y);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      startY: y + 4,
      head: [["Date", "Amount", "Notes"]],
      body: data.changerLogs.map((c) => [day(c.date), formatCurrency(c.amount), c.notes ?? ""]),
      foot: [["Total", formatCurrency(data.totals.changerCash), ""]],
      styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 24, halign: "right" } },
      margin: { left: 14, right: 14 },
    });
  }

  const pages = doc.getNumberOfPages();
  const generated = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`${storeName} · Revenue export · ${label} · generated ${generated}`, 14, h - 8);
    doc.text(`Page ${i} of ${pages}`, width - 14, h - 8, { align: "right" });
  }

  doc.save(`revenue-${rangeSpan(data.range)}.pdf`);
}
