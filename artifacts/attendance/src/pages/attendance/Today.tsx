import { useState, useMemo, useCallback, useEffect } from "react";
import { Search, MapPin, RefreshCw, Users, Fingerprint, PenLine, ChevronDown } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { useTodayAttendance } from "@/hooks/use-attendance";
import { useBranches } from "@/hooks/use-core";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTodayAttendanceQueryKey } from "@workspace/api-client-react";

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
  const hrs = Math.floor(n), mins = Math.round((n % 1) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export default function TodayAttendance() {
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch]     = useState("");
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

  useEffect(() => { const t = setInterval(refresh, 60_000); return () => clearInterval(t); }, [refresh]);

  const total   = data?.totalEmployees ?? 0;
  const present = data?.present ?? 0;
  const absent  = data?.absent  ?? 0;
  const late    = data?.late    ?? 0;
  const onLeave = data?.onLeave ?? 0;

  const dateStr = data?.date
    ? new Date(data.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Today's Attendance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{dateStr}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last updated</p>
            <p className="text-xs font-medium text-foreground tabular-nums">
              {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
          <button onClick={refresh} disabled={isLoading}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 bg-card rounded-xl border border-border px-4 py-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, ID or branch…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-border bg-muted/40 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
        </div>

        {/* Branch select */}
        <div className="relative shrink-0">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            className="h-9 pl-8 pr-8 rounded-lg border border-border bg-muted/40 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all cursor-pointer min-w-[180px]"
          >
            <option value="all">All Branches</option>
            {branches.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Count badge */}
        <div className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
          <span className="font-semibold text-foreground">{records.length}</span> / {total}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading records…
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Users className="w-10 h-10 opacity-20" />
            <p className="text-sm font-medium">No records found</p>
            <p className="text-xs opacity-70">Try a different search or branch.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Branch</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">In</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Out</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {records.map((r: any) => {
                  const sc = STATUS[r.status] ?? { label: r.status, bg: "bg-muted", text: "text-muted-foreground", dot: "bg-slate-400" };
                  const wh = fmtHours(r.totalHours) ?? fmtHours(r.workHours1);
                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-foreground leading-snug">{r.employeeName}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{r.employeeCode}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {r.branchName || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", sc.bg, sc.text)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", sc.dot)} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono text-xs">
                        {r.inTime1 ? <span className="text-emerald-700 font-semibold">{formatTime(r.inTime1)}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono text-xs">
                        {r.outTime1 ? <span className="text-blue-700 font-semibold">{formatTime(r.outTime1)}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-center text-xs font-medium text-muted-foreground">{wh ?? "—"}</td>
                      <td className="px-4 py-3.5 text-center">
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

        {!isLoading && records.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              {[
                { label: "Present",  val: present, color: "text-emerald-700" },
                { label: "Late",     val: late,    color: "text-amber-700" },
                { label: "Absent",   val: absent,  color: "text-red-700" },
                { label: "On Leave", val: onLeave, color: "text-blue-700" },
              ].map(({ label, val, color }) => (
                <span key={label}><strong className={color}>{val}</strong> {label}</span>
              ))}
            </div>
            <span className="opacity-60">Auto-refreshes every minute</span>
          </div>
        )}
      </div>
    </div>
  );
}
