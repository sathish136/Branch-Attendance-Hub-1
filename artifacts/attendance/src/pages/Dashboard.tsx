import { useEffect, useState, useCallback } from "react";
import {
  Users, UserCheck, UserMinus, Clock, CalendarDays, Building2,
  AlertTriangle, CheckCircle2, ArrowUp, ArrowDown, Minus,
  Coffee, Timer, RefreshCw, Wifi, WifiOff, AlertCircle, Fingerprint
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
  branchWiseSummary: BranchStat[];
};

type BranchStat = {
  branchId: number;
  branchName: string;
  present: number;
  absent: number;
  total: number;
};

type BiometricDevice = {
  id: number;
  name: string;
  model: string;
  serialNumber: string;
  ipAddress: string;
  port: number;
  branchId: number;
  branchName: string;
  status: "online" | "offline" | "error";
  lastSync: string | null;
  isActive: boolean;
};

const DEVICE_STATUS_CFG = {
  online:  { icon: Wifi,         cls: "text-emerald-600", bg: "bg-emerald-50",  badge: "bg-emerald-100 text-emerald-700",  dot: "bg-emerald-500" },
  offline: { icon: WifiOff,      cls: "text-slate-400",   bg: "bg-slate-50",    badge: "bg-slate-100 text-slate-500",     dot: "bg-slate-400" },
  error:   { icon: AlertCircle,  cls: "text-red-500",     bg: "bg-red-50",      badge: "bg-red-100 text-red-600",         dot: "bg-red-500" },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function AttendanceRing({ pct }: { pct: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative w-[140px] h-[140px] shrink-0">
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
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground">{pct}%</span>
        <span className="text-xs text-muted-foreground">Today</span>
      </div>
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
  const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  const textColor = pct >= 80 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-red-700";
  const bgColor = pct >= 80 ? "bg-emerald-50" : pct >= 60 ? "bg-amber-50" : "bg-red-50";
  return (
    <div className="py-3 border-b border-border/40 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-foreground truncate pr-2">{branch.branchName}</span>
        <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded shrink-0", bgColor, textColor)}>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-1">
        <div className={cn("h-full rounded-full transition-all duration-700", barColor)} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{branch.present} present</span>
        <span>{branch.absent} absent</span>
        <span>{branch.total} total</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [devLoading, setDevLoading] = useState(true);

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

  const loadDevices = useCallback(async () => {
    setDevLoading(true);
    try {
      const r = await fetch(api("/biometric/devices"));
      const d = await r.json();
      setDevices(Array.isArray(d) ? d : []);
    } catch {
      setDevices([]);
    } finally {
      setDevLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadDevices();
    const t = setInterval(() => { load(); loadDevices(); }, 60000);
    return () => clearInterval(t);
  }, [load, loadDevices]);

  const s = summary;
  const attPct = s?.attendancePercentageToday ?? 0;
  const notMarked = Math.max(0,
    (s?.totalEmployees ?? 0) - (s?.presentToday ?? 0) - (s?.absentToday ?? 0) -
    (s?.lateToday ?? 0) - (s?.onLeaveToday ?? 0)
  );

  const kpiCards = [
    {
      title: "Total Staff",
      value: s?.totalEmployees ?? 0,
      sub: `${s?.totalBranches ?? 0} active branches`,
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

  const lowBranches = (s?.branchWiseSummary ?? []).filter(
    b => b.total > 0 && Math.round((b.present / b.total) * 100) < 70
  );

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

      {/* Low Attendance Alert */}
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

      {/* Attendance Ring + Monthly Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Attendance Ring */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-base text-foreground mb-1">Today's Attendance</h2>
          <p className="text-xs text-muted-foreground mb-5">Workforce presence rate</p>
          {loading ? (
            <div className="flex items-center justify-center h-36 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
          ) : (
            <div className="flex items-center gap-8">
              <AttendanceRing pct={attPct} />
              <div className="flex-1">
                <StatPill label="Present" val={s?.presentToday ?? 0} color="bg-emerald-500" />
                <StatPill label="Late" val={s?.lateToday ?? 0} color="bg-amber-500" />
                <StatPill label="On Leave" val={s?.onLeaveToday ?? 0} color="bg-blue-500" />
                <StatPill label="Absent" val={s?.absentToday ?? 0} color="bg-red-500" />
                {notMarked > 0 && <StatPill label="Not Marked" val={notMarked} color="bg-slate-400" />}
              </div>
            </div>
          )}
        </div>

        {/* Monthly Stats */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold text-base text-foreground mb-1">This Month</h2>
          <p className="text-xs text-muted-foreground mb-5">Monthly performance overview</p>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Monthly Attendance Rate</span>
                <span className="font-semibold text-foreground">{s?.monthlyAttendancePercentage ?? 0}%</span>
              </div>
              <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700",
                    (s?.monthlyAttendancePercentage ?? 0) >= 80 ? "bg-emerald-500"
                    : (s?.monthlyAttendancePercentage ?? 0) >= 60 ? "bg-amber-500" : "bg-red-500"
                  )}
                  style={{ width: `${s?.monthlyAttendancePercentage ?? 0}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0%</span>
                <span>Target: 85%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
                <div className="p-2 bg-violet-50 rounded-lg">
                  <Timer className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Overtime Hours</p>
                  <p className="font-bold text-violet-600 text-lg">{s?.totalOvertimeThisMonth ?? 0}h</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Building2 className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Active Branches</p>
                  <p className="font-bold text-blue-600 text-lg">{s?.totalBranches ?? 0}</p>
                </div>
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
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />≥80%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />60–79%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />&lt;60%
            </span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            {s.branchWiseSummary.map(branch => (
              <div key={branch.branchId} className="px-5">
                <BranchBar branch={branch} />
              </div>
            ))}
          </div>
        )}

        {!loading && s?.branchWiseSummary && (
          <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span>
                <strong className="text-emerald-700">
                  {s.branchWiseSummary.filter(b => b.total > 0 && Math.round((b.present / b.total) * 100) >= 80).length}
                </strong> branches ≥80%
              </span>
              <span>
                <strong className="text-amber-700">
                  {s.branchWiseSummary.filter(b => {
                    const p = b.total > 0 ? Math.round((b.present / b.total) * 100) : 0;
                    return p >= 60 && p < 80;
                  }).length}
                </strong> branches 60–79%
              </span>
              <span>
                <strong className="text-red-700">
                  {s.branchWiseSummary.filter(b => b.total > 0 && Math.round((b.present / b.total) * 100) < 60).length}
                </strong> branches &lt;60%
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Auto-refreshes every minute
            </div>
          </div>
        )}
      </div>

      {/* Biometric Device Status */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-50 rounded-lg">
              <Fingerprint className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-foreground">Biometric Device Status</h2>
              <p className="text-xs text-muted-foreground">Real-time status of all branch ZKTeco devices</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Online
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400" />Offline
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />Error
            </span>
          </div>
        </div>

        {devLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />Loading devices…
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <Fingerprint className="w-8 h-8 opacity-20" />
            <p className="text-sm">No biometric devices configured yet.</p>
            <p className="text-xs opacity-70">Add devices in the Biometric Devices page.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0 divide-y sm:divide-y-0 divide-border">
            {devices.map(dev => {
              const cfg = DEVICE_STATUS_CFG[dev.status] ?? DEVICE_STATUS_CFG.offline;
              const StatusIcon = cfg.icon;
              const syncAgo = dev.lastSync
                ? (() => {
                    const diff = Math.floor((Date.now() - new Date(dev.lastSync).getTime()) / 1000);
                    if (diff < 60) return `${diff}s ago`;
                    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                    return `${Math.floor(diff / 86400)}d ago`;
                  })()
                : "Never";
              return (
                <div key={dev.id} className={cn(
                  "p-4 border-r border-border last:border-r-0 flex flex-col gap-3",
                  !dev.isActive && "opacity-50"
                )}>
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn("p-1.5 rounded-lg shrink-0", cfg.bg)}>
                        <StatusIcon className={cn("w-3.5 h-3.5", cfg.cls)} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{dev.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{dev.branchName}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn("flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", cfg.badge)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot,
                          dev.status === "online" && "animate-pulse"
                        )} />
                        {dev.status.toUpperCase()}
                      </span>
                      {!dev.isActive && (
                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">INACTIVE</span>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-[10px] text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Model</span>
                      <span className="font-medium text-foreground">{dev.model}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IP Address</span>
                      <span className="font-mono text-foreground">{dev.ipAddress}:{dev.port}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Sync</span>
                      <span className={cn("font-medium",
                        dev.status === "online" ? "text-emerald-600"
                        : dev.status === "error" ? "text-red-500"
                        : "text-muted-foreground"
                      )}>{syncAgo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Method</span>
                      <span className="font-medium text-foreground">
                        {dev.pushMethod === "zkpush" ? "ZK Push" : "SDK"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary footer */}
        {!devLoading && devices.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-5 text-xs text-muted-foreground">
              <span>
                <strong className="text-emerald-700">
                  {devices.filter(d => d.status === "online").length}
                </strong> online
              </span>
              <span>
                <strong className="text-slate-600">
                  {devices.filter(d => d.status === "offline").length}
                </strong> offline
              </span>
              <span>
                <strong className="text-red-600">
                  {devices.filter(d => d.status === "error").length}
                </strong> error
              </span>
              <span className="text-muted-foreground/60">·</span>
              <span>{devices.length} total device{devices.length !== 1 ? "s" : ""}</span>
            </div>
            <button
              onClick={loadDevices}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", devLoading && "animate-spin")} />
              Refresh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
