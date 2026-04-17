import { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon, Clock,
  LayoutGrid, List, ChevronUp, ChevronDown,
  FileText, Sheet,
} from "lucide-react";
import { PageHeader, Card, Select } from "@/components/ui";
import { useMonthlySheet } from "@/hooks/use-attendance";
import { cn } from "@/lib/utils";

type ViewMode = "grid" | "table";
type SortKey  = "employee" | "date" | "inTime" | "outTime" | "hours" | "status";

const STATUS_CFG: Record<string, { bg: string; text: string; badge: string; label: string; dot: string; abbr: string }> = {
  present:  { bg: "bg-green-50",  text: "text-green-700",  badge: "bg-green-100 text-green-700 border-green-200",    label: "Present",  dot: "bg-green-500",  abbr: "P"  },
  late:     { bg: "bg-amber-50",  text: "text-amber-700",  badge: "bg-amber-100 text-amber-700 border-amber-200",    label: "Late",     dot: "bg-amber-500",  abbr: "L"  },
  absent:   { bg: "bg-red-50",    text: "text-red-700",    badge: "bg-red-100 text-red-700 border-red-200",          label: "Absent",   dot: "bg-red-500",    abbr: "A"  },
  half_day: { bg: "bg-yellow-50", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Half Day", dot: "bg-yellow-400", abbr: "HD" },
  leave:    { bg: "bg-blue-50",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700 border-blue-200",       label: "Leave",    dot: "bg-blue-500",   abbr: "LV" },
  holiday:  { bg: "bg-gray-100",  text: "text-gray-500",   badge: "bg-gray-100 text-gray-600 border-gray-200",       label: "Holiday",  dot: "bg-gray-400",   abbr: "H"  },
};

// Robustly extract HH and MM from either "HH:MM:SS" or a full ISO datetime string
function parseTime(t: string | null | undefined): { h: number; m: string } | null {
  if (!t) return null;
  // ISO datetime: "2026-04-12T08:47:00.000Z" → extract after "T"
  const timeStr = t.includes("T") ? t.split("T")[1] : t;
  const parts = timeStr.split(":");
  const h = parseInt(parts[0], 10);
  const m = (parts[1] || "00").substring(0, 2);
  if (isNaN(h)) return null;
  return { h, m };
}
function fmtTime(t: string | null | undefined) {
  const p = parseTime(t);
  if (!p) return null;
  const { h, m } = p;
  return `${h > 12 ? h - 12 : h || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}
function fmtHrs(h: number | null | undefined) {
  if (h == null || h === 0) return "—";
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function getDayName(year: number, month: number, day: number) {
  return DAY_NAMES[new Date(year, month - 1, day).getDay()];
}
function isSunday(year: number, month: number, day: number) {
  return new Date(year, month - 1, day).getDay() === 0;
}

// ── PDF helpers ───────────────────────────────────────────────────────────────
async function toDataUrl(url: string): Promise<string> {
  const res  = await fetch(url);
  const blob = await res.blob();
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
function getImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = src;
  });
}

async function buildPdfBase(orientation: "landscape" | "portrait", title: string, filename: string) {
  const { default: jsPDF } = await import("jspdf");
  const doc   = new jsPDF({ orientation, format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let slpData:   string | null = null;
  let liveUData: string | null = null;
  try {
    slpData   = await toDataUrl("https://upload.wikimedia.org/wikipedia/en/c/c1/Sri_Lanka_Post_logo.png");
    liveUData = await toDataUrl("https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQCzrc0k5wmNzmItazY38yj1_7K5zAFLMxn-Q&s");
  } catch { /* no logos */ }

  const maxLogoH = 18;
  let logoW = maxLogoH, logoH = maxLogoH;
  if (slpData) {
    const dims = await getImageDimensions(slpData);
    logoH = maxLogoH;
    logoW = maxLogoH * (dims.w / dims.h);
  }

  const logoY = 5;
  if (slpData) doc.addImage(slpData, "PNG", pageW / 2 - logoW / 2, logoY, logoW, logoH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 58, 138);
  doc.text("Sri Lanka Post — Colombo District", pageW / 2, logoY + logoH + 5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 120);
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`${title}   |   Generated: ${today}`, pageW / 2, logoY + logoH + 10.5, { align: "center" });

  const headerH = logoY + logoH + 15;
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.line(8, headerH, pageW - 8, headerH);

  return { doc, pageW, pageH, headerH, liveUData, filename };
}

function addPdfFooters(doc: any, pageH: number, pageW: number, liveUData: string | null) {
  const count = doc.internal.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 210, 230);
    doc.setLineWidth(0.3);
    doc.line(8, pageH - 11, pageW - 8, pageH - 11);
    if (liveUData) doc.addImage(liveUData, "JPEG", pageW / 2 - 18, pageH - 9.5, 5.5, 5.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 140);
    const px = liveUData ? pageW / 2 - 11 : pageW / 2;
    doc.text("Powered by  Live U (Pvt) Ltd, Sri Lanka", px, pageH - 5.5, { align: "left" });
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${count}`, pageW - 8, pageH - 5.5, { align: "right" });
  }
}

// Abbreviated 24h time for tight PDF cells e.g. "08:30"
function fmtTime24(t: string | null | undefined) {
  const p = parseTime(t);
  if (!p) return null;
  return `${String(p.h).padStart(2, "0")}:${p.m}`;
}

// ── Grid PDF — per-employee rows layout matching official monthly attendance sheet ──
async function exportGridPdf(
  rows: any[],
  daysArray: number[],
  year: number,
  month: number,
  monthName: string,
  filename: string,
  _showTimes: boolean,
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc   = new jsPDF({ orientation: "landscape", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let slpData:   string | null = null;
  let liveUData: string | null = null;
  try {
    slpData   = await toDataUrl("https://upload.wikimedia.org/wikipedia/en/c/c1/Sri_Lanka_Post_logo.png");
    liveUData = await toDataUrl("https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQCzrc0k5wmNzmItazY38yj1_7K5zAFLMxn-Q&s");
  } catch { /* no logos */ }

  const margin  = 8;
  const contentW = pageW - margin * 2;
  const labelW  = 22;
  const dayW    = Math.max(7, (contentW - labelW) / daysArray.length);

  const periodStr = `Period: ${String(1).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year} \u2013 ${String(daysArray[daysArray.length-1]).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year}`;

  // ── Draw the SLP-style page header ──────────────────────────────────────────
  async function drawPageHeader() {
    let logoW = 18, logoH = 18;
    if (slpData) {
      const dims = await getImageDimensions(slpData);
      logoH = 16; logoW = 16 * (dims.w / dims.h);
      // Logo centered at the very top
      doc.addImage(slpData, "PNG", (pageW - logoW) / 2, 3, logoW, logoH);
    }

    const textY = 3 + logoH + 2; // text block starts right below logo

    // "SRI LANKA POST" — bold navy blue, centered
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(22, 48, 110);
    doc.text("SRI LANKA POST", pageW / 2, textY + 4, { align: "center" });

    // "Human Resources Department" — gray, centered
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 100);
    doc.text("Human Resources Department", pageW / 2, textY + 9, { align: "center" });

    // "MONTHLY ATTENDANCE SHEET" — bold dark maroon, centered
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(139, 0, 0);
    doc.text("MONTHLY ATTENDANCE SHEET", pageW / 2, textY + 14, { align: "center" });

    // Period — top right corner
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 100);
    doc.text(periodStr, pageW - margin, 7, { align: "right" });

    // Horizontal rule
    const ruleY = textY + 17;
    doc.setDrawColor(180, 190, 210);
    doc.setLineWidth(0.5);
    doc.line(margin, ruleY, pageW - margin, ruleY);
    return ruleY + 2; // Y after header
  }

  // ── Draw employee info bar ───────────────────────────────────────────────────
  function drawEmployeeInfo(row: any, y: number) {
    const bx = margin, bw = contentW, bh = 14;
    doc.setFillColor(245, 247, 252);
    doc.setDrawColor(200, 210, 230);
    doc.setLineWidth(0.3);
    doc.rect(bx, y, bw, bh, "FD");

    // Section title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(22, 48, 110);
    doc.text("MONTHLY ATTENDANCE RECORD", bx + 3, y + 5.5);

    // Period right
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 100);
    doc.text(periodStr, bx + bw - 3, y + 5.5, { align: "right" });

    // Employee fields
    const fields = [
      { label: "Employee Name:", value: row.employeeName || "N/A" },
      { label: "Employee ID:",   value: row.employeeCode || "N/A" },
      { label: "Department:",    value: row.department   || "N/A" },
      ...(row.staffCategory ? [{ label: "Staff Category:", value: row.staffCategory }] : []),
    ];
    const fw = bw / 4;
    fields.forEach((f, i) => {
      const fx = bx + i * fw + 3;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 100, 120);
      doc.text(f.label, fx, y + 10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(22, 48, 110);
      doc.text(f.value, fx + (i === 3 ? 20 : 18), y + 10);
    });
    return y + bh + 2;
  }

  // ── Build column styles ──────────────────────────────────────────────────────
  const colStyles: Record<number, any> = {
    0: { cellWidth: labelW, halign: "left", fontStyle: "bold", fontSize: 6,
         textColor: [40, 40, 60], fillColor: [235, 240, 252] },
  };
  daysArray.forEach((day, i) => {
    colStyles[1 + i] = {
      cellWidth: dayW,
      halign: "center",
      fontSize: 6.5,
      cellPadding: { top: 1.5, bottom: 1.5, left: 0.5, right: 0.5 },
      ...(isSunday(year, month, day) ? { fillColor: [254, 242, 242] } : {}),
    };
  });

  // ── Metric row builder ───────────────────────────────────────────────────────
  type MetricKey = "inTime" | "outTime" | "workedHrs" | "status" | "overtime";
  const METRIC_LABELS: Record<MetricKey, string> = {
    inTime:    "IN TIME",
    outTime:   "OUT TIME",
    workedHrs: "WORKED HRS",
    status:    "STATUS",
    overtime:  "OVERTIME",
  };
  function buildMetricRow(row: any, key: MetricKey): any[] {
    const label = METRIC_LABELS[key];
    const cells: any[] = [label];
    daysArray.forEach(day => {
      const e = row.dailyStatus?.find((d: any) => d.day === day);
      const st = e?.status || "absent";
      const abbr = (STATUS_CFG[st] || STATUS_CFG.absent).abbr;
      switch (key) {
        case "inTime":    cells.push(fmtTime24(e?.inTime)  || (st === "absent" ? "" : "—")); break;
        case "outTime":   cells.push(fmtTime24(e?.outTime) || (st === "absent" ? "" : "—")); break;
        case "workedHrs": {
          const h = e?.hours;
          cells.push(h != null && h > 0 ? fmtHrs(h) : (st === "absent" ? "" : "—"));
          break;
        }
        case "status":   cells.push(abbr); break;
        case "overtime": {
          const ot = e?.overtimeHours;
          cells.push(ot && ot > 0 ? fmtHrs(ot) : "-");
          break;
        }
      }
    });
    return cells;
  }

  // ── Render one employee block ────────────────────────────────────────────────
  let firstPage = true;
  for (const row of rows) {
    if (!firstPage) doc.addPage();
    firstPage = false;

    const headerY = await drawPageHeader();
    const tableY  = drawEmployeeInfo(row, headerY);

    // Head row: day numbers + day names
    const headRow = ["TIME\nDETAILS", ...daysArray.map(d => {
      const dn = getDayName(year, month, d);
      return `${String(d).padStart(2,"0")}\n${dn}`;
    })];

    const body: any[][] = [
      buildMetricRow(row, "inTime"),
      buildMetricRow(row, "outTime"),
      buildMetricRow(row, "workedHrs"),
      buildMetricRow(row, "status"),
      buildMetricRow(row, "overtime"),
    ];

    autoTable(doc, {
      head: [headRow],
      body,
      startY: tableY,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: {
        font: "helvetica",
        fontSize: 6.5,
        cellPadding: { top: 2, bottom: 2, left: 1, right: 1 },
        textColor: [40, 40, 60],
        lineColor: [200, 210, 230],
        lineWidth: 0.25,
        minCellHeight: 7,
        overflow: "linebreak",
        halign: "center",
      },
      headStyles: {
        fillColor: [22, 48, 110],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 6,
        halign: "center",
        cellPadding: { top: 2, bottom: 2, left: 0.5, right: 0.5 },
        minCellHeight: 10,
        lineWidth: 0,
      },
      columnStyles: colStyles,
      bodyStyles:   { fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [247, 250, 255] },
      didParseCell: (data: any) => {
        const dayIdx = data.column.index - 1;
        // Sunday tint
        if (dayIdx >= 0 && dayIdx < daysArray.length) {
          const day = daysArray[dayIdx];
          if (isSunday(year, month, day)) {
            if (data.section === "head") data.cell.styles.fillColor = [127, 29, 29];
            if (data.section === "body") data.cell.styles.fillColor = [254, 242, 242];
          }
        }
        // Row-level value colours (only for day columns, not the label column)
        if (data.section === "body" && data.column.index > 0) {
          const ri = data.row.index;
          // IN TIME  — dark red
          if (ri === 0) data.cell.styles.textColor = [185, 28, 28];
          // OUT TIME — dark navy
          if (ri === 1) data.cell.styles.textColor = [22, 48, 110];
          // WORKED HRS — dark slate
          if (ri === 2) data.cell.styles.textColor = [50, 50, 70];
          // STATUS — colour per status code
          if (ri === 3) {
            const v = String(data.cell.raw || "");
            if (v === "P")  data.cell.styles.textColor = [21, 128, 61];
            if (v === "L")  data.cell.styles.textColor = [146, 64, 14];
            if (v === "A")  data.cell.styles.textColor = [185, 28, 28];
            if (v === "HD") data.cell.styles.textColor = [113, 63, 18];
            if (v === "LV") data.cell.styles.textColor = [29, 78, 216];
            if (v === "H")  data.cell.styles.textColor = [100, 100, 120];
          }
          // OVERTIME — amber orange
          if (ri === 4) data.cell.styles.textColor = [180, 83, 9];
        }
        // Label column — bold navy, left-aligned, light blue tint
        if (data.column.index === 0 && data.section === "body") {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize  = 5.5;
          data.cell.styles.textColor = [22, 48, 110];
          data.cell.styles.halign    = "left";
          data.cell.styles.fillColor = [232, 238, 255];
        }
        // Label column in head — same tint
        if (data.column.index === 0 && data.section === "head") {
          data.cell.styles.fillColor = [15, 35, 90];
        }
      },
      showHead: "everyPage",
    });

    // Monthly summary bar
    const sumY = (doc as any).lastAutoTable.finalY + 3;
    const totalHrs = fmtHrs(row.totalWorkHours);
    const totalOT  = row.overtimeHours > 0 ? fmtHrs(row.overtimeHours) : "0h";
    doc.setFillColor(235, 240, 252);
    doc.setDrawColor(200, 210, 230);
    doc.setLineWidth(0.3);
    doc.rect(margin, sumY, contentW, 9, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(22, 48, 110);
    doc.text(`MONTHLY SUMMARY - ${row.employeeName} (${row.employeeCode})`, margin + 3, sumY + 5.5);
    doc.setTextColor(80, 80, 100);
    doc.text(`Total Working Hours: ${totalHrs}  |  Total Overtime Hours: ${totalOT}`, pageW - margin - 3, sumY + 5.5, { align: "right" });
  }

  // Footer on every page
  const count = doc.internal.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    doc.setDrawColor(200, 210, 230);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 11, pageW - margin, pageH - 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 140);
    doc.text(`Generated: ${today} | Sri Lanka Post | Confidential Document`, pageW / 2, pageH - 7, { align: "center" });
    if (liveUData) doc.addImage(liveUData, "JPEG", pageW / 2 - 18, pageH - 5.5, 4, 4);
    doc.text("Powered by  Live U (Pvt) Ltd", pageW / 2 - 12, pageH - 3.5, { align: "left" });
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${count}`, pageW - margin, pageH - 5.5, { align: "right" });
  }

  doc.save(`${filename}.pdf`);
}

// ── Table PDF — timing detail, portrait ───────────────────────────────────────
async function exportTablePdf(
  filteredTableRows: any[],
  monthName: string,
  year: number,
  filename: string,
) {
  const { default: autoTable } = await import("jspdf-autotable");
  const { doc, pageW, pageH, headerH, liveUData } = await buildPdfBase("landscape", `Timing Detail — ${monthName} ${year}`, filename);

  const margin = 10;

  // Sort: employee name → employee code → day (keeps each code's records together)
  const sortedRows = [...filteredTableRows].sort((a, b) => {
    const empCmp = a.employeeName.localeCompare(b.employeeName);
    if (empCmp !== 0) return empCmp;
    const codeCmp = a.employeeCode.localeCompare(b.employeeCode);
    if (codeCmp !== 0) return codeCmp;
    return a.day - b.day;
  });

  const headers = ["Date", "Day", "Employee", "Emp ID", "Status", "In Time", "Out Time", "Work Hrs", "OT Hrs"];
  const body = sortedRows.map(r => [
    `${String(r.day).padStart(2,"0")} ${monthName} ${year}`,
    r.dayName,
    r.employeeName,
    r.employeeCode,
    STATUS_CFG[r.status]?.label || r.status,
    fmtTime(r.inTime)  || "—",
    fmtTime(r.outTime) || "—",
    fmtHrs(r.hours),
    r.ot && r.ot > 0 ? fmtHrs(r.ot) : "—",
  ]);

  autoTable(doc, {
    head: [headers],
    body,
    startY: headerH + 4,
    margin: { left: margin, right: margin },
    tableWidth: pageW - margin * 2,
    styles: {
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      font: "helvetica",
      textColor: [40, 40, 60],
      lineColor: [220, 228, 240],
      lineWidth: 0.25,
      minCellHeight: 11,
      overflow: "ellipsize",
    },
    headStyles: {
      fillColor: [22, 48, 110],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
      halign: "center",
      lineWidth: 0,
      minCellHeight: 12,
      overflow: "ellipsize",
    },
    columnStyles: {
      0: { cellWidth: 36, halign: "center" },
      1: { cellWidth: 22, halign: "center", textColor: [100, 100, 120], overflow: "ellipsize" },
      2: { cellWidth: 55, halign: "left",   fontStyle: "bold", textColor: [22, 48, 110] },
      3: { cellWidth: 22, halign: "center", textColor: [80, 80, 100] },
      4: { cellWidth: 26, halign: "center" },
      5: { cellWidth: 28, halign: "center", textColor: [21, 128, 61]  },
      6: { cellWidth: 28, halign: "center", textColor: [185, 28, 28] },
      7: { cellWidth: 26, halign: "center", textColor: [29, 78, 216]  },
      8: { cellWidth: 24, halign: "center", textColor: [194, 65, 12]  },
    },
    bodyStyles: { fillColor: [255, 255, 255] },
    // Build an array of row indices where a new employee group starts
    didParseCell: (() => {
      // Pre-compute employee group boundaries
      const empGroupStart: boolean[] = sortedRows.map((r, i) =>
        i === 0 || r.employeeCode !== sortedRows[i - 1].employeeCode
      );
      // Alternate fill per employee group
      let groupIdx = -1;
      let lastEmp = "";
      const fills: [number,number,number][] = [[255,255,255],[247,250,255]];
      const rowFill: [number,number,number][] = sortedRows.map(r => {
        if (r.employeeCode !== lastEmp) { groupIdx++; lastEmp = r.employeeCode; }
        return fills[groupIdx % 2];
      });
      return (data: any) => {
        if (data.section === "body") {
          const ri = data.row.index;
          // Alternating fill per employee group
          data.cell.styles.fillColor = rowFill[ri];
          // Top border at start of each employee group
          if (empGroupStart[ri]) {
            data.cell.styles.lineColor = [22, 48, 110];
            data.cell.styles.lineWidth = { top: 0.6, bottom: 0.1, left: 0, right: 0 };
          }
          // Status column colour
          if (data.column.index === 4) {
            const v = String(data.cell.raw || "");
            if (v === "Present")  data.cell.styles.textColor = [21, 128, 61];
            if (v === "Late")     data.cell.styles.textColor = [146, 64, 14];
            if (v === "Absent")   data.cell.styles.textColor = [185, 28, 28];
            if (v === "Half Day") data.cell.styles.textColor = [113, 63, 18];
            if (v === "Leave")    data.cell.styles.textColor = [29, 78, 216];
            if (v === "Holiday")  data.cell.styles.textColor = [100, 100, 120];
          }
          // Sunday row tint
          if (sortedRows[ri]?.isSun) data.cell.styles.fillColor = [254, 242, 242];
        }
      };
    })(),
    showHead: "everyPage",
    rowPageBreak: "avoid",
  });

  addPdfFooters(doc, pageH, pageW, liveUData);
  doc.save(`${filename}.pdf`);
}

// ── Excel export ──────────────────────────────────────────────────────────────
async function exportGridExcel(rows: any[], daysArray: number[], year: number, month: number, monthName: string, filename: string) {
  const XLSX = await import("xlsx");
  const headers = ["Employee", "Emp ID", "Designation", ...daysArray.map(d => `${d} ${getDayName(year, month, d)}`), "Present", "Absent", "Late", "Total Hrs", "OT Hrs"];
  const body = rows.map((row: any) => [
    row.employeeName, row.employeeCode, row.designation,
    ...daysArray.map(day => {
      const e = row.dailyStatus?.find((d: any) => d.day === day);
      const st = e?.status || "absent";
      const cfg = STATUS_CFG[st] || STATUS_CFG.absent;
      if (!e || st === "absent") return cfg.abbr;
      const parts = [cfg.abbr];
      if (e.inTime)  parts.push(`In: ${fmtTime(e.inTime)}`);
      if (e.outTime) parts.push(`Out: ${fmtTime(e.outTime)}`);
      if (e.hours != null) parts.push(fmtHrs(e.hours));
      return parts.join(" | ");
    }),
    row.presentDays ?? 0, row.absentDays ?? 0, row.lateDays ?? 0,
    fmtHrs(row.totalWorkHours),
    row.overtimeHours > 0 ? fmtHrs(row.overtimeHours) : "—",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${year}`);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

async function exportTableExcel(filteredTableRows: any[], monthName: string, year: number, filename: string) {
  const XLSX = await import("xlsx");
  const headers = ["Date", "Day", "Employee", "Emp ID", "Designation", "Status", "In Time", "Out Time", "Work Hrs", "OT Hrs"];
  const body = filteredTableRows.map(r => [
    `${r.day} ${monthName} ${year}`, r.dayName, r.employeeName, r.employeeCode, r.designation,
    STATUS_CFG[r.status]?.label || r.status,
    fmtTime(r.inTime) || "—", fmtTime(r.outTime) || "—",
    fmtHrs(r.hours), r.ot && r.ot > 0 ? fmtHrs(r.ot) : "—",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${year}`);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MonthlySheet() {
  const [month, setMonth]         = useState(new Date().getMonth() + 1);
  const [year, setYear]           = useState(new Date().getFullYear());
  const [view, setView]           = useState<ViewMode>("grid");
  const [showTimes, setShowTimes] = useState(true);
  const [sortKey, setSortKey]     = useState<SortKey>("date");
  const [sortAsc, setSortAsc]     = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEmp, setFilterEmp]       = useState("all");
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useMonthlySheet({ month, year });

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray   = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const rows: any[] = data?.rows || [];
  const yearOptions = [2023, 2024, 2025, 2026, 2027];
  const monthName   = new Date(2000, month - 1, 1).toLocaleString("default", { month: "long" });
  const filename    = `Monthly-Attendance-${monthName}-${year}`;

  const tableRows = useMemo(() => {
    const flat: any[] = [];
    rows.forEach((row: any) => {
      daysArray.forEach(day => {
        const entry = row.dailyStatus?.find((d: any) => d.day === day);
        flat.push({
          employeeName: row.employeeName, employeeCode: row.employeeCode, designation: row.designation,
          day, dayName: getDayName(year, month, day), isSun: isSunday(year, month, day),
          status: entry?.status || "absent", inTime: entry?.inTime || null,
          outTime: entry?.outTime || null, hours: entry?.hours ?? null,
          ot: entry?.overtimeHours ?? null,
        });
      });
    });
    return flat;
  }, [rows, daysArray, year, month]);

  const filteredTableRows = useMemo(() => {
    let r = tableRows;
    if (filterStatus !== "all") r = r.filter(x => x.status === filterStatus);
    if (filterEmp    !== "all") r = r.filter(x => x.employeeCode === filterEmp);
    return [...r].sort((a, b) => {
      let va: any, vb: any;
      switch (sortKey) {
        case "employee": va = a.employeeName; vb = b.employeeName; break;
        case "date":     va = a.day;          vb = b.day;          break;
        case "inTime":   va = a.inTime  || ""; vb = b.inTime  || ""; break;
        case "outTime":  va = a.outTime || ""; vb = b.outTime || ""; break;
        case "hours":    va = a.hours ?? -1;   vb = b.hours ?? -1;   break;
        case "status":   va = a.status;        vb = b.status;        break;
        default:         va = a.day;           vb = b.day;
      }
      return (va < vb ? -1 : va > vb ? 1 : 0) * (sortAsc ? 1 : -1);
    });
  }, [tableRows, filterStatus, filterEmp, sortKey, sortAsc]);

  const summaryByStatus = useMemo(() => {
    const c: Record<string, number> = {};
    filteredTableRows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [filteredTableRows]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  }
  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 text-muted-foreground/40" />;
    return sortAsc ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
  }

  const hasData = !isLoading && rows.length > 0;

  async function handlePdf() {
    setExporting(true);
    try {
      if (view === "grid") {
        await exportGridPdf(rows, daysArray, year, month, monthName, filename, showTimes);
      } else {
        await exportTablePdf(filteredTableRows, monthName, year, `${filename}-Timing`);
      }
    } finally { setExporting(false); }
  }

  async function handleExcel() {
    setExporting(true);
    try {
      if (view === "grid") {
        await exportGridExcel(rows, daysArray, year, month, monthName, filename);
      } else {
        await exportTableExcel(filteredTableRows, monthName, year, `${filename}-Timing`);
      }
    } finally { setExporting(false); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Monthly Attendance Sheet"
        description="Grid and detailed timing view for attendance records."
        action={
          <div className="flex items-center gap-1.5">
            <button onClick={handlePdf} disabled={!hasData || exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40">
              <FileText className="w-3.5 h-3.5" />
              {exporting ? "Generating…" : "PDF"}
            </button>
            <button onClick={handleExcel} disabled={!hasData || exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-40">
              <Sheet className="w-3.5 h-3.5" /> Excel
            </button>
          </div>
        }
      />

      {/* Controls */}
      <Card className="p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
          <Select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="w-32">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString("default", { month: "long" })}</option>
            ))}
          </Select>
          <Select value={year} onChange={e => setYear(parseInt(e.target.value))} className="w-24">
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>

        <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
          {([
            { mode: "grid"  as ViewMode, icon: LayoutGrid, label: "Grid"  },
            { mode: "table" as ViewMode, icon: List,        label: "Table" },
          ]).map(({ mode, icon: Icon, label }) => (
            <button key={mode} onClick={() => setView(mode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                view === mode ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {view === "grid" && (
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Show times</span>
            <button onClick={() => setShowTimes(v => !v)}
              className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                showTimes ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                showTimes ? "translate-x-4" : "translate-x-0.5")} />
            </button>
          </div>
        )}

        {view === "table" && (
          <>
            <Select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="text-xs h-8 w-48">
              <option value="all">All Employees</option>
              {rows.map((r: any) => <option key={r.employeeCode} value={r.employeeCode}>{r.employeeName}</option>)}
            </Select>
            <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-xs h-8 w-36">
              <option value="all">All Status</option>
              {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <span className="ml-auto text-xs text-muted-foreground">{filteredTableRows.length} records</span>
          </>
        )}
      </Card>

      {isLoading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Loading attendance data…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">No attendance records found for this period.</Card>
      ) : view === "grid" ? (
        /* ── GRID ── */
        <Card className="overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="text-xs border-collapse min-w-max">
              <thead>
                <tr>
                  <th className="px-4 py-2.5 bg-slate-700 text-white font-semibold border-b border-slate-600 sticky left-0 z-20 min-w-[220px] text-left">
                    Employee
                  </th>
                  {daysArray.map(day => (
                    <th key={day} className={cn(
                      "px-1 py-1.5 font-semibold border-b border-slate-600 text-center",
                      isSunday(year, month, day) ? "bg-red-900/70 text-red-200" : "bg-slate-700 text-white",
                      showTimes ? "min-w-[72px]" : "min-w-[34px]",
                    )}>
                      <div className="font-bold leading-tight">{day}</div>
                      <div className={cn("text-[9px] font-normal leading-tight",
                        isSunday(year, month, day) ? "text-red-300" : "text-slate-300")}>
                        {getDayName(year, month, day)}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-2.5 bg-green-700  text-white font-bold border-b border-slate-600 text-center min-w-[36px]">P</th>
                  <th className="px-2 py-2.5 bg-red-700    text-white font-bold border-b border-slate-600 text-center min-w-[36px]">A</th>
                  <th className="px-2 py-2.5 bg-amber-600  text-white font-bold border-b border-slate-600 text-center min-w-[36px]">L</th>
                  <th className="px-3 py-2.5 bg-blue-700   text-white font-bold border-b border-slate-600 text-center min-w-[64px]">Total Hrs</th>
                  <th className="px-3 py-2.5 bg-orange-600 text-white font-bold border-b border-slate-600 text-center min-w-[56px]">OT Hrs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any, idx: number) => (
                  <tr key={idx} className="hover:bg-muted/20 border-b border-border/50 group">
                    <td className="px-3 py-2 bg-card border-r border-border sticky left-0 z-10 shadow-[1px_0_0_0_hsl(var(--border))] group-hover:bg-muted/10">
                      <div className="font-semibold text-foreground truncate max-w-[200px]">{row.employeeName}</div>
                      <div className="text-[10px] text-muted-foreground">{row.employeeCode} · {row.designation}</div>
                    </td>
                    {daysArray.map(day => {
                      const entry = row.dailyStatus?.find((d: any) => d.day === day);
                      const st  = entry?.status || "absent";
                      const cfg = STATUS_CFG[st] || STATUS_CFG.absent;
                      const inT = fmtTime(entry?.inTime);
                      const outT= fmtTime(entry?.outTime);
                      const hrs = entry?.hours;
                      return (
                        <td key={day} className={cn("px-0.5 py-0.5 text-center align-middle",
                          isSunday(year, month, day) && "bg-red-50/30")}>
                          {showTimes ? (
                            <div className={cn("rounded px-0.5 py-0.5 flex flex-col items-center gap-0", cfg.bg)}>
                              <span className={cn("text-[10px] font-bold leading-tight", cfg.text)}>{cfg.abbr}</span>
                              {inT  && <span className="text-[8px] leading-tight text-green-700 font-mono">{inT}</span>}
                              {outT && <span className="text-[8px] leading-tight text-red-600  font-mono">{outT}</span>}
                              {hrs != null && <span className="text-[8px] leading-tight font-semibold text-gray-600">{fmtHrs(hrs)}</span>}
                            </div>
                          ) : (
                            <div className={cn("w-7 h-7 mx-auto flex items-center justify-center rounded text-[10px] font-bold", cfg.bg, cfg.text)}>
                              {cfg.abbr}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center font-bold text-green-700 bg-green-50/40">{row.presentDays ?? 0}</td>
                    <td className="px-2 py-2 text-center font-bold text-red-600   bg-red-50/40"  >{row.absentDays  ?? 0}</td>
                    <td className="px-2 py-2 text-center font-bold text-amber-600 bg-amber-50/40">{row.lateDays    ?? 0}</td>
                    <td className="px-3 py-2 text-center font-mono font-semibold text-blue-700   bg-blue-50/30">{fmtHrs(row.totalWorkHours)}</td>
                    <td className={cn("px-3 py-2 text-center font-mono font-semibold bg-orange-50/30",
                      row.overtimeHours > 0 ? "text-orange-600" : "text-muted-foreground")}>
                      {row.overtimeHours > 0 ? fmtHrs(row.overtimeHours) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* ── TABLE ── */
        <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_CFG).map(([k, cfg]) =>
              summaryByStatus[k] ? (
                <div key={k} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium", cfg.badge)}>
                  <div className={cn("w-2 h-2 rounded-full", cfg.dot)} />
                  {cfg.label} <span className="font-bold tabular-nums">{summaryByStatus[k]}</span>
                </div>
              ) : null
            )}
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-700 text-white">
                    <th className="px-4 py-3 text-left font-semibold border-b border-slate-600">
                      <button className="flex items-center gap-1" onClick={() => toggleSort("date")}>Date <SortIcon k="date" /></button>
                    </th>
                    <th className="px-2 py-3 text-center font-semibold border-b border-slate-600 text-slate-300">Day</th>
                    <th className="px-4 py-3 text-left font-semibold border-b border-slate-600">
                      <button className="flex items-center gap-1" onClick={() => toggleSort("employee")}>Employee <SortIcon k="employee" /></button>
                    </th>
                    <th className="px-3 py-3 text-center font-semibold border-b border-slate-600">
                      <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("status")}>Status <SortIcon k="status" /></button>
                    </th>
                    <th className="px-4 py-3 text-center font-semibold border-b border-slate-600 text-green-300">
                      <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("inTime")}>
                        <Clock className="w-3 h-3" /> In Time <SortIcon k="inTime" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center font-semibold border-b border-slate-600 text-red-300">
                      <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("outTime")}>
                        <Clock className="w-3 h-3" /> Out Time <SortIcon k="outTime" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center font-semibold border-b border-slate-600 text-blue-300">
                      <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("hours")}>Work Hrs <SortIcon k="hours" /></button>
                    </th>
                    <th className="px-4 py-3 text-center font-semibold border-b border-slate-600 text-orange-300">OT Hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableRows.map((r, i) => {
                    const cfg = STATUS_CFG[r.status] || STATUS_CFG.absent;
                    return (
                      <tr key={i} className={cn(
                        "border-b border-border/40 transition-colors",
                        r.isSun ? "bg-red-50/40 hover:bg-red-50/70" : i % 2 === 0 ? "hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/30"
                      )}>
                        <td className="px-4 py-2.5">
                          <div className={cn("w-10 h-10 rounded-lg flex flex-col items-center justify-center font-bold leading-none",
                            r.isSun ? "bg-red-100 text-red-700" : "bg-primary/10 text-primary")}>
                            <span className="text-[10px]">{monthName.slice(0,3)}</span>
                            <span className="text-sm">{r.day}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className={cn("font-medium", r.isSun ? "text-red-500" : "text-muted-foreground")}>{r.dayName}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-foreground">{r.employeeName}</div>
                          <div className="text-[10px] text-muted-foreground">{r.employeeCode} · {r.designation}</div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold", cfg.badge)}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} /> {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {r.inTime ? (
                            <span className="inline-block bg-green-50 border border-green-200 text-green-700 font-mono font-semibold px-2.5 py-1 rounded-lg text-[11px]">
                              {fmtTime(r.inTime)}
                            </span>
                          ) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {r.outTime ? (
                            <span className="inline-block bg-red-50 border border-red-200 text-red-700 font-mono font-semibold px-2.5 py-1 rounded-lg text-[11px]">
                              {fmtTime(r.outTime)}
                            </span>
                          ) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {r.hours != null ? (
                            <span className="inline-block bg-blue-50 border border-blue-200 text-blue-700 font-mono font-semibold px-2.5 py-1 rounded-lg text-[11px]">
                              {fmtHrs(r.hours)}
                            </span>
                          ) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {r.ot && r.ot > 0 ? (
                            <span className="inline-block bg-orange-50 border border-orange-200 text-orange-700 font-mono font-semibold px-2.5 py-1 rounded-lg text-[11px]">
                              {fmtHrs(r.ot)}
                            </span>
                          ) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredTableRows.length === 0 && (
                <div className="p-12 text-center text-sm text-muted-foreground">No records match the selected filters.</div>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground bg-card p-3 rounded-xl border border-border">
        {Object.entries(STATUS_CFG).map(([, cfg]) => (
          <span key={cfg.label} className="flex items-center gap-1.5">
            <span className={cn("w-3 h-3 rounded-full inline-block", cfg.dot)} /> {cfg.label}
          </span>
        ))}
        <span className="ml-auto text-muted-foreground/60 italic">
          Grid PDF = per-employee monthly sheet with time rows · Table PDF = full timing detail
        </span>
      </div>
    </div>
  );
}
