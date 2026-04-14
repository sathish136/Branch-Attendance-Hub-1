import { useState, useEffect } from "react";
import { useGetAttendanceReport, useGetMonthlyReport, useGetOvertimeReport, useListBranches } from "@workspace/api-client-react";
import { PageHeader, Card, Input, Select, Label } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Users, Clock, Calendar, AlignLeft, FileText, Sheet } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

type Tab = "attendance" | "monthly" | "overtime" | "split";

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

function ExportButtons({
  getHeaders, getRows, filename, disabled,
}: {
  getHeaders: () => string[];
  getRows: () => (string | number | null | undefined)[][];
  filename: string;
  disabled?: boolean;
}) {
  async function handlePdf() {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(13);
    doc.text(filename, 14, 16);
    autoTable(doc, {
      head: [getHeaders()],
      body: getRows().map(r => r.map(v => String(v ?? ""))),
      startY: 22,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 255] },
    });
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

export default function Reports() {
  const [tab, setTab] = useState<Tab>("attendance");

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" description="Detailed attendance, monthly, overtime, and split punch reports." />
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {([
          { id: "attendance", label: "Attendance Report", icon: Users },
          { id: "monthly",    label: "Monthly Report",    icon: Calendar },
          { id: "overtime",   label: "Overtime Report",   icon: Clock },
          { id: "split",      label: "Split Report",      icon: AlignLeft },
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
  const { data: branches } = useListBranches();
  const { data, isLoading } = useGetAttendanceReport({
    startDate, endDate,
    ...(branchId ? { branchId: Number(branchId) } : {}),
    ...(status   ? { status }                     : {}),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div><Label className="text-xs">End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
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
            disabled={!data?.records?.length}
            filename={`Attendance-Report-${startDate}-to-${endDate}`}
            getHeaders={() => ["Date","Emp ID","Employee","Branch","Status","In Time","Out Time","Total Hrs","OT Hrs"]}
            getRows={() => (data?.records || []).map((r: any) => [
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
                {(data?.records || []).slice(0, 200).map(r => (
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
                    <td className="px-3 py-2 font-mono">{r.totalHours     != null ? `${r.totalHours.toFixed(1)}h`     : "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.overtimeHours != null && r.overtimeHours > 0 ? `${r.overtimeHours.toFixed(1)}h` : "—"}</td>
                  </tr>
                ))}
                {!data?.records?.length && (
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
  const { data: branches } = useListBranches();
  const { data, isLoading } = useGetMonthlyReport({
    month, year,
    ...(branchId ? { branchId: Number(branchId) } : {}),
  });

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
            <Select value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <ExportButtons
            disabled={!data?.employees?.length}
            filename={`Monthly-Report-${getMonthName(month)}-${year}`}
            getHeaders={() => ["Emp ID","Employee","Branch","Designation","Present","Absent","Late","Half Day","Leave","Holiday","Work Hours","OT Hours","Att %"]}
            getRows={() => (data?.employees || []).map((e: any) => [
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
          <div><span className="text-muted-foreground">Total Employees: </span><strong>{data.totalEmployees}</strong></div>
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
                {(data?.employees || []).map(e => (
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
                    <td className="px-3 py-2 text-center font-mono">{e.totalWorkHours.toFixed(1)}h</td>
                    <td className="px-3 py-2 text-center font-mono text-amber-600">{e.overtimeHours.toFixed(1)}h</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-bold",
                        e.attendancePercentage >= 90 ? "bg-green-100 text-green-700" :
                        e.attendancePercentage >= 75 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                      )}>{e.attendancePercentage}%</span>
                    </td>
                  </tr>
                ))}
                {!data?.employees?.length && (
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
  const { data: branches } = useListBranches();
  const { data, isLoading } = useGetOvertimeReport({
    startDate, endDate,
    ...(branchId ? { branchId: Number(branchId) } : {}),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div><Label className="text-xs">End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <ExportButtons
            disabled={!data?.employees?.length}
            filename={`Overtime-Report-${startDate}-to-${endDate}`}
            getHeaders={() => ["Emp ID","Employee","Branch","Designation","OT Days","Total OT Hours"]}
            getRows={() => (data?.employees || []).map((e: any) => [
              e.employeeCode, e.employeeName, e.branchName, e.designation,
              e.overtimeDays, e.totalOvertimeHours.toFixed(2),
            ])}
          />
        </div>
      </Card>

      {data && (
        <Card className="p-3 flex gap-6 text-sm border-amber-200 bg-amber-50/30">
          <div><span className="text-muted-foreground">Total OT Hours: </span><strong className="text-amber-700">{data.totalOvertimeHours.toFixed(1)}h</strong></div>
          <div><span className="text-muted-foreground">Employees with OT: </span><strong>{data.employees.length}</strong></div>
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
                {(data?.employees || []).map(e => (
                  <tr key={e.employeeId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{e.employeeCode}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{e.employeeName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[100px] truncate">{e.branchName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{e.designation}</td>
                    <td className="px-3 py-2 text-center font-semibold text-amber-600">{e.overtimeDays}</td>
                    <td className="px-3 py-2 text-center font-bold text-amber-700">{e.totalOvertimeHours.toFixed(1)}h</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.records.slice(0,3).map(r => `${r.date}: ${r.overtimeHours.toFixed(1)}h`).join(" | ")}
                      {e.records.length > 3 && ` +${e.records.length-3} more`}
                    </td>
                  </tr>
                ))}
                {!data?.employees?.length && (
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

type Session = { inTime: string; outTime: string | null; durationHrs: number | null };
type EmployeeDayRow = {
  key: string;
  employeeName: string;
  biometricId: string;
  date: string;
  sessions: Session[];
  totalHrs: number;
};

function buildSessions(punches: PunchLog[]): Session[] {
  const sorted = [...punches].sort((a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime());
  const sessions: Session[] = [];
  let pendingIn: string | null = null;

  for (const p of sorted) {
    if (p.punchType === "in") {
      if (pendingIn !== null) {
        sessions.push({ inTime: pendingIn, outTime: null, durationHrs: null });
      }
      pendingIn = p.punchTime;
    } else if (p.punchType === "out") {
      if (pendingIn !== null) {
        sessions.push({ inTime: pendingIn, outTime: p.punchTime, durationHrs: diffHrs(pendingIn, p.punchTime) });
        pendingIn = null;
      } else {
        sessions.push({ inTime: p.punchTime, outTime: null, durationHrs: null });
      }
    }
  }
  if (pendingIn !== null) {
    sessions.push({ inTime: pendingIn, outTime: null, durationHrs: null });
  }
  return sessions;
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
          const res = await fetch(apiUrl(`/biometric/logs?${params}`));
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
          const sessions = buildSessions(punches);
          const totalHrs = sessions.reduce((s, p) => s + (p.durationHrs ?? 0), 0);
          const sample = punches[0];
          const dateKey = new Date(sample.punchTime).toISOString().split("T")[0];
          return { key, employeeName: sample.employeeName, biometricId: sample.biometricId, date: dateKey, sessions, totalHrs };
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

function SplitReport() {
  const now = new Date();
  const [startDate, setStartDate] = useState(now.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);
  const { rows, loading } = useSplitReport(startDate, endDate);

  const maxSessions = rows.reduce((m, r) => Math.max(m, r.sessions.length), 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div><Label className="text-xs">End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <ExportButtons
            disabled={!rows.length}
            filename={`Split-Report-${startDate}-to-${endDate}`}
            getHeaders={() => {
              const sessionHeaders: string[] = [];
              for (let i = 0; i < (maxSessions || 1); i++) {
                sessionHeaders.push(`Session ${i+1} In`, `Session ${i+1} Out`, `Session ${i+1} Hrs`);
              }
              return ["Date","Bio ID","Employee",...sessionHeaders,"Total Hrs"];
            }}
            getRows={() => rows.map(r => {
              const cells: (string | number | null)[] = [r.date, r.biometricId, r.employeeName];
              for (let i = 0; i < (maxSessions || 1); i++) {
                const s = r.sessions[i];
                cells.push(s ? fmt(s.inTime) : "", s?.outTime ? fmt(s.outTime) : "", s?.durationHrs != null ? s.durationHrs.toFixed(2) : "");
              }
              cells.push(r.totalHrs > 0 ? r.totalHrs.toFixed(2) : "");
              return cells;
            })}
          />
        </div>
      </Card>

      {rows.length > 0 && (
        <Card className="p-3 flex gap-6 text-sm border-blue-200 bg-blue-50/30">
          <div><span className="text-muted-foreground">Records: </span><strong>{rows.length}</strong></div>
          <div><span className="text-muted-foreground">Max Sessions/Day: </span><strong>{maxSessions}</strong></div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading punch sessions...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Bio ID</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Employee</th>
                  {Array.from({ length: maxSessions || 1 }, (_, i) => (
                    <th key={i} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">
                      Session {i + 1}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Total Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(r => (
                  <tr key={r.key} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.biometricId}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{r.employeeName}</td>
                    {Array.from({ length: maxSessions || 1 }, (_, i) => {
                      const s = r.sessions[i];
                      return (
                        <td key={i} className="px-3 py-2 whitespace-nowrap">
                          {s ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-green-700 font-mono">{fmt(s.inTime)}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-red-600 font-mono">{s.outTime ? fmt(s.outTime) : "—"}</span>
                              {s.durationHrs != null && (
                                <span className="ml-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold">
                                  {s.durationHrs.toFixed(1)}h
                                </span>
                              )}
                            </span>
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 font-bold text-blue-700 font-mono whitespace-nowrap">
                      {r.totalHrs > 0 ? `${r.totalHrs.toFixed(1)}h` : "—"}
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr>
                    <td colSpan={4 + (maxSessions || 1)} className="text-center py-10 text-muted-foreground">
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
