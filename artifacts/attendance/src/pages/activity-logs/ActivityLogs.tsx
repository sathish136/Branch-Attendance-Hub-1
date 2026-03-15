import { useState, useEffect, useCallback } from "react";
import {
  Activity, Search, Filter, RefreshCw, LogIn, LogOut, Eye,
  Shield, AlertTriangle, CheckCircle, XCircle, Clock, MapPin,
  Monitor, User, Download, ChevronLeft, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

const ACTIONS = ["all", "login", "login_failed", "logout", "page_view", "data_access"];
const MODULES = ["all", "Auth", "Attendance", "Payroll", "Employees", "Reports", "Biometric", "Settings", "Users", "Branches", "Shifts"];
const STATUSES = ["all", "success", "failed"];
const PAGE_SIZE = 50;

type LogEntry = {
  id: number;
  userId: number | null;
  username: string;
  fullName: string;
  action: string;
  module: string | null;
  description: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  location: string | null;
  sessionId: string | null;
  status: string;
  createdAt: string;
};

const ACTION_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  login:        { label: "Login",        icon: LogIn,        color: "text-emerald-700", bg: "bg-emerald-100" },
  login_failed: { label: "Login Failed", icon: AlertTriangle, color: "text-red-700",     bg: "bg-red-100" },
  logout:       { label: "Logout",       icon: LogOut,       color: "text-slate-700",   bg: "bg-slate-100" },
  page_view:    { label: "Page View",    icon: Eye,          color: "text-blue-700",    bg: "bg-blue-100" },
  data_access:  { label: "Data Access",  icon: Shield,       color: "text-violet-700",  bg: "bg-violet-100" },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? { label: action, icon: Activity, color: "text-gray-700", bg: "bg-gray-100" };
}

function parseUA(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: "Unknown", os: "Unknown" };
  let browser = "Unknown";
  let os = "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("MSIE") || ua.includes("Trident")) browser = "IE";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  return { browser, os };
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function ActivityLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [module, setModule] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchLogs = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(p * PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (action !== "all") params.set("action", action);
      if (module !== "all") params.set("module", module);
      if (status !== "all") params.set("status", status);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const r = await fetch(apiUrl(`/activity-logs?${params}`));
      const d = await r.json();
      setLogs(d.data || []);
      setTotal(d.total || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, action, module, status, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(0); setPage(0); }, [action, module, status, dateFrom, dateTo]);
  useEffect(() => { fetchLogs(page); }, [page]);

  const handleSearch = () => { setPage(0); fetchLogs(0); };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const summary = {
    total: logs.length,
    logins: logs.filter(l => l.action === "login").length,
    failed: logs.filter(l => l.action === "login_failed").length,
    logouts: logs.filter(l => l.action === "logout").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Access & Activity Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete audit trail — user logins, logouts, page access, IP addresses and locations.
          </p>
        </div>
        <button
          onClick={() => fetchLogs(page)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Records", val: total, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Logins",        val: logs.filter(l=>l.action==="login").length,        icon: LogIn,        color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Failed Logins", val: logs.filter(l=>l.action==="login_failed").length, icon: XCircle,      color: "text-red-600",     bg: "bg-red-50" },
          { label: "Logouts",       val: logs.filter(l=>l.action==="logout").length,       icon: LogOut,       color: "text-slate-600",   bg: "bg-slate-50" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", s.bg)}>
              <s.icon className={cn("w-4 h-4", s.color)} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("font-bold text-xl", s.color)}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-56">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Search user, IP, location, description…"
              className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={handleSearch}
              className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Search
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={action}
              onChange={e => setAction(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none"
            >
              {ACTIONS.map(a => <option key={a} value={a}>{a === "all" ? "All Actions" : a.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </select>
            <select
              value={module}
              onChange={e => setModule(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none"
            >
              {MODULES.map(m => <option key={m} value={m}>{m === "all" ? "All Modules" : m}</option>)}
            </select>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none"
              placeholder="From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none"
              placeholder="To"
            />
            {(search || action !== "all" || module !== "all" || status !== "all" || dateFrom || dateTo) && (
              <button
                onClick={() => { setSearch(""); setAction("all"); setModule("all"); setStatus("all"); setDateFrom(""); setDateTo(""); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Activity className="w-10 h-10 opacity-30" />
            <p className="text-sm">No activity logs found</p>
            <p className="text-xs">Logs will appear here once users start logging in.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Module</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">IP Address</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Device</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => {
                    const meta = getActionMeta(log.action);
                    const device = parseUA(log.userAgent);
                    const isExpanded = expanded === log.id;
                    return (
                      <>
                        <tr
                          key={log.id}
                          className={cn(
                            "border-b border-border/60 hover:bg-muted/30 transition-colors cursor-pointer",
                            i % 2 === 0 ? "bg-background" : "bg-muted/10",
                            log.status === "failed" && "bg-red-50/40 hover:bg-red-50/60",
                            isExpanded && "bg-primary/5"
                          )}
                          onClick={() => setExpanded(isExpanded ? null : log.id)}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{formatTime(log.createdAt)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                                {(log.fullName || log.username).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground text-xs">{log.fullName || log.username}</p>
                                <p className="text-[10px] text-muted-foreground">@{log.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", meta.bg, meta.color)}>
                              <meta.icon className="w-3 h-3" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{log.module || "—"}</td>
                          <td className="px-4 py-3">
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{log.ipAddress || "—"}</code>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span>{log.location || "—"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Monitor className="w-3 h-3 shrink-0" />
                              <span>{device.browser} / {device.os}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {log.status === "success" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                <CheckCircle className="w-3 h-3" />Success
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                                <XCircle className="w-3 h-3" />Failed
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${log.id}-detail`} className="bg-primary/3 border-b border-border/60">
                            <td colSpan={9} className="px-6 py-4">
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                                <div>
                                  <p className="text-muted-foreground mb-1 font-medium">Description</p>
                                  <p className="text-foreground">{log.description || "No description"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground mb-1 font-medium">Full IP Address</p>
                                  <code className="font-mono bg-muted px-2 py-1 rounded">{log.ipAddress || "—"}</code>
                                </div>
                                <div>
                                  <p className="text-muted-foreground mb-1 font-medium">Session ID</p>
                                  <code className="font-mono bg-muted px-2 py-1 rounded">{log.sessionId || "—"}</code>
                                </div>
                                <div className="md:col-span-3">
                                  <p className="text-muted-foreground mb-1 font-medium">User Agent</p>
                                  <p className="text-foreground font-mono text-[10px] break-all bg-muted px-2 py-1 rounded">{log.userAgent || "—"}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} records
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
