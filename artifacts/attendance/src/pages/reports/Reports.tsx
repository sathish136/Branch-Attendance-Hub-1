import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useGetAttendanceReport, useGetMonthlyReport, useGetOvertimeReport, useListBranches, useListEmployees } from "@workspace/api-client-react";
import { PageHeader, Card, Input, Select, Label } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Users, Clock, Calendar, AlignLeft, FileText, Sheet, X, ChevronDown, UserSquare } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

type Tab = "attendance" | "monthly" | "overtime" | "split" | "individual";

const STATUS_COLORS: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-700",
  half_day: "bg-yellow-100 text-yellow-700",
  leave: "bg-purple-100 text-purple-700",
  holiday: "bg-gray-100 text-gray-700",
};

function getMonthName(m: number) {
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m-1];
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function diffHrs(a: string, b: string) {
  return ((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000);
}

function fmtDuration(hrs: number | null | undefined): string {
  if (hrs == null || hrs <= 0) return "—";
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function ExportButtons({
  getHeaders, getRows, filename, disabled,
}: {
  getHeaders: () => string[];
  getRows: () => (string | number | null | undefined)[][];
  filename: string;
  disabled?: boolean;
}) {
  async function toDataUrl(url: string): Promise<string> {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  function getImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
  }

  async function handlePdf() {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    let slpImgData: string | null = null;
    let liveUImgData: string | null = null;
    try {
      slpImgData = await toDataUrl("https://upload.wikimedia.org/wikipedia/en/c/c1/Sri_Lanka_Post_logo.png");
      liveUImgData = await toDataUrl("https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQCzrc0k5wmNzmItazY38yj1_7K5zAFLMxn-Q&s");
    } catch { /* proceed without images */ }

    // Get actual image dimensions to preserve aspect ratio
    const maxLogoH = 22; // max height in mm
    let logoW = maxLogoH;
    let logoH = maxLogoH;
    if (slpImgData) {
      const dims = await getImageDimensions(slpImgData);
      const ratio = dims.w / dims.h;
      logoH = maxLogoH;
      logoW = maxLogoH * ratio;
    }

    const logoY = 4;
    const logoX = pageW / 2 - logoW / 2;
    if (slpImgData) {
      doc.addImage(slpImgData, "PNG", logoX, logoY, logoW, logoH);
    }

    const headerH = logoY + logoH + 14;

    // Organization name — centered below logo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text("Sri Lanka Post — Colombo District", pageW / 2, logoY + logoH + 5, { align: "center" });

    // Report name — centered, smaller
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 120);
    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    doc.text(`${filename}   |   Generated: ${today}`, pageW / 2, logoY + logoH + 10.5, { align: "center" });

    // Divider line below header
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.line(10, headerH, pageW - 10, headerH);

    autoTable(doc, {
      head: [getHeaders()],
      body: getRows().map(r => r.map(v => String(v ?? ""))),
      startY: headerH + 6,
      margin: { left: 10, right: 10 },
      tableWidth: "auto",
      styles: {
        fontSize: 8,
        cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
        font: "helvetica",
        textColor: [40, 40, 60],
        lineColor: [220, 228, 240],
        lineWidth: 0.25,
        overflow: "linebreak",
        minCellHeight: 10,
      },
      headStyles: {
        fillColor: [22, 48, 110],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        cellPadding: { top: 5, bottom: 5, left: 5, right: 5 },
        halign: "center",
        lineWidth: 0,
      },
      alternateRowStyles: {
        fillColor: [245, 248, 255],
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
      },
      columnStyles: {
        0: { halign: "left", fontStyle: "bold", textColor: [22, 48, 110] },
      },
      didParseCell: (data) => {
        if (data.section === "head") {
          data.cell.styles.halign = "center";
        }
        if (data.section === "body" && data.column.index !== 0) {
          data.cell.styles.halign = "center";
        }
      },
      didDrawPage: () => {},
      showHead: "everyPage",
      rowPageBreak: "avoid",
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      // Footer line
      doc.setDrawColor(200, 210, 230);
      doc.setLineWidth(0.3);
      doc.line(10, pageH - 12, pageW - 10, pageH - 12);

      // Live U logo in footer
      if (liveUImgData) {
        doc.addImage(liveUImgData, "JPEG", pageW / 2 - 18, pageH - 10, 6, 6);
      }

      // "Powered by" text centered
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 140);
      const poweredX = liveUImgData ? pageW / 2 - 11 : pageW / 2;
      doc.text("Powered by  Live U (Pvt) Ltd, Sri Lanka", poweredX, pageH - 6, { align: "left" });

      // Page number on right
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount}`, pageW - 10, pageH - 6, { align: "right" });
    }

    doc.save(`${filename}.pdf`);
  }

  async function handleExcel() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([getHeaders(), ...getRows().map(r => r.map(v => v ?? ""))]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }

  return (
    <div className="flex items-center gap-2 ml-auto self-end">
      <button onClick={handlePdf} disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40">
        <FileText className="w-3.5 h-3.5" /> PDF
      </button>
      <button onClick={handleExcel} disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-40">
        <Sheet className="w-3.5 h-3.5" /> Excel
      </button>
    </div>
  );
}

/* ── Searchable Employee Combobox ── */
function EmpCombo({
  value, onChange, employees, placeholder = "All Employees",
}: {
  value: string;
  onChange: (v: string) => void;
  employees: any[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const sorted = [...employees].sort((a: any, b: any) => (a.fullName || "").localeCompare(b.fullName || ""));
  const selected = sorted.find((e: any) => String(e.id) === value);

  const filtered = sorted.filter((e: any) => {
    const q = query.toLowerCase();
    return (
      (e.fullName || "").toLowerCase().includes(q) ||
      (e.firstName || "").toLowerCase().includes(q) ||
      (e.employeeId || "").toLowerCase().includes(q)
    );
  });

  function openDropdown() {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
    setQuery("");
  }

  useEffect(() => {
    function handle(ev: MouseEvent) {
      const t = ev.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        dropRef.current  && !dropRef.current.contains(t)
      ) {
        setOpen(false); setQuery("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const displayVal = open ? query : (selected ? `${selected.fullName || selected.firstName} (${selected.employeeId})` : "");

  return (
    <div ref={triggerRef} className="relative">
      <div className="relative">
        <input
          className="h-9 w-56 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring pr-7"
          placeholder={!value ? placeholder : ""}
          value={displayVal}
          onFocus={openDropdown}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
        />
        {value ? (
          <button onClick={() => { onChange(""); setQuery(""); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        )}
      </div>
      {open && rect && createPortal(
        <div
          ref={dropRef}
          style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, width: 288, zIndex: 9999 }}
          className="bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
        >
          <div className="max-h-56 overflow-y-auto">
            <button onClick={() => { onChange(""); setQuery(""); setOpen(false); }}
              className={cn("w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors text-muted-foreground", !value && "bg-muted/60 font-medium")}>
              {placeholder}
            </button>
            {filtered.length === 0 && <div className="px-3 py-3 text-xs text-muted-foreground text-center">No employees found</div>}
            {filtered.map((e: any) => (
              <button key={e.id}
                onClick={() => { onChange(String(e.id)); setQuery(""); setOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2",
                  String(e.id) === value && "bg-primary/10 text-primary font-semibold"
                )}>
                <span className="truncate">{e.fullName || e.firstName}</span>
                <span className="font-mono text-muted-foreground text-[10px] shrink-0">{e.employeeId}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>("attendance");

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" description="Detailed attendance, monthly, overtime, and split punch reports." />
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {([
          { id: "attendance", label: "Attendance Report",   icon: Users },
          { id: "monthly",    label: "Monthly Report",      icon: Calendar },
          { id: "overtime",   label: "Overtime Report",     icon: Clock },
          { id: "split",      label: "Split Report",        icon: AlignLeft },
          { id: "individual", label: "Individual Sheet",    icon: UserSquare },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "attendance" && <AttendanceReport />}
      {tab === "monthly"    && <MonthlyReport />}
      {tab === "overtime"   && <OvertimeReport />}
      {tab === "split"      && <SplitReport />}
      {tab === "individual" && <IndividualSheet />}
    </div>
  );
}

/* ── Attendance Report ── */
function AttendanceReport() {
  const now = new Date();
  const [startDate, setStartDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const { data: branches } = useListBranches();
  const { data: empData } = useListEmployees({ limit: 1000 });
  const allEmployees = empData?.employees || [];
  const { data, isLoading } = useGetAttendanceReport({
    startDate, endDate,
    ...(branchId    ? { branchId: Number(branchId) }    : {}),
    ...(status      ? { status }                         : {}),
    ...(employeeId  ? { employeeId: Number(employeeId) } : {}),
  });

  const sortedRecords = [...(data?.records || [])].sort((a: any, b: any) =>
    a.date.localeCompare(b.date) || (a.employeeName || "").localeCompare(b.employeeName || "")
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div><Label className="text-xs">End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onChange={e => { setBranchId(e.target.value); setEmployeeId(""); }}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Employee</Label>
            <EmpCombo
              value={employeeId}
              onChange={setEmployeeId}
              employees={branchId ? allEmployees.filter((e: any) => String(e.branchId) === branchId) : allEmployees}
            />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
              <option value="half_day">Half Day</option>
              <option value="leave">Leave</option>
            </Select>
          </div>
          <ExportButtons
            disabled={!sortedRecords.length}
            filename={`Attendance-Report-${startDate}-to-${endDate}`}
            getHeaders={() => ["Date","Emp ID","Employee","Branch","Status","In Time","Out Time","Total Hrs","OT Hrs"]}
            getRows={() => sortedRecords.map((r: any) => [
              r.date, r.employeeCode, r.employeeName, r.branchName,
              r.status, r.inTime1 ? fmt(r.inTime1) : "", r.outTime1 ? fmt(r.outTime1) : "",
              r.totalHours != null ? r.totalHours.toFixed(2) : "",
              r.overtimeHours != null && r.overtimeHours > 0 ? r.overtimeHours.toFixed(2) : "",
            ])}
          />
        </div>
      </Card>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Present",  val: data.summary.present,  cls: "text-green-600" },
            { label: "Absent",   val: data.summary.absent,   cls: "text-red-600" },
            { label: "Late",     val: data.summary.late,     cls: "text-amber-600" },
            { label: "Half Day", val: data.summary.halfDay,  cls: "text-yellow-600" },
            { label: "Leave",    val: data.summary.leave,    cls: "text-purple-600" },
            { label: "Holiday",  val: data.summary.holiday,  cls: "text-gray-600" },
          ].map(({ label, val, cls }) => (
            <Card key={label} className="p-3 text-center">
              <div className={cn("text-2xl font-bold", cls)}>{val}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>{["Date","Emp ID","Employee","Branch","Designation","Status","In Time","Out Time","Total Hrs","OT Hrs"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedRecords.slice(0, 200).map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.employeeCode}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{r.employeeName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.branchName}</td>
                    <td className="px-3 py-2 text-muted-foreground">—</td>
                    <td className="px-3 py-2">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-medium uppercase", STATUS_COLORS[r.status] || "bg-gray-100")}>
                        {r.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">{r.inTime1  ? fmt(r.inTime1)  : "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.outTime1 ? fmt(r.outTime1) : "—"}</td>
                    <td className="px-3 py-2 font-mono">{fmtDuration(r.totalHours)}</td>
                    <td className="px-3 py-2 font-mono">{r.overtimeHours != null && r.overtimeHours > 0 ? fmtDuration(r.overtimeHours) : "—"}</td>
                  </tr>
                ))}
                {!sortedRecords.length && (
                  <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">No records found for the selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Monthly Report ── */
function MonthlyReport() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [branchId, setBranchId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const { data: branches } = useListBranches();
  const { data: empData } = useListEmployees({ limit: 1000 });
  const allEmployees = empData?.employees || [];
  const { data, isLoading } = useGetMonthlyReport({
    month, year,
    ...(branchId ? { branchId: Number(branchId) } : {}),
  });

  const filteredEmps = (data?.employees || []).filter((e: any) =>
    !employeeId || String(e.employeeId) === String(employeeId)
  ).sort((a: any, b: any) => (a.employeeName || "").localeCompare(b.employeeName || ""));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Month</Label>
            <Select value={month} onChange={e => setMonth(Number(e.target.value))}>
              {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{getMonthName(i+1)}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Year</Label>
            <Select value={year} onChange={e => setYear(Number(e.target.value))}>
              {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onChange={e => { setBranchId(e.target.value); setEmployeeId(""); }}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Employee</Label>
            <EmpCombo
              value={employeeId}
              onChange={setEmployeeId}
              employees={branchId ? allEmployees.filter((e: any) => String(e.branchId) === branchId) : allEmployees}
            />
          </div>
          <ExportButtons
            disabled={!filteredEmps.length}
            filename={`Monthly-Report-${getMonthName(month)}-${year}`}
            getHeaders={() => ["Emp ID","Employee","Branch","Designation","Present","Absent","Late","Half Day","Leave","Holiday","Work Hours","OT Hours","Att %"]}
            getRows={() => filteredEmps.map((e: any) => [
              e.employeeCode, e.employeeName, e.branchName, e.designation,
              e.presentDays, e.absentDays, e.lateDays, e.halfDays, e.leaveDays, e.holidayDays,
              e.totalWorkHours.toFixed(2), e.overtimeHours.toFixed(2), `${e.attendancePercentage}%`,
            ])}
          />
        </div>
      </Card>

      {data && (
        <Card className="p-3 flex gap-6 text-sm border-green-200 bg-green-50/30">
          <div><span className="text-muted-foreground">Period: </span><strong>{getMonthName(data.month)} {data.year}</strong></div>
          <div><span className="text-muted-foreground">Total Employees: </span><strong>{filteredEmps.length}</strong></div>
          <div><span className="text-muted-foreground">Working Days: </span><strong>{data.workingDays}</strong></div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Generating report...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>{["Emp ID","Employee","Branch","Designation","Present","Absent","Late","Half Day","Leave","Holiday","Work Hours","OT Hours","Att %"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEmps.map((e: any) => (
                  <tr key={e.employeeId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{e.employeeCode}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{e.employeeName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[120px] truncate">{e.branchName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{e.designation}</td>
                    <td className="px-3 py-2 text-center text-green-600 font-semibold">{e.presentDays}</td>
                    <td className="px-3 py-2 text-center text-red-600 font-semibold">{e.absentDays}</td>
                    <td className="px-3 py-2 text-center text-amber-600 font-semibold">{e.lateDays}</td>
                    <td className="px-3 py-2 text-center text-yellow-600 font-semibold">{e.halfDays}</td>
                    <td className="px-3 py-2 text-center text-purple-600 font-semibold">{e.leaveDays}</td>
                    <td className="px-3 py-2 text-center text-gray-600 font-semibold">{e.holidayDays}</td>
                    <td className="px-3 py-2 text-center font-mono">{fmtDuration(e.totalWorkHours)}</td>
                    <td className="px-3 py-2 text-center font-mono text-amber-600">{fmtDuration(e.overtimeHours)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-bold",
                        e.attendancePercentage >= 90 ? "bg-green-100 text-green-700" :
                        e.attendancePercentage >= 75 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                      )}>{e.attendancePercentage}%</span>
                    </td>
                  </tr>
                ))}
                {!filteredEmps.length && (
                  <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">No records found for the selected period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Overtime Report ── */
function OvertimeReport() {
  const now = new Date();
  const [startDate, setStartDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);
  const [branchId, setBranchId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const { data: branches } = useListBranches();
  const { data: empData } = useListEmployees({ limit: 1000 });
  const allEmployees = empData?.employees || [];
  const { data, isLoading } = useGetOvertimeReport({
    startDate, endDate,
    ...(branchId ? { branchId: Number(branchId) } : {}),
  });

  const filteredOT = (data?.employees || []).filter((e: any) =>
    !employeeId || String(e.employeeId) === String(employeeId)
  ).sort((a: any, b: any) => (a.employeeName || "").localeCompare(b.employeeName || ""));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div><Label className="text-xs">End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onChange={e => { setBranchId(e.target.value); setEmployeeId(""); }}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Employee</Label>
            <EmpCombo
              value={employeeId}
              onChange={setEmployeeId}
              employees={branchId ? allEmployees.filter((e: any) => String(e.branchId) === branchId) : allEmployees}
            />
          </div>
          <ExportButtons
            disabled={!filteredOT.length}
            filename={`Overtime-Report-${startDate}-to-${endDate}`}
            getHeaders={() => ["Emp ID","Employee","Branch","Designation","OT Days","Total OT Hours"]}
            getRows={() => filteredOT.map((e: any) => [
              e.employeeCode, e.employeeName, e.branchName, e.designation,
              e.overtimeDays, e.totalOvertimeHours.toFixed(2),
            ])}
          />
        </div>
      </Card>

      {data && (
        <Card className="p-3 flex gap-6 text-sm border-amber-200 bg-amber-50/30">
          <div><span className="text-muted-foreground">Total OT Hours: </span><strong className="text-amber-700">{fmtDuration(filteredOT.reduce((s: number, e: any) => s + e.totalOvertimeHours, 0))}</strong></div>
          <div><span className="text-muted-foreground">Employees with OT: </span><strong>{filteredOT.length}</strong></div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>{["Emp ID","Employee","Branch","Designation","OT Days","Total OT Hours","Daily Breakdown"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOT.map((e: any) => (
                  <tr key={e.employeeId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{e.employeeCode}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{e.employeeName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[100px] truncate">{e.branchName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{e.designation}</td>
                    <td className="px-3 py-2 text-center font-semibold text-amber-600">{e.overtimeDays}</td>
                    <td className="px-3 py-2 text-center font-bold text-amber-700">{fmtDuration(e.totalOvertimeHours)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.records.slice(0,3).map((r: any) => `${r.date}: ${fmtDuration(r.overtimeHours)}`).join(" | ")}
                      {e.records.length > 3 && ` +${e.records.length-3} more`}
                    </td>
                  </tr>
                ))}
                {!filteredOT.length && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No overtime records found for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Split Report ── */
type PunchLog = {
  id: number;
  employeeId: number;
  employeeName: string;
  biometricId: string;
  punchTime: string;
  punchType: "in" | "out" | "unknown";
  deviceName: string;
};

type EmployeeDayRow = {
  key: string;
  employeeName: string;
  biometricId: string;
  date: string;
  firstIn:  string | null;
  firstOut: string | null;
  lastIn:   string | null;
  lastOut:  string | null;
  totalHrs: number;
};

function buildTwoSessions(punches: PunchLog[]): Pick<EmployeeDayRow, "firstIn"|"firstOut"|"lastIn"|"lastOut"|"totalHrs"> {
  const sorted = [...punches].sort((a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime());
  const ins  = sorted.filter(p => p.punchType === "in").map(p => p.punchTime);
  const outs = sorted.filter(p => p.punchType === "out").map(p => p.punchTime);

  const firstIn  = ins[0]  ?? null;
  const firstOut = outs[0] ?? null;
  const lastIn   = ins.length  > 1 ? ins[ins.length - 1]   : null;
  const lastOut  = outs.length > 1 ? outs[outs.length - 1] : (outs[0] && outs[0] !== firstOut ? outs[outs.length - 1] : null);

  let totalHrs = 0;
  if (firstIn && firstOut) totalHrs += diffHrs(firstIn, firstOut);
  if (lastIn  && lastOut)  totalHrs += diffHrs(lastIn, lastOut);

  return { firstIn, firstOut, lastIn, lastOut, totalHrs };
}

function useSplitReport(startDate: string, endDate: string) {
  const [rows, setRows] = useState<EmployeeDayRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!startDate || !endDate) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const allLogs: PunchLog[] = [];
        let page = 1;
        while (true) {
          const params = new URLSearchParams({ startDate, endDate, page: String(page) });
          const res = await authFetch(apiUrl(`/biometric/logs?${params}`));
          if (!res.ok) break;
          const json = await res.json();
          const batch: PunchLog[] = json.logs || [];
          allLogs.push(...batch);
          if (allLogs.length >= (json.total ?? batch.length) || batch.length === 0) break;
          page++;
        }
        if (cancelled) return;

        const groups: Record<string, PunchLog[]> = {};
        for (const log of allLogs) {
          if (log.punchType === "unknown") continue;
          const dateKey = new Date(log.punchTime).toISOString().split("T")[0];
          const gKey = `${log.biometricId}::${dateKey}`;
          if (!groups[gKey]) groups[gKey] = [];
          groups[gKey].push(log);
        }

        const result: EmployeeDayRow[] = Object.entries(groups).map(([key, punches]) => {
          const twoSessions = buildTwoSessions(punches);
          const sample = punches[0];
          const dateKey = new Date(sample.punchTime).toISOString().split("T")[0];
          return { key, employeeName: sample.employeeName, biometricId: sample.biometricId, date: dateKey, ...twoSessions };
        });

        result.sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
        if (!cancelled) setRows(result);
      } catch (err) {
        console.error("Split report load error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  return { rows, loading };
}

function SessionCell({ time, type }: { time: string | null; type: "in" | "out" }) {
  if (!time) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs font-semibold",
      type === "in"  ? "bg-green-50 text-green-700"  : "bg-red-50 text-red-600"
    )}>
      {fmt(time)}
    </span>
  );
}

function SplitReport() {
  const now = new Date();
  const [startDate, setStartDate] = useState(now.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);
  const [employeeId, setEmployeeId] = useState("");
  const { data: empData } = useListEmployees({ limit: 1000 });
  const allEmployees = empData?.employees || [];
  const { rows, loading } = useSplitReport(startDate, endDate);

  const selectedBioId = employeeId
    ? (allEmployees.find((e: any) => String(e.id) === employeeId) as any)?.biometricId || ""
    : "";

  const filteredRows = selectedBioId
    ? rows.filter(r => r.biometricId === selectedBioId)
    : rows;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div><Label className="text-xs">End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Employee</Label>
            <EmpCombo value={employeeId} onChange={setEmployeeId} employees={allEmployees} />
          </div>
          <ExportButtons
            disabled={!filteredRows.length}
            filename={`Split-Report-${startDate}-to-${endDate}`}
            getHeaders={() => ["Date","Bio ID","Employee","1st In","1st Out","Last In","Last Out","Total Hrs"]}
            getRows={() => filteredRows.map(r => [
              r.date,
              r.biometricId,
              r.employeeName,
              r.firstIn  ? fmt(r.firstIn)  : "",
              r.firstOut ? fmt(r.firstOut) : "",
              r.lastIn   ? fmt(r.lastIn)   : "",
              r.lastOut  ? fmt(r.lastOut)  : "",
              r.totalHrs > 0 ? r.totalHrs.toFixed(2) : "",
            ])}
          />
        </div>
      </Card>

      {filteredRows.length > 0 && (
        <Card className="p-3 flex gap-6 text-sm border-blue-200 bg-blue-50/30">
          <div><span className="text-muted-foreground">Records: </span><strong>{filteredRows.length}</strong></div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading punch sessions...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#16306e] text-white">
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap" rowSpan={2}>Date</th>
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap" rowSpan={2}>Bio ID</th>
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap" rowSpan={2}>Employee</th>
                  <th className="px-3 py-3 text-center font-semibold whitespace-nowrap border-l border-white/20" colSpan={2}>1st Session</th>
                  <th className="px-3 py-3 text-center font-semibold whitespace-nowrap border-l border-white/20" colSpan={2}>Last Session</th>
                  <th className="px-3 py-3 text-center font-semibold whitespace-nowrap border-l border-white/20" rowSpan={2}>Total Hrs</th>
                </tr>
                <tr className="bg-[#1e3a8a] text-white/80 text-[10px]">
                  <th className="px-3 py-1.5 text-center border-l border-white/20">In</th>
                  <th className="px-3 py-1.5 text-center">Out</th>
                  <th className="px-3 py-1.5 text-center border-l border-white/20">In</th>
                  <th className="px-3 py-1.5 text-center">Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((r, idx) => (
                  <tr key={r.key} className={cn("hover:bg-muted/30 transition-colors", idx % 2 === 1 && "bg-blue-50/30")}>
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-muted-foreground">{r.date}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.biometricId}</td>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{r.employeeName}</td>
                    <td className="px-3 py-2 text-center border-l border-border"><SessionCell time={r.firstIn}  type="in"  /></td>
                    <td className="px-3 py-2 text-center">                      <SessionCell time={r.firstOut} type="out" /></td>
                    <td className="px-3 py-2 text-center border-l border-border"><SessionCell time={r.lastIn}   type="in"  /></td>
                    <td className="px-3 py-2 text-center">                      <SessionCell time={r.lastOut}  type="out" /></td>
                    <td className="px-3 py-2 text-center font-bold text-blue-700 font-mono border-l border-border whitespace-nowrap">
                      {fmtDuration(r.totalHrs)}
                    </td>
                  </tr>
                ))}
                {!filteredRows.length && !loading && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-muted-foreground">
                      No punch records found for the selected date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Individual Monthly Sheet ── */
function IndividualSheet() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [branchId, setBranchId] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const { data: branches } = useListBranches();
  const { data: empData } = useListEmployees({ limit: 1000 });
  const allEmployees = empData?.employees || [];

  const selectedEmp = allEmployees.find((e: any) => String(e.id) === employeeId) as any;

  const daysInMonth = new Date(year, month, 0).getDate();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate   = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const { data, isLoading } = useGetAttendanceReport({
    startDate, endDate,
    ...(employeeId ? { employeeId: Number(employeeId) } : { employeeId: -1 }),
  });

  const dayRecords = useMemo(() => {
    const recMap: Record<string, any> = {};
    for (const r of (data?.records || [])) recMap[r.date] = r;
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayName = new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
      return { day: d, date: dateStr, dayName, rec: recMap[dateStr] ?? null };
    });
  }, [data, month, year, daysInMonth]);

  const summary = useMemo(() => {
    let present = 0, absent = 0, late = 0, halfDay = 0, leave = 0, holiday = 0, totalHrs = 0, otHrs = 0;
    for (const { rec } of dayRecords) {
      if (!rec) continue;
      if (rec.status === "present")  present++;
      else if (rec.status === "absent")   absent++;
      else if (rec.status === "late")     { late++; present++; }
      else if (rec.status === "half_day") halfDay++;
      else if (rec.status === "leave")    leave++;
      else if (rec.status === "holiday")  holiday++;
      totalHrs += rec.totalHours || 0;
      otHrs    += rec.overtimeHours || 0;
    }
    return { present, absent, late, halfDay, leave, holiday, totalHrs, otHrs };
  }, [dayRecords]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Month</Label>
            <Select value={month} onChange={e => setMonth(Number(e.target.value))}>
              {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{getMonthName(i+1)}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Year</Label>
            <Select value={year} onChange={e => setYear(Number(e.target.value))}>
              {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onChange={e => { setBranchId(e.target.value); setEmployeeId(""); }}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Employee <span className="text-red-500">*</span></Label>
            <EmpCombo
              value={employeeId}
              onChange={setEmployeeId}
              employees={branchId ? allEmployees.filter((e: any) => String(e.branchId) === branchId) : allEmployees}
              placeholder="Select Employee"
            />
          </div>
          <ExportButtons
            disabled={!employeeId || !dayRecords.some(r => r.rec)}
            filename={`Individual-Sheet-${selectedEmp?.employeeId || "emp"}-${getMonthName(month)}-${year}`}
            getHeaders={() => ["#","Date","Day","In Time","Out Time","Total Hours","OT Hours","Status"]}
            getRows={() => dayRecords.map(({ day, date, dayName, rec }) => [
              String(day).padStart(2,"0"), date, dayName,
              rec?.inTime1  ? fmt(rec.inTime1)  : "",
              rec?.outTime1 ? fmt(rec.outTime1) : "",
              rec?.totalHours != null ? fmtDuration(rec.totalHours) : "",
              rec?.overtimeHours != null && rec.overtimeHours > 0 ? fmtDuration(rec.overtimeHours) : "",
              rec?.status ? rec.status.replace(/_/g," ") : "",
            ])}
          />
        </div>
      </Card>

      {/* Employee info banner */}
      {selectedEmp && (
        <Card className="p-3 flex flex-wrap gap-4 text-xs border-primary/20 bg-primary/5">
          <div><span className="text-muted-foreground">Employee: </span><strong>{selectedEmp.fullName || selectedEmp.firstName}</strong></div>
          <div><span className="text-muted-foreground">ID: </span><strong className="font-mono">{selectedEmp.employeeId}</strong></div>
          {selectedEmp.branchName && <div><span className="text-muted-foreground">Branch: </span><strong>{selectedEmp.branchName}</strong></div>}
          {selectedEmp.designation && <div><span className="text-muted-foreground">Designation: </span><strong>{selectedEmp.designation}</strong></div>}
          <div><span className="text-muted-foreground">Period: </span><strong>{getMonthName(month)} {year} ({daysInMonth} days)</strong></div>
        </Card>
      )}

      {/* Summary stats */}
      {selectedEmp && !isLoading && (
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {[
            { label: "Present",   val: summary.present,   cls: "text-green-600" },
            { label: "Absent",    val: summary.absent,    cls: "text-red-600" },
            { label: "Late",      val: summary.late,      cls: "text-amber-600" },
            { label: "Half Day",  val: summary.halfDay,   cls: "text-yellow-600" },
            { label: "Leave",     val: summary.leave,     cls: "text-purple-600" },
            { label: "Holiday",   val: summary.holiday,   cls: "text-gray-600" },
            { label: "Work Hrs",  val: fmtDuration(summary.totalHrs), cls: "text-blue-600" },
            { label: "OT Hrs",    val: fmtDuration(summary.otHrs),    cls: "text-orange-600" },
          ].map(({ label, val, cls }) => (
            <Card key={label} className="p-2 text-center">
              <div className={cn("text-sm font-bold", cls)}>{val}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Day-by-day table */}
      <Card className="overflow-hidden">
        {!employeeId ? (
          <div className="p-12 text-center text-muted-foreground">
            <UserSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Select an employee to view their monthly attendance sheet</p>
            <p className="text-xs mt-1 opacity-60">Use the Employee field above to search by name or ID</p>
          </div>
        ) : isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading attendance data...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#16306e] text-white text-xs">
                  <th className="px-2 py-3 text-center font-semibold w-8">#</th>
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Date</th>
                  <th className="px-3 py-3 text-left font-semibold w-10">Day</th>
                  <th className="px-3 py-3 text-center font-semibold whitespace-nowrap">In Time</th>
                  <th className="px-3 py-3 text-center font-semibold whitespace-nowrap">Out Time</th>
                  <th className="px-3 py-3 text-center font-semibold whitespace-nowrap">Total Hours</th>
                  <th className="px-3 py-3 text-center font-semibold whitespace-nowrap">OT Hours</th>
                  <th className="px-3 py-3 text-center font-semibold whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dayRecords.map(({ day, date, dayName, rec }, idx) => {
                  const isSun = dayName === "Sun";
                  const isSat = dayName === "Sat";
                  return (
                    <tr key={date} className={cn(
                      "transition-colors hover:bg-muted/30",
                      isSun ? "bg-red-50/50" : isSat ? "bg-orange-50/30" : idx % 2 === 1 ? "bg-slate-50/40" : ""
                    )}>
                      <td className="px-2 py-2.5 text-center font-mono text-muted-foreground text-[11px]">{String(day).padStart(2,"0")}</td>
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap text-[11px]">{date}</td>
                      <td className={cn("px-3 py-2.5 font-bold text-[11px]", isSun ? "text-red-500" : isSat ? "text-orange-500" : "text-muted-foreground")}>{dayName}</td>
                      <td className="px-3 py-2.5 text-center font-mono">
                        {rec?.inTime1  ? <span className="text-green-700 font-semibold">{fmt(rec.inTime1)}</span>  : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono">
                        {rec?.outTime1 ? <span className="text-red-600 font-semibold">{fmt(rec.outTime1)}</span> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-blue-700">
                        {rec ? fmtDuration(rec.totalHours) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-amber-600">
                        {rec?.overtimeHours != null && rec.overtimeHours > 0 ? fmtDuration(rec.overtimeHours) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {rec ? (
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide", STATUS_COLORS[rec.status] || "bg-gray-100 text-gray-600")}>
                            {rec.status.replace(/_/g," ")}
                          </span>
                        ) : (isSun || isSat) ? (
                          <span className="text-[10px] text-muted-foreground/50 italic">{isSun ? "Sunday" : "Saturday"}</span>
                        ) : (
                          <span className="text-muted-foreground/40 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer totals row */}
              <tfoot>
                <tr className="bg-[#16306e]/10 border-t-2 border-[#16306e]/20 font-semibold text-xs">
                  <td colSpan={3} className="px-3 py-2.5 text-muted-foreground font-bold">Month Total</td>
                  <td colSpan={2} />
                  <td className="px-3 py-2.5 text-center font-mono text-blue-700 font-bold">{fmtDuration(summary.totalHrs)}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-amber-600 font-bold">{summary.otHrs > 0 ? fmtDuration(summary.otHrs) : "—"}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                    <span className="text-green-600 font-bold">{summary.present}P</span>
                    {" · "}
                    <span className="text-red-600 font-bold">{summary.absent}A</span>
                    {summary.leave > 0 && <><span className="text-muted-foreground"> · </span><span className="text-purple-600 font-bold">{summary.leave}L</span></>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
