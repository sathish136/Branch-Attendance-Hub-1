import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Search, MapPin, RefreshCw, Users, CheckCircle2, XCircle,
  Fingerprint, PenLine, Filter
} from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { useTodayAttendance } from "@/hooks/use-attendance";
import { useBranches } from "@/hooks/use-core";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTodayAttendanceQueryKey } from "@workspace/api-client-react";

/* ── Attendance ring ─────────────────────────────────────── */
function AttendanceRing({ pct }: { pct: number }) {
  const r = 46, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative w-[110px] h-[110px] shrink-0">
      <svg width="110" height="110" className="-rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground leading-none">{pct}%</span>
        <span className="text-[10px] text-muted-foreground mt-0.5">Today</span>
      </div>
    </div>
  );
}

/* ── Stat pill row ───────────────────────────────────────── */
function StatPill({ label, val, dot }: { label: string; val: number; dot: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-xs font-bold text-foreground">{val}</span>
    </div>
  );
}

/* ── KPI card ────────────────────────────────────────────── */
function KPICard({ icon: Icon, label, value, color, bg, border }: {
  icon: any; label: string; value: number | string;
  color: string; bg: string; border: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl border p-4 flex flex-col gap-3", border)}>
      <div className={cn("p-2 rounded-lg w-fit", bg)}>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <div>
        <p className={cn("text-2xl font-bold leading-none", color)}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

/* ── Status config ───────────────────────────────────────── */
const STATUS: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  present:  { label: "Present",  bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  late:     { label: "Late",     bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500"  },
  absent:   { label: "Absent",   bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500"    },
  half_day: { label: "Half Day", bg: "bg-yellow-100",  text: "text-yellow-700",  dot: "bg-yellow-500" },
  leave:    { label: "On Leave", bg: "bg-blue-100",    text: "text-blue-700",    dot: "bg-blue-500"   },
};

function fmtHours(h: any) {
  if (!h) return null;
  const n = Number(h);
  const hrs = Math.floor(n);
  const mins = Math.round((n % 1) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

/* ═══════════════════════════════════════════════════════════ */
export default function TodayAttendance() {
  const [branchId, setBranchId]   = useState("all");
  const [search,   setSearch]     = useState("");
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const queryClient = useQueryClient();

  const params = branchId !== "all" ? { branchId: Number(branchId) } : undefined;
  const { data, isLoading } = useTodayAttendance(params);
  const { data: branchesRaw } = useBranches();
  const branches: any[] = useMemo(() => (branchesRaw as any[]) || [], [branchesRaw]);

  const allRecords: any[] = data?.records || [];

  const records = useMemo(() => {
    if (!search.trim()) return allRecords;
    const q = search.toLowerCase();
    return allRecords.filter((r: any) =>
      r.employeeName?.toLowerCase().includes(q) ||
      r.employeeCode?.toLowerCase().includes(q) ||
      r.branchName?.toLowerCase().includes(q)
    );
  }, [allRecords, search]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [getGetTodayAttendanceQueryKey()[0]] });
    setLastUpdated(new Date());
  }, [queryClient]);

  useEffect(() => {
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const total   = data?.totalEmployees ?? 0;
  const present = data?.present  ?? 0;
  const absent  = data?.absent   ?? 0;
  const late    = data?.late     ?? 0;
  const onLeave = data?.onLeave  ?? 0;
  const attPct  = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  const dateStr = data?.date
    ? new Date(data.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Today's Attendance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{dateStr}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Last updated</p>
            <p className="text-xs font-medium text-foreground">
              {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* KPI row — 3 cards only */}
      <div className="grid grid-cols-3 gap-3">
        <KPICard icon={Users}        label="Total Staff" value={total}   color="text-slate-700"   bg="bg-slate-100"  border="border-slate-200" />
        <KPICard icon={CheckCircle2} label="Present"     value={present} color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-100" />
        <KPICard icon={XCircle}      label="Absent"      value={absent}  color="text-red-600"     bg="bg-red-50"     border="border-red-100" />
      </div>

      {/* Presence rate + filters — single column */}
      <div className="flex flex-col gap-4">

        {/* Attendance ring panel */}
        <div className="bg-card rounded-xl border border-border p-5 flex items-center gap-6">
          <AttendanceRing pct={attPct} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground mb-3">Presence Rate</p>
            <StatPill label="Present"  val={present} dot="bg-emerald-500" />
            <StatPill label="Late"     val={late}    dot="bg-amber-500" />
            <StatPill label="On Leave" val={onLeave} dot="bg-blue-500" />
            <StatPill label="Absent"   val={absent}  dot="bg-red-500" />
          </div>
        </div>

        {/* Search + branch filter panel */}
        <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Filter className="w-4 h-4 text-muted-foreground" /> Filter Records
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, ID or branch…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All Branches</option>
            {branches.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Showing <strong className="text-foreground">{records.length}</strong> of <strong className="text-foreground">{total}</strong> employee{total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-base text-foreground">Employee Records</h2>
          <p className="text-xs text-muted-foreground">Tap any row to see details — auto-refreshes every minute</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading records…
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Users className="w-10 h-10 opacity-20" />
            <p className="text-sm font-medium">No records found</p>
            <p className="text-xs">Try adjusting the search or branch filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Branch</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">In</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Out</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hours</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {records.map((r: any) => {
                  const sc = STATUS[r.status] ?? { label: r.status, bg: "bg-muted", text: "text-muted-foreground", dot: "bg-slate-400" };
                  const wh = fmtHours(r.totalHours) ?? fmtHours(r.workHours1);
                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {r.employeeName}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{r.employeeCode}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex items-center gap-1.5 text-xs">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {r.branchName || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", sc.bg, sc.text)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", sc.dot)} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {r.inTime1
                          ? <span className="text-emerald-700 font-semibold">{formatTime(r.inTime1)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {r.outTime1
                          ? <span className="text-blue-700 font-semibold">{formatTime(r.outTime1)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                        {wh ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.source === "biometric" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full font-medium">
                            <Fingerprint className="w-2.5 h-2.5" /> Bio
                          </span>
                        ) : r.source === "manual" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full font-medium">
                            <PenLine className="w-2.5 h-2.5" /> Manual
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!isLoading && records.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              {[
                { label: "Present",  val: present, color: "text-emerald-700" },
                { label: "Late",     val: late,    color: "text-amber-700" },
                { label: "Absent",   val: absent,  color: "text-red-700" },
                { label: "On Leave", val: onLeave, color: "text-blue-700" },
              ].map(({ label, val, color }) => (
                <span key={label}>
                  <strong className={color}>{val}</strong> {label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Auto-refreshes every minute
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
