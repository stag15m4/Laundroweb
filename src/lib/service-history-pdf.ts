import { formatCurrency } from "@/lib/utils";

/**
 * Builds the printable service history.
 *
 * Laid out as a record somebody else will read — a buyer valuing the fleet, a
 * warranty desk, an accountant — so it leads with the totals, then gives each
 * machine its own block in date order, and ends with the machines that had no
 * work at all. A machine with no entries is information, not an omission.
 */

export type HistoryLog = {
  date: string;
  type: string;
  description: string;
  cost: number | null;
  technician: string | null;
  vendor: string | null;
  status: string;
  parts: { name: string; quantityUsed: number; unit: string }[];
};

export type HistoryGroup = {
  machineId: string | null;
  machineName: string;
  machine: { brand: string | null; model: string | null; serialNumber: string | null; status: string } | null;
  totalCost: number;
  revenue: number | null;
  logs: HistoryLog[];
};

export type HistoryResponse = {
  range: { from: string; to: string };
  scope: string;
  groups: HistoryGroup[];
  machinesWithNoWork: { id: string; name: string; type: string; status: string }[];
  totals: {
    maintenanceCost: number;
    logCount: number;
    totalRevenue: number;
    attributedRevenue: number;
    unattributedRevenue: number;
  };
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export async function buildServiceHistoryPdf(data: HistoryResponse, storeName = "Clinton Laundry Works") {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

  const width = doc.internal.pageSize.getWidth();
  const rangeLabel = `${day(data.range.from)} – ${day(data.range.to)}`;

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Service History", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(storeName, 14, 25);
  doc.text(rangeLabel, 14, 31);
  doc.text(
    `${data.totals.logCount} record${data.totals.logCount === 1 ? "" : "s"} · ` +
      `${formatCurrency(data.totals.maintenanceCost)} total`,
    14,
    37
  );
  doc.setTextColor(0);

  // ── Cost summary, most expensive first ──────────────────────────────────
  const ranked = [...data.groups].sort((a, b) => b.totalCost - a.totalCost);
  const canCompareRevenue = data.totals.attributedRevenue > 0;

  autoTable(doc, {
    startY: 44,
    head: [
      canCompareRevenue
        ? ["Machine", "Records", "Maintenance cost", "Attributed revenue", "Net"]
        : ["Machine", "Records", "Maintenance cost", "Share of spend"],
    ],
    body: ranked.map((g) => {
      const share =
        data.totals.maintenanceCost > 0
          ? `${((g.totalCost / data.totals.maintenanceCost) * 100).toFixed(1)}%`
          : "—";
      if (!canCompareRevenue) {
        return [g.machineName, String(g.logs.length), formatCurrency(g.totalCost), share];
      }
      const revenue = g.revenue;
      return [
        g.machineName,
        String(g.logs.length),
        formatCurrency(g.totalCost),
        revenue === null ? "n/a" : revenue === 0 ? "none attributed" : formatCurrency(revenue),
        revenue === null || revenue === 0 ? "—" : formatCurrency(revenue - g.totalCost),
      ];
    }),
    foot: [
      canCompareRevenue
        ? ["Total", String(data.totals.logCount), formatCurrency(data.totals.maintenanceCost), formatCurrency(data.totals.attributedRevenue), ""]
        : ["Total", String(data.totals.logCount), formatCurrency(data.totals.maintenanceCost), ""],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold" } },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (data.totals.unattributedRevenue > 0) {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `${formatCurrency(data.totals.unattributedRevenue)} of revenue in this period is not tied to a single machine ` +
        `(collections covering the whole floor), so it cannot be set against one machine's costs.`,
      14,
      y,
      { maxWidth: width - 28 }
    );
    doc.setTextColor(0);
    y += 8;
  }

  // ── One block per machine ───────────────────────────────────────────────
  for (const group of data.groups) {
    const subtitle = group.machine
      ? [group.machine.brand, group.machine.model, group.machine.serialNumber && `S/N ${group.machine.serialNumber}`]
          .filter(Boolean)
          .join(" · ")
      : "Work not tied to a specific machine";

    autoTable(doc, {
      startY: y,
      head: [[`${group.machineName} — ${formatCurrency(group.totalCost)}`, "", "", "", "", ""]],
      body: [],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", halign: "left" },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(subtitle, 14, y + 4);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: y + 7,
      head: [["Date", "Type", "Description", "Parts used", "Cost", "By", "Status"]],
      body: group.logs.map((log) => [
        day(log.date),
        log.type,
        log.description,
        log.parts.length
          ? log.parts.map((p) => `${p.quantityUsed} ${p.unit} ${p.name}`).join(", ")
          : "—",
        log.cost === null ? "—" : formatCurrency(log.cost),
        [log.technician, log.vendor].filter(Boolean).join(" / ") || "—",
        log.status.replace(/_/g, " "),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [226, 232, 240], textColor: 30, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 26 },
        2: { cellWidth: 78 },
        3: { cellWidth: 50 },
        4: { cellWidth: 20, halign: "right" },
        6: { cellWidth: 24 },
      },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Machines with no recorded work ──────────────────────────────────────
  if (data.machinesWithNoWork.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["No recorded work in this period", "Type", "Status"]],
      body: data.machinesWithNoWork.map((m) => [m.name, m.type.replace(/_/g, " "), m.status.replace(/_/g, " ")]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  const generated = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`${storeName} · Service history ${rangeLabel} · generated ${generated}`, 14, h - 8);
    doc.text(`Page ${i} of ${pages}`, width - 14, h - 8, { align: "right" });
  }

  const stamp = (iso: string) => iso.slice(0, 10);
  doc.save(`service-history-${stamp(data.range.from)}-to-${stamp(data.range.to)}.pdf`);
}
