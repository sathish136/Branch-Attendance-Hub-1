import React, { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon, Clock,
  LayoutGrid, List, ChevronUp, ChevronDown,
  FileText, Sheet, Building2, ChevronDown as ChevronDownIcon, Users,
} from "lucide-react";
import { PageHeader, Card, Select } from "@/components/ui";
import { useMonthlySheet } from "@/hooks/use-attendance";
import { useBranches } from "@/hooks/use-core";
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

function addPdfFooters(doc: any, pageH: number, pageW: number, liveUData: string | null, subtitle?: string) {
  const count = doc.internal.getNumberOfPages();
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 210, 230);
    doc.setLineWidth(0.3);
    doc.line(8, pageH - 13, pageW - 8, pageH - 13);
    // Report subtitle on every page (left-aligned)
    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 100, 130);
      doc.text(`${subtitle}   |   Generated: ${today}`, 8, pageH - 8.5);
    }
    // Live U logo + branding (center)
    if (liveUData) doc.addImage(liveUData, "JPEG", pageW / 2 - 18, pageH - 11, 5, 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 140);
    const px = liveUData ? pageW / 2 - 11 : pageW / 2;
    doc.text("Powered by  Live U (Pvt) Ltd, Sri Lanka", px, pageH - 7, { align: "left" });
    // Page number (right)
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${count}`, pageW - 8, pageH - 8.5, { align: "right" });
  }
}

// Abbreviated 24h time for tight PDF cells e.g. "08:30"
function fmtTime24(t: string | null | undefined) {
  const p = parseTime(t);
  if (!p) return null;
  return `${String(p.h).padStart(2, "0")}:${p.m}`;
}

// ── Grid PDF — compact multi-employee layout (all employees on as few pages as possible) ──
async function exportGridPdf(
  rows: any[],
  daysArray: number[],
  year: number,
  month: number,
  monthName: string,
  filename: string,
  _showTimes: boolean,
  branchLabel: string,
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

  const margin   = 6;
  const contentW = pageW - margin * 2;
  const periodStr = `Period: ${String(1).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year} \u2013 ${String(daysArray[daysArray.length-1]).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year}`;

  // Column widths: employee name col | time label col | day cols | summary cols
  const empW   = 32;  // employee name column
  const timeW  = 8;   // In/Out/Hrs label
  const sumW   = 9;   // P / A / L / TotalHrs
  const nSumCols = 3;
  const dayW   = Math.max(5.8, (contentW - empW - timeW - sumW * nSumCols) / daysArray.length);

  // Column index helpers
  const COL_EMP   = 0;
  const COL_TIME  = 1;
  const COL_DAY0  = 2;                         // first day column
  const COL_P     = COL_DAY0 + daysArray.length;
  const COL_A     = COL_P + 1;
  const COL_TOTAL = COL_A + 1;

  // ── Page header (drawn once; autoTable repeats head on every page) ───────────
  async function drawPageHeader(): Promise<number> {
    let logoW = 0, logoH = 0;
    if (slpData) {
      const dims = await getImageDimensions(slpData);
      logoH = 14; logoW = 14 * (dims.w / dims.h);
      doc.addImage(slpData, "PNG", (pageW - logoW) / 2, 3, logoW, logoH);
    }
    const textY = 3 + logoH + 1.5;
    doc.setFont("helvetica", "bold");   doc.setFontSize(11); doc.setTextColor(22, 48, 110);
    doc.text("SRI LANKA POST", pageW / 2, textY + 3.5, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(80, 80, 100);
    doc.text("Human Resources Department", pageW / 2, textY + 7.5, { align: "center" });
    doc.setFont("helvetica", "bold");   doc.setFontSize(7.5); doc.setTextColor(139, 0, 0);
    doc.text("MONTHLY ATTENDANCE SHEET", pageW / 2, textY + 11.5, { align: "center" });
    doc.setFont("helvetica", "bold");   doc.setFontSize(8); doc.setTextColor(22, 48, 110);
    doc.text(`Branch: ${branchLabel}`, pageW / 2, textY + 17, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(80, 80, 100);
    doc.text(periodStr, pageW - margin, 6, { align: "right" });
    const ruleY = textY + 20;
    doc.setDrawColor(180, 190, 210); doc.setLineWidth(0.4);
    doc.line(margin, ruleY, pageW - margin, ruleY);
    return ruleY + 1.5;
  }

  // ── Column styles ────────────────────────────────────────────────────────────
  const colStyles: Record<number, any> = {
    [COL_EMP]:  { cellWidth: empW,  halign: "left",   fontStyle: "bold",   fontSize: 6.5, textColor: [22, 48, 110]  },
    [COL_TIME]: { cellWidth: timeW, halign: "center", fontStyle: "normal", fontSize: 6,   textColor: [80, 80, 100]  },
    [COL_P]:    { cellWidth: sumW,  halign: "center", fontStyle: "bold",   fontSize: 7,   textColor: [21, 128, 61]  },
    [COL_A]:    { cellWidth: sumW,  halign: "center", fontStyle: "bold",   fontSize: 7,   textColor: [185, 28, 28]  },
    [COL_TOTAL]:{ cellWidth: sumW,  halign: "center", fontStyle: "bold",   fontSize: 6.5, textColor: [29, 78, 216]  },
  };
  daysArray.forEach((_, i) => {
    colStyles[COL_DAY0 + i] = {
      cellWidth: dayW,
      halign: "center",
      fontSize: 6,
      cellPadding: { top: 1, bottom: 1, left: 0.3, right: 0.3 },
    };
  });

  // ── Head row ─────────────────────────────────────────────────────────────────
  const headRow = [
    "Employee", "Time",
    ...daysArray.map(d => `${String(d).padStart(2,"0")}\n${getDayName(year, month, d)}`),
    "P", "A", "Total\nHrs",
  ];

  // ── Helper: build body data for a slice of employees ─────────────────────────
  const buildBodyForSlice = (slice: any[]) => {
    const bodyData: any[][] = [];
    const bodyMeta: Array<{ empIdxInSlice: number; sub: number }> = [];
    slice.forEach((row, empIdxInSlice) => {
      const subLabels = ["In", "Out", "Hrs"];
      [0, 1, 2].forEach(sub => {
        const dayVals = daysArray.map(day => {
          const e  = row.dailyStatus?.find((d: any) => d.day === day);
          const st = e?.status || "absent";
          if (sub === 0) return fmtTime24(e?.inTime)  || (st !== "absent" && st !== "holiday" && st !== "leave" ? "—" : st === "holiday" ? "H" : st === "leave" ? "LV" : "");
          if (sub === 1) return fmtTime24(e?.outTime) || "";
          const h = e?.hours;
          if (h != null && h > 0) return fmtHrs(h);
          if (st !== "absent") return (STATUS_CFG[st] || STATUS_CFG.absent).abbr;
          return "";
        });
        const empCell   = sub === 0 ? `${row.employeeName}\n${row.employeeCode}${row.designation ? `\n${row.designation}` : ""}` : "";
        const pCell     = sub === 0 ? String(row.presentDays ?? 0) : "";
        const aCell     = sub === 0 ? String(row.absentDays  ?? 0) : "";
        const totalCell = sub === 0 ? fmtHrs(row.totalWorkHours) : "";
        bodyData.push([empCell, subLabels[sub], ...dayVals, pCell, aCell, totalCell]);
        bodyMeta.push({ empIdxInSlice, sub });
      });
    });
    return { bodyData, bodyMeta };
  };

  // ── Render one chunk of employees ────────────────────────────────────────────
  const renderChunk = (slice: any[], startY: number) => {
    const { bodyData, bodyMeta } = buildBodyForSlice(slice);
    autoTable(doc, {
      head: [headRow],
      body: bodyData,
      startY,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      styles: {
        font: "helvetica",
        fontSize: 6,
        cellPadding: { top: 1.2, bottom: 1.2, left: 1, right: 1 },
        textColor: [40, 40, 60],
        lineColor: [210, 218, 232],
        lineWidth: 0.2,
        minCellHeight: 5,
        overflow: "linebreak",
        halign: "center",
        valign: "middle",
      },
      headStyles: {
        fillColor: [30, 48, 100],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 5.8,
        halign: "center",
        cellPadding: { top: 1.5, bottom: 1.5, left: 0.5, right: 0.5 },
        minCellHeight: 9,
        lineWidth: 0,
      },
      columnStyles: colStyles,
      bodyStyles:         { fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      showHead: "firstPage",
      rowPageBreak: "avoid",
      didParseCell: (data: any) => {
        if (data.section !== "body") {
          if (data.column.index === COL_EMP)  data.cell.styles.fillColor = [18, 38, 88];
          if (data.column.index === COL_TIME) data.cell.styles.fillColor = [18, 38, 88];
          const dIdx = data.column.index - COL_DAY0;
          if (dIdx >= 0 && dIdx < daysArray.length && isSunday(year, month, daysArray[dIdx]))
            data.cell.styles.fillColor = [110, 20, 20];
          if (data.column.index >= COL_P) data.cell.styles.fillColor = [18, 38, 88];
          return;
        }
        const { empIdxInSlice, sub } = bodyMeta[data.row.index];
        const row = slice[empIdxInSlice];
        const isFirstSub = sub === 0;
        const isLastSub  = sub === 2;
        const isNewEmp   = isFirstSub;

        if (data.column.index === COL_EMP) {
          data.cell.styles.fillColor = [237, 242, 255];
          data.cell.styles.valign    = "top";
          data.cell.styles.fontSize  = 6.5;
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [22, 48, 110];
          if (!isFirstSub) data.cell.styles.lineWidth = { top: 0, left: 0.2, bottom: isLastSub ? 0.2 : 0, right: 0.2 };
          if (isFirstSub && !isLastSub) data.cell.styles.lineWidth = { top: isNewEmp ? 0.6 : 0.2, left: 0.2, bottom: 0, right: 0.2 };
          if (isNewEmp) data.cell.styles.lineColor = { top: [22, 48, 110], left: [210,218,232], bottom: [210,218,232], right: [210,218,232] } as any;
          return;
        }
        if (data.column.index === COL_TIME) {
          if (sub === 0) { data.cell.styles.textColor = [21, 128, 61];  data.cell.styles.fontStyle = "bold"; }
          if (sub === 1) { data.cell.styles.textColor = [185, 28, 28];  data.cell.styles.fontStyle = "bold"; }
          if (sub === 2) { data.cell.styles.textColor = [29, 78, 216];  data.cell.styles.fontStyle = "bold"; }
          data.cell.styles.fillColor = sub === 0 ? [235, 252, 240] : sub === 1 ? [255, 242, 242] : [235, 244, 255];
          if (isNewEmp) data.cell.styles.lineWidth = { top: 0.6, left: 0.2, bottom: 0.2, right: 0.2 };
          return;
        }
        if (data.column.index >= COL_P) {
          const bgColor = data.column.index === COL_P ? [235, 252, 240]
            : data.column.index === COL_A ? [255, 242, 242]
            : [235, 244, 255];
          data.cell.styles.fillColor = bgColor;
          if (!isFirstSub) data.cell.styles.lineWidth = { top: 0, left: 0.2, bottom: isLastSub ? 0.2 : 0, right: 0.2 };
          if (isFirstSub)  data.cell.styles.lineWidth = { top: isNewEmp ? 0.6 : 0.2, left: 0.2, bottom: 0, right: 0.2 };
          return;
        }
        const dIdx = data.column.index - COL_DAY0;
        if (dIdx < 0 || dIdx >= daysArray.length) return;
        const day = daysArray[dIdx];
        const isSun = isSunday(year, month, day);
        const e  = row.dailyStatus?.find((d: any) => d.day === day);
        const st = e?.status || "absent";
        data.cell.styles.fillColor = isSun ? [254, 240, 240] : [255, 255, 255];
        if (isNewEmp) data.cell.styles.lineWidth = { top: 0.6, left: 0.2, bottom: 0.2, right: 0.2 };
        if (sub === 0) data.cell.styles.textColor = [21, 120, 50];
        if (sub === 1) data.cell.styles.textColor = [170, 20, 20];
        if (sub === 2) {
          const v = String(data.cell.raw || "");
          if (v === "P")       data.cell.styles.textColor = [21, 128, 61];
          else if (v === "L")  data.cell.styles.textColor = [146, 64, 14];
          else if (v === "A")  data.cell.styles.textColor = [185, 28, 28];
          else if (v === "HD") data.cell.styles.textColor = [113, 63, 18];
          else if (v === "LV") data.cell.styles.textColor = [29, 78, 216];
          else if (v === "H")  data.cell.styles.textColor = [100, 100, 120];
          else                 data.cell.styles.textColor = [50, 80, 160];
        }
      },
    });
  }

  // ── Render in chunks of 6 employees per page ──────────────────────────────
  const CHUNK = 6;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    if (i > 0) doc.addPage();
    const startY = await drawPageHeader();
    renderChunk(slice, startY);
  }

  // ── Footers ──────────────────────────────────────────────────────────────────
  const count = doc.internal.getNumberOfPages();
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 210, 230); doc.setLineWidth(0.3);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.8); doc.setTextColor(130, 130, 150);
    doc.text(`Generated: ${today} | Sri Lanka Post | Confidential Document`, pageW / 2, pageH - 6.5, { align: "center" });
    if (liveUData) doc.addImage(liveUData, "JPEG", pageW / 2 - 17, pageH - 5, 3.5, 3.5);
    doc.text("Powered by  Live U (Pvt) Ltd", pageW / 2 - 12, pageH - 3, { align: "left" });
    doc.setTextColor(160);
    doc.text(`Page ${i} of ${count}`, pageW - margin, pageH - 6.5, { align: "right" });
  }

  doc.save(`${filename}.pdf`);
}

// ── Table PDF — timing detail, portrait ───────────────────────────────────────
async function exportTablePdf(
  filteredTableRows: any[],
  monthName: string,
  year: number,
  filename: string,
  branchLabel: string,
) {
  const { default: autoTable } = await import("jspdf-autotable");
  const { doc, pageW, pageH, headerH, liveUData } = await buildPdfBase("landscape", `Timing Detail — ${branchLabel} — ${monthName} ${year}`, filename);

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
    bodyStyles:         { fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    didParseCell: (() => {
      // Pre-compute employee group start boundaries (for separator line)
      const empGroupStart: boolean[] = sortedRows.map((r, i) =>
        i === 0 || r.employeeCode !== sortedRows[i - 1].employeeCode
      );
      return (data: any) => {
        if (data.section === "body") {
          const ri = data.row.index;
          // All rows white — same as web view
          data.cell.styles.fillColor = [255, 255, 255];
          // Navy top border at the start of each employee group
          if (empGroupStart[ri]) {
            data.cell.styles.lineColor = [22, 48, 110];
            data.cell.styles.lineWidth = { top: 0.7, bottom: 0.1, left: 0, right: 0 };
          }
          // Status column — colour by status
          if (data.column.index === 4) {
            const v = String(data.cell.raw || "");
            if (v === "Present")  data.cell.styles.textColor = [21, 128, 61];
            if (v === "Late")     data.cell.styles.textColor = [146, 64, 14];
            if (v === "Absent")   data.cell.styles.textColor = [185, 28, 28];
            if (v === "Half Day") data.cell.styles.textColor = [113, 63, 18];
            if (v === "Leave")    data.cell.styles.textColor = [29, 78, 216];
            if (v === "Holiday")  data.cell.styles.textColor = [100, 100, 120];
          }
          // Sunday row — light red tint
          if (sortedRows[ri]?.isSun) data.cell.styles.fillColor = [254, 242, 242];
        }
      };
    })(),
    showHead: "everyPage",
    rowPageBreak: "avoid",
  });

  addPdfFooters(doc, pageH, pageW, liveUData, `Timing Detail — ${monthName} ${year}`);
  doc.save(`${filename}.pdf`);
}

// ── Excel helpers ─────────────────────────────────────────────────────────────
function xlFill(argb: string) {
  return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } };
}
function xlFont(opts: { bold?: boolean; size?: number; color?: string; italic?: boolean }) {
  return { bold: opts.bold, size: opts.size, color: opts.color ? { argb: opts.color } : undefined, italic: opts.italic };
}
function xlBorder(color = "FFC8D2E6") {
  const s = { style: "thin" as const, color: { argb: color } };
  return { top: s, left: s, bottom: s, right: s };
}
function xlAlign(h: "left"|"center"|"right" = "center", wrap = false) {
  return { horizontal: h, vertical: "middle" as const, wrapText: wrap };
}

// ── Grid Excel — matches Grid PDF: per-employee multi-row blocks ──────────────
async function exportGridExcel(rows: any[], daysArray: number[], year: number, month: number, monthName: string, filename: string, branchLabel: string) {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  wb.creator = "Sri Lanka Post";
  wb.created = new Date();
  const ws = wb.addWorksheet(`${monthName} ${year}`);

  const numDays  = daysArray.length;
  const totalCols = 1 + numDays; // label col + one col per day
  const periodStr = `Period: ${String(1).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year} \u2013 ${String(daysArray[daysArray.length-1]).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year}`;

  // Set column widths
  ws.getColumn(1).width = 14;
  daysArray.forEach((_, i) => { ws.getColumn(i + 2).width = 6.5; });

  function addMergedTitle(text: string, fontColor: string, bold: boolean, size: number, fillColor: string) {
    const r = ws.addRow([text]);
    ws.mergeCells(r.number, 1, r.number, totalCols);
    r.height = size + 6;
    r.getCell(1).font      = xlFont({ bold, size, color: fontColor });
    r.getCell(1).alignment = xlAlign("center");
    r.getCell(1).fill      = xlFill(fillColor);
  }

  const STATUS_XL_COLORS: Record<string, string> = {
    P: "FF157F3D", L: "FF92400E", A: "FFB91C1C",
    HD: "FF713F12", LV: "FF1D4ED8", H: "FF646478",
  };

  // ── Document header — once at the top only ────────────────────────────────
  addMergedTitle("SRI LANKA POST",              "FF16306E", true,  13, "FFFFFFFF");
  addMergedTitle("Human Resources Department",  "FF505064", false,  8, "FFFFFFFF");
  addMergedTitle("MONTHLY ATTENDANCE SHEET",    "FF8B0000", true,   9, "FFFFFFFF");
  addMergedTitle(`Branch: ${branchLabel}`,      "FF1E3A8A", false,  8, "FFFFFFFF");
  addMergedTitle(periodStr,                     "FF505064", false,  7, "FFFFFFFF");
  ws.addRow([]);

  for (const [empIdx, row] of rows.entries()) {
    if (empIdx > 0) ws.addRow([]); // blank separator between employees

    // ── Employee info bar ──────────────────────────────────────────
    const infoFields = [
      `Employee Name: ${row.employeeName || "N/A"}`,
      `Employee ID: ${row.employeeCode || "N/A"}`,
      `Department: ${row.department || "N/A"}`,
      ...(row.staffCategory ? [`Staff Category: ${row.staffCategory}`] : []),
    ];
    const span = Math.max(1, Math.floor(totalCols / infoFields.length));
    const infoRowNum = ws.rowCount + 1;
    ws.addRow(infoFields);
    const infoRow = ws.getRow(infoRowNum);
    infoRow.height = 16;
    infoRow.fill   = xlFill("FFE8EEFF");
    infoFields.forEach((_, fi) => {
      const startCol = fi * span + 1;
      const endCol   = fi === infoFields.length - 1 ? totalCols : (fi + 1) * span;
      if (endCol > startCol) ws.mergeCells(infoRowNum, startCol, infoRowNum, endCol);
      const cell = infoRow.getCell(startCol);
      cell.font      = xlFont({ bold: true, size: 7.5, color: "FF16306E" });
      cell.alignment = xlAlign("left");
      cell.border    = xlBorder();
    });

    ws.addRow([]);

    // ── Day header row ─────────────────────────────────────────────
    const headValues = [
      "TIME\nDETAILS",
      ...daysArray.map(d => `${String(d).padStart(2,"0")}\n${getDayName(year, month, d)}`),
    ];
    const headRowNum = ws.rowCount + 1;
    ws.addRow(headValues);
    const headRow = ws.getRow(headRowNum);
    headRow.height = 24;
    headValues.forEach((_, ci) => {
      const cell = headRow.getCell(ci + 1);
      const day  = daysArray[ci - 1];
      const isSun = ci > 1 && isSunday(year, month, day);
      cell.fill      = xlFill(ci === 1 ? "FF0F235A" : isSun ? "FF7F1D1D" : "FF16306E");
      cell.font      = xlFont({ bold: true, size: 6, color: "FFFFFFFF" });
      cell.alignment = xlAlign("center", true);
      cell.border    = xlBorder("FF8090B0");
    });

    // ── Metric rows (IN TIME / OUT TIME / WORKED HRS / STATUS / OVERTIME) ──
    type MetricKey2 = "inTime"|"outTime"|"workedHrs"|"status"|"overtime";
    const METRICS: Array<{ label: string; key: MetricKey2; color: string }> = [
      { label: "IN TIME",    key: "inTime",    color: "FFB91C1C" },
      { label: "OUT TIME",   key: "outTime",   color: "FF16306E" },
      { label: "WORKED HRS", key: "workedHrs", color: "FF323246" },
      { label: "STATUS",     key: "status",    color: "FF000000" },
      { label: "OVERTIME",   key: "overtime",  color: "FFB45309" },
    ];

    for (const metric of METRICS) {
      const cells: (string|number)[] = [metric.label];
      daysArray.forEach(day => {
        const e  = row.dailyStatus?.find((d: any) => d.day === day);
        const st = e?.status || "absent";
        const abbr = (STATUS_CFG[st] || STATUS_CFG.absent).abbr;
        switch (metric.key) {
          case "inTime":    cells.push(fmtTime24(e?.inTime)  || (st === "absent" ? "" : "—")); break;
          case "outTime":   cells.push(fmtTime24(e?.outTime) || (st === "absent" ? "" : "—")); break;
          case "workedHrs": { const h = e?.hours; cells.push(h != null && h > 0 ? fmtHrs(h) : (st === "absent" ? "" : "—")); break; }
          case "status":    cells.push(abbr); break;
          case "overtime":  { const ot = e?.overtimeHours; cells.push(ot && ot > 0 ? fmtHrs(ot) : "-"); break; }
        }
      });

      const mRowNum = ws.rowCount + 1;
      ws.addRow(cells);
      const mRow = ws.getRow(mRowNum);
      mRow.height = 13;
      cells.forEach((_, ci) => {
        const cell = mRow.getCell(ci + 1);
        const day  = daysArray[ci - 1];
        const isSun = ci > 1 && day && isSunday(year, month, day);
        if (ci === 1) {
          cell.fill      = xlFill("FFE8EEFF");
          cell.font      = xlFont({ bold: true, size: 6, color: "FF16306E" });
          cell.alignment = xlAlign("left");
        } else {
          cell.fill = xlFill(isSun ? "FFFEF2F2" : "FFFFFFFF");
          let color = metric.color;
          if (metric.key === "status") { color = STATUS_XL_COLORS[String(cell.value || "")] || "FF646478"; }
          cell.font      = xlFont({ size: 7, color });
          cell.alignment = xlAlign("center");
        }
        cell.border = xlBorder();
      });
    }

    // ── Monthly summary bar ────────────────────────────────────────
    const totalHrs = fmtHrs(row.totalWorkHours);
    const totalOT  = row.overtimeHours > 0 ? fmtHrs(row.overtimeHours) : "0h";
    const sumText  = `MONTHLY SUMMARY — ${row.employeeName} (${row.employeeCode})   |   Total Working Hours: ${totalHrs}   |   Total Overtime Hours: ${totalOT}`;
    const sumRowNum = ws.rowCount + 1;
    ws.addRow([sumText]);
    ws.mergeCells(sumRowNum, 1, sumRowNum, totalCols);
    const sumRow = ws.getRow(sumRowNum);
    sumRow.height = 14;
    sumRow.getCell(1).fill      = xlFill("FFEBF0FC");
    sumRow.getCell(1).font      = xlFont({ bold: true, size: 8, color: "FF16306E" });
    sumRow.getCell(1).alignment = xlAlign("left");
    sumRow.getCell(1).border    = xlBorder("FFAABCDC");
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `${filename}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// ── Table Excel — matches Table PDF: flat timing list ─────────────────────────
async function exportTableExcel(filteredTableRows: any[], monthName: string, year: number, filename: string, branchLabel: string) {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  wb.creator = "Sri Lanka Post";
  wb.created = new Date();
  const ws = wb.addWorksheet(`${monthName} ${year}`);

  // Sort to match PDF: employee name → code → day
  const sortedRows = [...filteredTableRows].sort((a, b) => {
    const nc = a.employeeName.localeCompare(b.employeeName);
    if (nc !== 0) return nc;
    const cc = a.employeeCode.localeCompare(b.employeeCode);
    if (cc !== 0) return cc;
    return a.day - b.day;
  });

  // ── Title rows ──────────────────────────────────────────────────
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const numCols = 9;
  const addTitle = (text: string, bold: boolean, size: number, color: string) => {
    const r = ws.addRow([text]);
    ws.mergeCells(r.number, 1, r.number, numCols);
    r.height = size + 5;
    r.getCell(1).font      = xlFont({ bold, size, color });
    r.getCell(1).alignment = xlAlign("center");
  };
  addTitle("SRI LANKA POST — Colombo District", true, 12, "FF16306E");
  addTitle(`Timing Detail — ${monthName} ${year}`, false, 9, "FF505064");
  addTitle(`Branch: ${branchLabel}`, false, 8, "FF1E3A8A");
  addTitle(`Generated: ${today}`, false, 7.5, "FF888898");
  ws.addRow([]);

  // ── Column widths ───────────────────────────────────────────────
  const colWidths = [20, 10, 28, 14, 16, 14, 14, 14, 12];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ── Header row ──────────────────────────────────────────────────
  const headers = ["Date", "Day", "Employee", "Emp ID", "Status", "In Time", "Out Time", "Work Hrs", "OT Hrs"];
  const headRowNum = ws.rowCount + 1;
  ws.addRow(headers);
  const headRow = ws.getRow(headRowNum);
  headRow.height = 18;
  headers.forEach((_, ci) => {
    const cell = headRow.getCell(ci + 1);
    cell.fill      = xlFill("FF16306E");
    cell.font      = xlFont({ bold: true, size: 9, color: "FFFFFFFF" });
    cell.alignment = xlAlign(ci <= 1 || ci === 2 ? "left" : "center");
    cell.border    = xlBorder("FF8090B0");
  });

  // ── Data rows ───────────────────────────────────────────────────
  const STATUS_XL: Record<string, string> = {
    present: "FF157F3D", late: "FF92400E", absent: "FFB91C1C",
    half_day: "FF713F12", leave: "FF1D4ED8", holiday: "FF646478",
  };

  sortedRows.forEach((r, i) => {
    const isNewEmp = i === 0 || r.employeeCode !== sortedRows[i - 1].employeeCode;
    const values = [
      `${String(r.day).padStart(2,"0")} ${monthName} ${year}`,
      r.dayName,
      r.employeeName,
      r.employeeCode,
      STATUS_CFG[r.status]?.label || r.status,
      fmtTime(r.inTime)  || "—",
      fmtTime(r.outTime) || "—",
      fmtHrs(r.hours),
      r.ot && r.ot > 0 ? fmtHrs(r.ot) : "—",
    ];
    const rowNum = ws.rowCount + 1;
    ws.addRow(values);
    const dataRow = ws.getRow(rowNum);
    dataRow.height = 15;

    values.forEach((_, ci) => {
      const cell = dataRow.getCell(ci + 1);
      cell.fill      = xlFill(r.isSun ? "FFFEF2F2" : "FFFFFFFF");
      cell.alignment = xlAlign(ci === 2 ? "left" : ci <= 1 ? "center" : "center");
      cell.font      = xlFont({ size: 9, color: "FF282840" });
      // Per-column styling
      if (ci === 2) cell.font = xlFont({ bold: true, size: 9, color: "FF16306E" });
      if (ci === 4) cell.font = xlFont({ size: 9, color: STATUS_XL[r.status] || "FF646478" });
      if (ci === 5) cell.font = xlFont({ size: 9, color: "FF157F3D" });
      if (ci === 6) cell.font = xlFont({ size: 9, color: "FFB91C1C" });
      if (ci === 7) cell.font = xlFont({ size: 9, color: "FF1D4ED8" });
      if (ci === 8) cell.font = xlFont({ size: 9, color: "FFC2410C" });

      // Navy top border at new employee group
      const topBorder = isNewEmp
        ? { style: "medium" as const, color: { argb: "FF16306E" } }
        : { style: "thin" as const, color: { argb: "FFD8E0EE" } };
      cell.border = { top: topBorder, left: xlBorder().left, bottom: xlBorder().bottom, right: xlBorder().right };
    });
  });

  // ── Footer row ──────────────────────────────────────────────────
  ws.addRow([]);
  const footRowNum = ws.rowCount + 1;
  ws.addRow([`Generated: ${today} | Sri Lanka Post | Confidential Document`]);
  ws.mergeCells(footRowNum, 1, footRowNum, numCols);
  const footRow = ws.getRow(footRowNum);
  footRow.getCell(1).font      = xlFont({ size: 7, color: "FF888898" });
  footRow.getCell(1).alignment = xlAlign("center");

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `${filename}.xlsx`; a.click();
  URL.revokeObjectURL(url);
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
  const [branchId, setBranchId]         = useState("all");
  const [exporting, setExporting] = useState(false);

  const { data: branchesRaw } = useBranches();
  const branches: any[] = useMemo(() => [...((branchesRaw as any[]) || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [branchesRaw]);

  const { data, isLoading } = useMonthlySheet({
    month, year,
    ...(branchId !== "all" ? { branchId: Number(branchId) } : {}),
  });

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray   = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const rows: any[] = data?.rows || [];
  const filteredGridRows = useMemo(() =>
    filterEmp === "all" ? rows : rows.filter((r: any) => r.employeeCode === filterEmp),
  [rows, filterEmp]);
  const yearOptions = [2023, 2024, 2025, 2026, 2027];
  const monthName   = new Date(2000, month - 1, 1).toLocaleString("default", { month: "long" });
  const selectedBranch = branches.find((b: any) => String(b.id) === branchId);
  const branchLabel = selectedBranch ? selectedBranch.name : "All-Branches";
  const filename    = `Monthly-Attendance-${branchLabel}-${monthName}-${year}`;

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
        await exportGridPdf(rows, daysArray, year, month, monthName, filename, showTimes, branchLabel);
      } else {
        await exportTablePdf(filteredTableRows, monthName, year, `${filename}-Timing`, branchLabel);
      }
    } finally { setExporting(false); }
  }

  async function handleExcel() {
    setExporting(true);
    try {
      if (view === "grid") {
        await exportGridExcel(rows, daysArray, year, month, monthName, filename, branchLabel);
      } else {
        await exportTableExcel(filteredTableRows, monthName, year, `${filename}-Timing`, branchLabel);
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

        {/* Branch filter */}
        <div className="relative shrink-0">
          <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            className="h-8 pl-8 pr-8 rounded-lg border border-border bg-background text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all cursor-pointer min-w-[160px]"
          >
            <option value="all">All Branches</option>
            {branches.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
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
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative shrink-0">
              <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={filterEmp}
                onChange={e => setFilterEmp(e.target.value)}
                className="h-8 pl-8 pr-8 rounded-lg border border-border bg-background text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all cursor-pointer min-w-[180px]"
              >
                <option value="all">All Employees</option>
                {[...rows].sort((a: any, b: any) => (a.employeeName || "").localeCompare(b.employeeName || "")).map((r: any) => (
                  <option key={r.employeeCode} value={r.employeeCode}>{r.employeeName}</option>
                ))}
              </select>
            </div>
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
          </div>
        )}

        {view === "table" && (
          <>
            <Select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="text-xs h-8 w-48">
              <option value="all">All Employees</option>
              {[...rows].sort((a: any, b: any) => (a.employeeName || "").localeCompare(b.employeeName || "")).map((r: any) => <option key={r.employeeCode} value={r.employeeCode}>{r.employeeName}</option>)}
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
        /* ── GRID — official sheet style: IN / OUT / TOTAL HRS rows per employee ── */
        <Card className="overflow-hidden">
          <div className="w-full overflow-x-hidden overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
            <table className="text-[11px] border-collapse w-full table-fixed">
              <thead className="sticky top-0 z-30">
                <tr>
                  <th className="px-3 py-2 bg-[#1a3a5c] text-white font-semibold border border-[#1a3a5c] sticky left-0 z-40 w-[160px] text-left">
                    Employee
                  </th>
                  <th className="px-1 py-2 bg-[#1e4270] text-blue-100 font-semibold border border-[#1a3a5c] text-center w-[32px] text-[10px]">
                    Time
                  </th>
                  {daysArray.map(day => (
                    <th key={day} className={cn(
                      "px-0 py-1 font-semibold border border-[#1a3a5c] text-center",
                      isSunday(year, month, day) ? "bg-red-700 text-red-100" : "bg-[#1a3a5c] text-white",
                    )}>
                      <div className="font-bold leading-tight text-[11px]">{day}</div>
                      <div className={cn("text-[9px] font-normal leading-tight",
                        isSunday(year, month, day) ? "text-red-200" : "text-blue-200")}>
                        {getDayName(year, month, day)}
                      </div>
                    </th>
                  ))}
                  <th className="px-1 py-2 bg-green-700  text-white font-bold border border-[#1a3a5c] text-center w-[28px] text-[10px]">P</th>
                  <th className="px-1 py-2 bg-red-700    text-white font-bold border border-[#1a3a5c] text-center w-[28px] text-[10px]">A</th>
                  <th className="px-1 py-2 bg-[#1e4270]  text-white font-bold border border-[#1a3a5c] text-center w-[48px] text-[10px]">Hrs</th>
                </tr>
              </thead>
              <tbody>
                {filteredGridRows.map((row: any, idx: number) => {
                  const borderTop = idx === 0 ? "" : "border-t-2 border-t-slate-400";
                  return (
                    <React.Fragment key={idx}>
                      {/* Employee name spanning row */}
                      <tr key={`${idx}-name`} className={cn("group", borderTop)}>
                        <td
                          rowSpan={3}
                          className="px-3 py-1.5 bg-slate-50 border border-slate-200 sticky left-0 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.08)] align-middle"
                        >
                          <div className="font-semibold text-slate-800 truncate max-w-[160px] text-[11px]">{row.employeeName}</div>
                          <div className="text-[9px] text-slate-500 mt-0.5">{row.employeeCode}</div>
                          {row.designation && <div className="text-[9px] text-slate-400 italic truncate max-w-[160px]">{row.designation}</div>}
                        </td>

                        {/* IN TIME row */}
                        <td className="px-1.5 py-1 bg-green-50 border border-slate-200 font-semibold text-green-700 text-[10px] text-right whitespace-nowrap">
                          In
                        </td>
                        {daysArray.map(day => {
                          const entry = row.dailyStatus?.find((d: any) => d.day === day);
                          const st  = entry?.status || "absent";
                          const inT = fmtTime24(entry?.inTime);
                          return (
                            <td key={day} className={cn(
                              "px-0.5 py-1 text-center border border-slate-200 font-mono text-[10px]",
                              isSunday(year, month, day) ? "bg-red-50" : "bg-green-50/30",
                              inT ? "text-green-700 font-semibold" : "text-slate-300",
                            )}>
                              {inT || (st === "holiday" ? "H" : st === "leave" ? "LV" : "")}
                            </td>
                          );
                        })}
                        <td rowSpan={3} className="px-2 py-1 text-center font-bold text-green-700 bg-green-50/50 border border-slate-200 align-middle">
                          {row.presentDays ?? 0}
                        </td>
                        <td rowSpan={3} className="px-2 py-1 text-center font-bold text-red-600 bg-red-50/50 border border-slate-200 align-middle">
                          {row.absentDays ?? 0}
                        </td>
                        <td rowSpan={3} className="px-2 py-1 text-center font-mono font-semibold text-blue-700 bg-blue-50/40 border border-slate-200 align-middle text-[10px]">
                          {fmtHrs(row.totalWorkHours)}
                        </td>
                      </tr>

                      {/* OUT TIME row */}
                      <tr key={`${idx}-out`}>
                        <td className="px-1.5 py-1 bg-red-50 border border-slate-200 font-semibold text-red-700 text-[10px] text-right whitespace-nowrap">
                          Out
                        </td>
                        {daysArray.map(day => {
                          const entry = row.dailyStatus?.find((d: any) => d.day === day);
                          const outT = fmtTime24(entry?.outTime);
                          return (
                            <td key={day} className={cn(
                              "px-0.5 py-1 text-center border border-slate-200 font-mono text-[10px]",
                              isSunday(year, month, day) ? "bg-red-50" : "bg-red-50/20",
                              outT ? "text-red-700 font-semibold" : "text-slate-300",
                            )}>
                              {outT || ""}
                            </td>
                          );
                        })}
                      </tr>

                      {/* TOTAL HRS row */}
                      <tr key={`${idx}-hrs`}>
                        <td className="px-1.5 py-1 bg-blue-50 border border-slate-200 font-semibold text-blue-700 text-[10px] text-right whitespace-nowrap">
                          Hrs
                        </td>
                        {daysArray.map(day => {
                          const entry = row.dailyStatus?.find((d: any) => d.day === day);
                          const st  = entry?.status || "absent";
                          const cfg = STATUS_CFG[st] || STATUS_CFG.absent;
                          const hrs = entry?.hours;
                          return (
                            <td key={day} className={cn(
                              "px-0.5 py-1 text-center border border-slate-200 font-mono text-[10px]",
                              isSunday(year, month, day) ? "bg-red-50" : "bg-blue-50/20",
                            )}>
                              {hrs != null && hrs > 0 ? (
                                <span className="font-semibold text-blue-700">{fmtHrs(hrs)}</span>
                              ) : st !== "absent" ? (
                                <span className={cn("font-bold text-[9px]", cfg.text)}>{cfg.abbr}</span>
                              ) : ""}
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  );
                })}
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
