import { useEffect, useState, useCallback } from "react";
import {
  Users, UserCheck, UserMinus, Clock, CalendarDays, Building2,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Activity,
  Timer, RefreshCw, ArrowUp, ArrowDown, Minus, Coffee
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}/api${p}`;

type Summary = {
  totalEmployees: number;
  totalBranches: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  onLeaveToday: number;
  attendancePercentageToday: number;
  monthlyAttendancePercentage: number;
  totalOvertimeThisMonth: number;
  recentAttendance: RecentRecord[];
  branchWiseSummary: BranchStat[];
};

type RecentRecord = {
  id: number;
  employeeName: string;
  employeeCode: string;
  branchName: string;
  status: string;
  inTime1: string | null;
  outTime1: string | null;
  date: string;
};

type BranchStat = {
  branchId: number;
  branchName: string;
  present: number;
  absent: number;
  total: number;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  present:  { label: "Present",  color: "text-emerald-700", bg: "bg-emerald-100", dot: "bg-emerald-500" },
  late:     { label: "Late",     color: "text-amber-700",   bg: "bg-amber-100",   dot: "bg-amber-500" },
  absent:   { label: "Absent",   color: "text-red-700",     bg: "bg-red-100",     dot: "bg-red-500" },
  leave:    { label: "Leave",    color: "text-blue-700",    bg: "bg-blue-100",    dot: "bg-blue-500" },
  half_day: { label: "Half Day", color: "text-violet-700",  bg: "bg-violet-100",  dot: "bg-violet-500" },
};

function AttendanceRing({ pct }: { pct: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="mt-[-108px] flex flex-col items-center">
        <span className="text-3xl font-bold text-foreground">{pct}%</span>
        <span className="text-xs text-muted-foreground mt-0.5">Today</span>
      </div>
      <div className="mt-[72px]" />
    </div>
  );
}

function StatPill({ label, val, color }: { label: string; val: number; color: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full shrink-0", color)} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="font-bold text-sm text-foreground">{val}</span>
    </div>
  );
}

function BranchBar({ branch }: { branch: BranchStat }) {
  const pct = branch.total > 0 ? Math.round((branch.present / branch.total) * 100) : 0;
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  const textColor = pct >= 80 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-red-700";
  const bgColor = pct >= 80 ? "bg-emerald-50" : pct >= 60 ? "bg-amber-50" : "bg-red-50";
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div className="w-2 h-8 rounded-full shrink-0 flex flex-col overflow-hidden bg-muted">
        <div className={cn("rounded-full transition-all duration-700", color)} style={{ height: `${pct}%`, marginTop: "auto" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-foreground truncate">{branch.branchName}</span>
          <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded", bgColor, textColor)}>{pct}%</span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>{branch.present} present</span>
          <span>{branch.absent} absent</span>
          <span>{branch.total} total</span>
        </div>
      </div>
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const today = new Date();
  const dayName = DAYS[today.getDay()];
  const dateStr = today.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(api("/reports/summary"));
      const d = await r.json();
      setSummary(d);
      setLastUpdated(new Date());
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const s = summary;
  const attPct = s?.attendancePercentageToday ?? 0;
  const notMarked = (s?.totalEmployees ?? 0) - (s?.presentToday ?? 0) - (s?.absentToday ?? 0) - (s?.lateToday ?? 0) - (s?.onLeaveToday ?? 0);

  const kpiCards = [
    {
      title: "Total Staff",
      value: s?.totalEmployees ?? 0,
      sub: `${s?.totalBranches ?? 0} branches`,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
    },
    {
      title: "Present Today",
      value: s?.presentToday ?? 0,
      sub: `${attPct}% attendance rate`,
      icon: UserCheck,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      trend: attPct >= 80 ? "up" : attPct >= 60 ? "flat" : "down",
    },
    {
      title: "Absent Today",
      value: s?.absentToday ?? 0,
      sub: `${s?.totalEmployees ? Math.round(((s.absentToday ?? 0) / s.totalEmployees) * 100) : 0}% of workforce`,
      icon: UserMinus,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-100",
    },
    {
      title: "Late Arrivals",
      value: s?.lateToday ?? 0,
      sub: "checked in after shift start",
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
    },
    {
      title: "On Leave",
      value: s?.onLeaveToday ?? 0,
      sub: "approved leave today",
      icon: Coffee,
      color: "text-violet-600",
      bg: "bg-violet-50",
      border: "border-violet-100",
    },
    {
      title: "Monthly Rate",
      value: `${s?.monthlyAttendancePercentage ?? 0}%`,
      sub: "this month's attendance",
      icon: CalendarDays,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      border: "border-indigo-100",
      trend: (s?.monthlyAttendancePercentage ?? 0) >= 80 ? "up" : "down",
    },
  ];

  const lowBranches = (s?.branchWiseSummary ?? []).filter(b => b.total > 0 && Math.round((b.present / b.total) * 100) < 70);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dayName}, {dateStr} — real-time workforce overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Last updated</p>
            <p className="text-xs font-medium text-foreground">
              {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((card, i) => (
          <div key={i} className={cn("bg-card rounded-xl border p-4 flex flex-col gap-3", card.border)}>
            <div className="flex items-center justify-between">
              <div className={cn("p-2 rounded-lg", card.bg)}>
                <card.icon className={cn("w-4 h-4", card.color)} />
              </div>
              {card.trend && (
                card.trend === "up"
                  ? <ArrowUp className="w-3.5 h-3.5 text-emerald-500" />
                  : card.trend === "down"
                  ? <ArrowDown className="w-3.5 h-3.5 text-red-500" />
                  : <Minus className="w-3.5 h-3.5 text-amber-500" />
              )}
            </div>
            <div>
              <p className={cn("text-2xl font-bold", card.color)}>{loading ? "—" : card.value}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">{card.title}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {!loading && lowBranches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Low Attendance Alert</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {lowBranches.map(b => b.branchName).join(", ")} {lowBranches.length === 1 ? "has" : "have"} attendance below 70% today.
            </p>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Recent Punches */}
        <div className="xl:col-span-2 bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="font-semibold text-base text-foreground">Recent Punches</h2>
              <p className="text-xs text-muted-foreground">Latest attendance entries today</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Live
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : !s?.recentAttendance?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Activity className="w-8 h-8 opacity-30" />
              <p className="text-sm">No attendance records yet today</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Branch</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">In Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Out Time</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recentAttendance.map((rec, i) => {
                    const meta = STATUS_META[rec.status] ?? STATUS_META.absent;
                    return (
                      <tr key={rec.id} className={cn(
                        "border-b border-border/50 hover:bg-muted/30 transition-colors",
                        i % 2 === 0 ? "bg-background" : "bg-muted/10"
                      )}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                              {rec.employeeName.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-foreground text-sm">{rec.employeeName}</p>
                              <p className="text-[10px] text-muted-foreground">{rec.employeeCode}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{rec.branchName || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", meta.bg, meta.color)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{rec.inTime1 || "—"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{rec.outTime1 || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right column — ring + breakdown */}
        <div className="flex flex-col gap-4">
          {/* Attendance Ring */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold text-base text-foreground mb-1">Today's Attendance</h2>
            <p className="text-xs text-muted-foreground mb-4">Workforce presence rate</p>
            {loading ? (
              <div className="flex items-center justify-center h-36 text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <AttendanceRing pct={attPct} />
                <div className="w-full mt-4 space-y-0">
                  <StatPill label="Present" val={s?.presentToday ?? 0} color="bg-emerald-500" />
                  <StatPill label="Late" val={s?.lateToday ?? 0} color="bg-amber-500" />
                  <StatPill label="On Leave" val={s?.onLeaveToday ?? 0} color="bg-blue-500" />
                  <StatPill label="Absent" val={s?.absentToday ?? 0} color="bg-red-500" />
                  {notMarked > 0 && <StatPill label="Not Marked" val={notMarked} color="bg-slate-400" />}
                </div>
              </div>
            )}
          </div>

          {/* Monthly & OT */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="font-semibold text-base text-foreground">This Month</h2>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Monthly Attendance</span>
                  <span className="font-semibold text-foreground">{s?.monthlyAttendancePercentage ?? 0}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700",
                      (s?.monthlyAttendancePercentage ?? 0) >= 80 ? "bg-emerald-500"
                      : (s?.monthlyAttendancePercentage ?? 0) >= 60 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${s?.monthlyAttendancePercentage ?? 0}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-violet-600" />
                  <span className="text-sm text-muted-foreground">Overtime Hours</span>
                </div>
                <span className="font-bold text-violet-600">{s?.totalOvertimeThisMonth ?? 0}h</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-muted-foreground">Active Branches</span>
                </div>
                <span className="font-bold text-blue-600">{s?.totalBranches ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Branch Performance */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base text-foreground">Branch Performance</h2>
            <p className="text-xs text-muted-foreground">Today's attendance by branch</p>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />≥80%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />60–79%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />&lt;60%</span>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />Loading…
          </div>
        ) : !s?.branchWiseSummary?.length ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
            No branch data available
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
            {s.branchWiseSummary.map(branch => (
              <div key={branch.branchId} className="px-5">
                <BranchBar branch={branch} />
              </div>
            ))}
          </div>
        )}
        {!loading && s?.branchWiseSummary && (
          <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                <strong className="text-emerald-700">
                  {s.branchWiseSummary.filter(b => b.total > 0 && Math.round((b.present / b.total) * 100) >= 80).length}
                </strong> branches at ≥80%
              </span>
              <span>
                <strong className="text-amber-700">
                  {s.branchWiseSummary.filter(b => b.total > 0 && Math.round((b.present / b.total) * 100) >= 60 && Math.round((b.present / b.total) * 100) < 80).length}
                </strong> branches at 60–79%
              </span>
              <span>
                <strong className="text-red-700">
                  {s.branchWiseSummary.filter(b => b.total > 0 && Math.round((b.present / b.total) * 100) < 60).length}
                </strong> branches below 60%
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Auto-refreshes every minute
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
