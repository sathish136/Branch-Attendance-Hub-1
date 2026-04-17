import { useState, useMemo } from "react";
import { Download, Calendar as CalendarIcon, Clock, LayoutGrid, List, ChevronUp, ChevronDown } from "lucide-react";
import { PageHeader, Card, Button, Select } from "@/components/ui";
import { useMonthlySheet } from "@/hooks/use-attendance";
import { cn } from "@/lib/utils";

type ViewMode = "grid" | "table";
type SortKey = "employee" | "date" | "inTime" | "outTime" | "hours" | "status";

const STATUS_CFG: Record<string, { bg: string; text: string; badge: string; label: string; dot: string }> = {
  present:  { bg: "bg-green-50",  text: "text-green-700",  badge: "bg-green-100 text-green-700 border-green-200",   label: "Present",  dot: "bg-green-500"  },
  late:     { bg: "bg-amber-50",  text: "text-amber-700",  badge: "bg-amber-100 text-amber-700 border-amber-200",   label: "Late",     dot: "bg-amber-500"  },
  absent:   { bg: "bg-red-50",    text: "text-red-700",    badge: "bg-red-100 text-red-700 border-red-200",         label: "Absent",   dot: "bg-red-500"    },
  half_day: { bg: "bg-yellow-50", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700 border-yellow-200",label: "Half Day", dot: "bg-yellow-400" },
  leave:    { bg: "bg-blue-50",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700 border-blue-200",      label: "Leave",    dot: "bg-blue-500"   },
  holiday:  { bg: "bg-gray-100",  text: "text-gray-500",   badge: "bg-gray-100 text-gray-600 border-gray-200",      label: "Holiday",  dot: "bg-gray-400"   },
};

function fmtTime(t: string | null | undefined) {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
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

export default function MonthlySheet() {
  const [month, setMonth]   = useState(new Date().getMonth() + 1);
  const [year, setYear]     = useState(new Date().getFullYear());
  const [view, setView]     = useState<ViewMode>("grid");
  const [showTimes, setShowTimes] = useState(true);
  const [sortKey, setSortKey]   = useState<SortKey>("date");
  const [sortAsc, setSortAsc]   = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEmp, setFilterEmp]       = useState("all");

  const { data, isLoading } = useMonthlySheet({ month, year });

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray   = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const rows: any[] = data?.rows || [];
  const yearOptions = [2023, 2024, 2025, 2026, 2027];

  const monthName = new Date(2000, month - 1, 1).toLocaleString("default", { month: "long" });

  // Flatten rows → per-day entries for Table view
  const tableRows = useMemo(() => {
    const flat: any[] = [];
    rows.forEach((row: any) => {
      daysArray.forEach(day => {
        const entry = row.dailyStatus?.find((d: any) => d.day === day);
        flat.push({
          employeeName: row.employeeName,
          employeeCode: row.employeeCode,
          designation:  row.designation,
          day,
          dayName: getDayName(year, month, day),
          isSun: isSunday(year, month, day),
          status:  entry?.status  || "absent",
          inTime:  entry?.inTime  || null,
          outTime: entry?.outTime || null,
          hours:   entry?.hours   ?? null,
          ot:      entry?.overtimeHours ?? null,
        });
      });
    });
    return flat;
  }, [rows, daysArray, year, month]);

  const allEmployees = useMemo(() => [...new Set(rows.map((r: any) => r.employeeCode))], [rows]);

  const filteredTableRows = useMemo(() => {
    let r = tableRows;
    if (filterStatus !== "all") r = r.filter(x => x.status === filterStatus);
    if (filterEmp    !== "all") r = r.filter(x => x.employeeCode === filterEmp);
    r = [...r].sort((a, b) => {
      let va: any, vb: any;
      switch (sortKey) {
        case "employee": va = a.employeeName; vb = b.employeeName; break;
        case "date":     va = a.day;          vb = b.day;          break;
        case "inTime":   va = a.inTime || ""; vb = b.inTime || ""; break;
        case "outTime":  va = a.outTime || ""; vb = b.outTime || ""; break;
        case "hours":    va = a.hours ?? -1;  vb = b.hours ?? -1;  break;
        case "status":   va = a.status;       vb = b.status;       break;
        default:         va = a.day;          vb = b.day;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return r;
  }, [tableRows, filterStatus, filterEmp, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 text-muted-foreground/40" />;
    return sortAsc
      ? <ChevronUp className="w-3 h-3 text-primary" />
      : <ChevronDown className="w-3 h-3 text-primary" />;
  }

  // Summary counts for table view
  const summaryByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredTableRows.forEach(r => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return counts;
  }, [filteredTableRows]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Monthly Attendance Sheet"
        description="Grid and detailed timing view for attendance records."
        action={
          <Button variant="outline" className="gap-2 text-xs h-9">
            <Download className="w-4 h-4" /> Export
          </Button>
        }
      />

      {/* Controls Bar */}
      <Card className="p-3 flex flex-wrap items-center gap-3">
        {/* Month / Year */}
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

        {/* View Mode Toggle */}
        <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
          {([
            { mode: "grid"  as ViewMode, icon: LayoutGrid, label: "Grid"  },
            { mode: "table" as ViewMode, icon: List,        label: "Table" },
          ]).map(({ mode, icon: Icon, label }) => (
            <button key={mode} onClick={() => setView(mode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                view === mode
                  ? "bg-white shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Show Times toggle (Grid only) */}
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

        {/* Table-view filters */}
        {view === "table" && (
          <>
            <Select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="text-xs h-8 w-48">
              <option value="all">All Employees</option>
              {rows.map((r: any) => (
                <option key={r.employeeCode} value={r.employeeCode}>{r.employeeName}</option>
              ))}
            </Select>
            <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-xs h-8 w-36">
              <option value="all">All Status</option>
              {Object.entries(STATUS_CFG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
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
        /* ── GRID VIEW ─────────────────────────────────────────────────────── */
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
                      isSunday(year, month, day)
                        ? "bg-red-900/70 text-red-200"
                        : "bg-slate-700 text-white",
                      showTimes ? "min-w-[72px]" : "min-w-[34px]",
                    )}>
                      <div className="font-bold leading-tight">{day}</div>
                      <div className={cn("text-[9px] font-normal leading-tight",
                        isSunday(year, month, day) ? "text-red-300" : "text-slate-300")}>
                        {getDayName(year, month, day)}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-2.5 bg-green-700 text-white font-bold border-b border-slate-600 text-center min-w-[36px]">P</th>
                  <th className="px-2 py-2.5 bg-red-700   text-white font-bold border-b border-slate-600 text-center min-w-[36px]">A</th>
                  <th className="px-2 py-2.5 bg-amber-600 text-white font-bold border-b border-slate-600 text-center min-w-[36px]">L</th>
                  <th className="px-3 py-2.5 bg-blue-700  text-white font-bold border-b border-slate-600 text-center min-w-[64px]">Total Hrs</th>
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
                      const st    = entry?.status || "absent";
                      const cfg   = STATUS_CFG[st] || STATUS_CFG.absent;
                      const inT   = fmtTime(entry?.inTime);
                      const outT  = fmtTime(entry?.outTime);
                      const hrs   = entry?.hours;

                      return (
                        <td key={day} className={cn(
                          "px-0.5 py-0.5 text-center align-middle",
                          isSunday(year, month, day) && "bg-red-50/30"
                        )}>
                          {showTimes ? (
                            <div className={cn("rounded px-0.5 py-0.5 flex flex-col items-center gap-0", cfg.bg)}>
                              <span className={cn("text-[10px] font-bold leading-tight", cfg.text)}>
                                {st === "present" ? "P" : st === "late" ? "L" : st === "absent" ? "A" : st === "half_day" ? "HD" : st === "leave" ? "LV" : "H"}
                              </span>
                              {inT  && <span className="text-[8px] leading-tight text-green-700 font-mono">{inT}</span>}
                              {outT && <span className="text-[8px] leading-tight text-red-600  font-mono">{outT}</span>}
                              {hrs != null && <span className="text-[8px] leading-tight font-semibold text-gray-600">{fmtHrs(hrs)}</span>}
                            </div>
                          ) : (
                            <div className={cn("w-7 h-7 mx-auto flex items-center justify-center rounded text-[10px] font-bold", cfg.bg, cfg.text)}>
                              {st === "present" ? "P" : st === "late" ? "L" : st === "absent" ? "A" : st === "half_day" ? "HD" : st === "leave" ? "LV" : "H"}
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
        /* ── TABLE VIEW ────────────────────────────────────────────────────── */
        <>
          {/* Summary strip */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_CFG).map(([k, cfg]) => (
              summaryByStatus[k] ? (
                <div key={k} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium", cfg.badge)}>
                  <div className={cn("w-2 h-2 rounded-full", cfg.dot)} />
                  {cfg.label}
                  <span className="font-bold tabular-nums">{summaryByStatus[k]}</span>
                </div>
              ) : null
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-700 text-white">
                    <th className="px-4 py-3 text-left font-semibold border-b border-slate-600">
                      <button className="flex items-center gap-1" onClick={() => toggleSort("date")}>
                        Date <SortIcon k="date" />
                      </button>
                    </th>
                    <th className="px-2 py-3 text-center font-semibold border-b border-slate-600 text-slate-300">Day</th>
                    <th className="px-4 py-3 text-left font-semibold border-b border-slate-600">
                      <button className="flex items-center gap-1" onClick={() => toggleSort("employee")}>
                        Employee <SortIcon k="employee" />
                      </button>
                    </th>
                    <th className="px-3 py-3 text-center font-semibold border-b border-slate-600">
                      <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("status")}>
                        Status <SortIcon k="status" />
                      </button>
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
                      <button className="flex items-center gap-1 mx-auto" onClick={() => toggleSort("hours")}>
                        Work Hrs <SortIcon k="hours" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center font-semibold border-b border-slate-600 text-orange-300">OT Hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableRows.map((r, i) => {
                    const cfg = STATUS_CFG[r.status] || STATUS_CFG.absent;
                    return (
                      <tr key={i} className={cn(
                        "border-b border-border/40 transition-colors group",
                        r.isSun ? "bg-red-50/40 hover:bg-red-50/70" : "hover:bg-muted/30",
                        i % 2 === 0 ? "" : "bg-muted/10"
                      )}>
                        {/* Date */}
                        <td className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex flex-col items-center justify-center shrink-0 font-bold leading-none",
                              r.isSun ? "bg-red-100 text-red-700" : "bg-primary/10 text-primary"
                            )}>
                              <span className="text-[11px]">{monthName.slice(0,3)}</span>
                              <span className="text-sm">{r.day}</span>
                            </div>
                          </div>
                        </td>
                        {/* Day */}
                        <td className="px-2 py-2.5 text-center">
                          <span className={cn("font-medium", r.isSun ? "text-red-500" : "text-muted-foreground")}>
                            {r.dayName}
                          </span>
                        </td>
                        {/* Employee */}
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-foreground">{r.employeeName}</div>
                          <div className="text-[10px] text-muted-foreground">{r.employeeCode} · {r.designation}</div>
                        </td>
                        {/* Status */}
                        <td className="px-3 py-2.5 text-center">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold", cfg.badge)}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                            {cfg.label}
                          </span>
                        </td>
                        {/* In Time */}
                        <td className="px-4 py-2.5 text-center">
                          {r.inTime ? (
                            <span className="inline-block bg-green-50 border border-green-200 text-green-700 font-mono font-semibold px-2.5 py-1 rounded-lg text-[11px]">
                              {fmtTime(r.inTime)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        {/* Out Time */}
                        <td className="px-4 py-2.5 text-center">
                          {r.outTime ? (
                            <span className="inline-block bg-red-50 border border-red-200 text-red-700 font-mono font-semibold px-2.5 py-1 rounded-lg text-[11px]">
                              {fmtTime(r.outTime)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        {/* Work Hours */}
                        <td className="px-4 py-2.5 text-center">
                          {r.hours != null ? (
                            <span className="inline-block bg-blue-50 border border-blue-200 text-blue-700 font-mono font-semibold px-2.5 py-1 rounded-lg text-[11px]">
                              {fmtHrs(r.hours)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        {/* OT */}
                        <td className="px-4 py-2.5 text-center">
                          {r.ot && r.ot > 0 ? (
                            <span className="inline-block bg-orange-50 border border-orange-200 text-orange-700 font-mono font-semibold px-2.5 py-1 rounded-lg text-[11px]">
                              {fmtHrs(r.ot)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
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
            <span className={cn("w-3 h-3 rounded-full inline-block", cfg.dot)} />
            {cfg.label}
          </span>
        ))}
        {view === "grid" && (
          <span className="ml-auto text-muted-foreground/70">Toggle "Show times" to switch between compact and detailed grid</span>
        )}
      </div>
    </div>
  );
}
