import { Link, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
const liveuLogo = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQCzrc0k5wmNzmItazY38yj1_7K5zAFLMxn-Q&s";
const sriLankaPostLogo = "https://upload.wikimedia.org/wikipedia/en/c/c1/Sri_Lanka_Post_logo.png";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CalendarRange,
  Clock,
  Building2,
  Fingerprint,
  Settings,
  FileBarChart,
  LogOut,
  Bell,
  Activity,
  UserCog,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
  AlertCircle,
  WifiOff,
  UserX,
  AlarmClock,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL_PREFIX = import.meta.env.BASE_URL.replace(/\/$/, "");
function _apiUrl(path: string) { return `${BASE_URL_PREFIX}/api${path}`; }

type NotifItem = {
  id: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  title: string;
  desc: string;
  href?: string;
};

function useNotifications() {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const notifs: NotifItem[] = [];
      try {
        const [devRes, todayRes] = await Promise.allSettled([
          fetch(_apiUrl("/biometric/devices")).then(r => r.json()),
          fetch(_apiUrl("/attendance/today")).then(r => r.json()),
        ]);

        if (devRes.status === "fulfilled") {
          const devices: any[] = Array.isArray(devRes.value) ? devRes.value : [];
          const offline = devices.filter(d => d.status === "offline" || d.status === "error");
          offline.forEach(d => {
            notifs.push({
              id: `dev-offline-${d.id}`,
              icon: WifiOff,
              color: "text-red-600",
              bg: "bg-red-50",
              title: `${d.name} Offline`,
              desc: `Biometric device at ${d.branchName || "unknown branch"} is offline`,
              href: "/biometric",
            });
          });
        }

        if (todayRes.status === "fulfilled") {
          const records: any[] = todayRes.value?.records || [];
          const absent = records.filter(r => r.status === "absent").length;
          const late = records.filter(r => r.status === "late").length;
          if (absent > 0) {
            notifs.push({
              id: "absent-today",
              icon: UserX,
              color: "text-orange-600",
              bg: "bg-orange-50",
              title: `${absent} Absent Today`,
              desc: "Employees haven't checked in yet",
              href: "/attendance/today",
            });
          }
          if (late > 0) {
            notifs.push({
              id: "late-today",
              icon: AlarmClock,
              color: "text-amber-600",
              bg: "bg-amber-50",
              title: `${late} Late Arrival${late > 1 ? "s" : ""}`,
              desc: "Checked in after shift start time",
              href: "/attendance/today",
            });
          }
        }
      } catch { /* silent */ }
      if (!cancelled) { setItems(notifs); setLoading(false); }
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { items, loading };
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type NavItem  = { href: string; label: string; icon: React.ElementType };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Attendance",
    items: [
      { href: "/attendance/today",   label: "Today's Attendance", icon: CalendarDays  },
      { href: "/attendance/monthly", label: "Monthly Sheet",      icon: CalendarRange },
    ],
  },
  {
    label: "HR Management",
    items: [
      { href: "/employees", label: "Employees", icon: Users },
      { href: "/shifts",    label: "Shifts",    icon: Clock },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/branches",  label: "Branches",          icon: Building2   },
      { href: "/biometric", label: "Biometric Devices", icon: Fingerprint },
    ],
  },
  {
    label: "Analytics",
    items: [{ href: "/reports", label: "Reports", icon: FileBarChart }],
  },
  {
    label: "System",
    items: [
      { href: "/users",         label: "User Management", icon: UserCog  },
      { href: "/activity-logs", label: "Activity Logs",   icon: Activity },
      { href: "/settings",      label: "Settings",        icon: Settings },
    ],
  },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map(p => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>(() => localStorage.getItem("org_logo") || sriLankaPostLogo);
  const [now, setNow] = useState(new Date());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { items: notifItems } = useNotifications();
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem("auth_user") || "{}"); } catch { return {}; }
  })();
  const userName  = storedUser.fullName || storedUser.username || "Admin User";
  const userEmail = storedUser.email    || storedUser.username  || "admin@post.com";
  const userRole  = storedUser.role     || "admin";

  useEffect(() => {
    const handler = () => setLogoUrl(localStorage.getItem("org_logo") || sriLankaPostLogo);
    window.addEventListener("org_logo_updated", handler);
    return () => window.removeEventListener("org_logo_updated", handler);
  }, []);

  /* Live clock */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* Close notification dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Focus search input when opened */
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 50);
  }, [searchOpen]);

  async function handleLogout() {
    try {
      const token = localStorage.getItem("auth_token");
      if (token) {
        await fetch(`${BASE}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch { /* ignore */ }
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setLocation("/login");
  }

  return (
    /* Full-viewport container — no outer scroll */
    <div className="h-screen overflow-hidden bg-background flex">

      {/* ── Sidebar ─────────────────────────────── */}
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground flex flex-col border-r border-white/8 shadow-xl z-10 shrink-0 h-full",
          "transition-[width] duration-300 ease-in-out overflow-hidden",
          collapsed ? "w-[60px]" : "w-[220px]"
        )}
      >
        {/* Brand + collapse toggle */}
        <div className={cn(
          "flex items-center border-b border-white/8 shrink-0",
          collapsed ? "justify-center py-4 px-0" : "px-4 pt-5 pb-4 gap-3"
        )}>
          <div className="w-8 h-8 rounded-xl bg-sidebar-active flex items-center justify-center shadow overflow-hidden shrink-0">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-0.5" />
              : <span className="font-extrabold text-sm text-white">P</span>}
          </div>

          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-sm tracking-tight text-white block truncate">PostHRMS</span>
                <span className="text-[10px] text-white/50 block truncate">Live U (Pvt) Ltd</span>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors shrink-0"
                title="Collapse sidebar"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Expand button — collapsed only */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center py-3 hover:bg-white/10 text-white/40 hover:text-white transition-colors border-b border-white/8 shrink-0"
            title="Expand sidebar"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}

        {/* Navigation — scrolls independently */}
        <nav className={cn(
          "flex-1 py-4 overflow-y-auto overflow-x-hidden min-h-0",
          collapsed ? "px-2 space-y-1" : "px-3 space-y-5"
        )}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-2 mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/35 select-none">
                  {group.label}
                </p>
              )}

              {collapsed && (
                <div className="my-2 border-t border-white/10" />
              )}

              <div className={cn("space-y-0.5", collapsed && "space-y-1")}>
                {group.items.map((item) => {
                  const isActive =
                    location === item.href ||
                    (item.href !== "/" && location.startsWith(item.href));

                  /* ── Collapsed item ── */
                  if (collapsed) {
                    return (
                      <div key={item.href} className="relative group/tip" style={{ zIndex: isActive ? 1 : "auto" }}>
                        {/* Concave corner — top */}
                        {isActive && (
                          <span className="pointer-events-none absolute z-[2]"
                            style={{ right: -8, top: -10, width: 10, height: 10,
                              background: "hsl(var(--sidebar))", borderBottomLeftRadius: 10 }} />
                        )}
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center justify-center h-9 rounded-xl transition-all duration-150",
                            isActive
                              ? "nav-active-tab-sm bg-sidebar-active shadow-md shadow-sidebar-active/30"
                              : "w-full hover:bg-white/10"
                          )}
                        >
                          <item.icon className={cn(
                            "w-[17px] h-[17px] shrink-0",
                            isActive ? "text-white" : "text-white/45 group-hover/tip:text-white"
                          )} />
                        </Link>
                        {/* Concave corner — bottom */}
                        {isActive && (
                          <span className="pointer-events-none absolute z-[2]"
                            style={{ right: -8, bottom: -10, width: 10, height: 10,
                              background: "hsl(var(--sidebar))", borderTopLeftRadius: 10 }} />
                        )}
                        {/* Tooltip */}
                        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50
                                        opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
                          <div className="bg-gray-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                            {item.label}
                            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                          </div>
                        </div>
                      </div>
                    );
                  }

                  /* ── Expanded item ── */
                  return (
                    <div key={item.href} className="relative" style={{ zIndex: isActive ? 1 : "auto" }}>
                      {/* Concave corner — top */}
                      {isActive && (
                        <span className="pointer-events-none absolute z-[2]"
                          style={{ right: -12, top: -12, width: 12, height: 12,
                            background: "hsl(var(--sidebar))", borderBottomLeftRadius: 12 }} />
                      )}
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150",
                          isActive
                            ? "nav-active-tab bg-sidebar-active text-white shadow-lg shadow-sidebar-active/25"
                            : "text-white/55 hover:bg-white/8 hover:text-white"
                        )}
                      >
                        <item.icon className={cn(
                          "w-[15px] h-[15px] shrink-0 transition-colors",
                          isActive ? "text-white" : "text-white/45 group-hover:text-white"
                        )} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" />}
                      </Link>
                      {/* Concave corner — bottom */}
                      {isActive && (
                        <span className="pointer-events-none absolute z-[2]"
                          style={{ right: -12, bottom: -12, width: 12, height: 12,
                            background: "hsl(var(--sidebar))", borderTopLeftRadius: 12 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── User Profile Footer — always at bottom ── */}
        <div className={cn(
          "border-t border-white/8 shrink-0",
          collapsed ? "p-2" : "p-3"
        )}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-sidebar-active/40 text-white flex items-center justify-center text-[11px] font-bold border border-white/20">
                {getInitials(userName)}
              </div>
              <button
                onClick={handleLogout}
                className="text-white/40 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-white/10"
                title="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {/* User info row */}
              <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-sidebar-active/40 text-white flex items-center justify-center text-[11px] font-bold border border-white/20 shrink-0">
                  {getInitials(userName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-white truncate leading-tight">{userName}</p>
                  <p className="text-[10px] text-white/45 truncate leading-tight capitalize">{userRole} · {userEmail}</p>
                </div>
              </div>
              {/* Logout button */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium text-white/50 hover:text-red-300 hover:bg-red-500/10 transition-all duration-150"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top header ─────────────────────────────────────────── */}
        <header className="h-14 bg-card border-b border-border flex items-center gap-3 px-5 shrink-0 shadow-sm z-10">

          {/* Left — branch + date/time */}
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <MapPin className="w-[14px] h-[14px] text-primary shrink-0" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Branch</span>
            <span className="text-border text-xs">:</span>
            <span className="font-semibold text-[13px] text-foreground truncate">
              {storedUser.branchName || "Head Office"}
            </span>
            <span className="mx-1 text-border">|</span>
            <span className="text-[12px] text-muted-foreground hidden sm:block">
              {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </span>
            <span className="mx-1 text-border hidden sm:block">·</span>
            <span className="text-[12px] font-mono font-medium text-foreground tabular-nums hidden sm:block">
              {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>

          {/* Centre — search bar */}
          <div className="flex-1 flex justify-center px-4">
            {searchOpen ? (
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); } }}
                  placeholder="Search employees, reports, branches…"
                  className="w-full h-8 pl-8 pr-8 rounded-lg bg-muted border border-border text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 h-8 px-3 rounded-lg bg-muted border border-border text-[13px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all w-full max-w-sm"
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 text-left">Search…</span>
                <kbd className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 font-mono hidden md:inline">⌘K</kbd>
              </button>
            )}
          </div>

          {/* Right — notification + user */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Notification bell */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifOpen(o => !o)}
                className="relative p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
              >
                <Bell className="w-[18px] h-[18px]" />
                {notifItems.length > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border-2 border-card">
                    {notifItems.length > 9 ? "9+" : notifItems.length}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="font-semibold text-[13px]">Notifications</span>
                    {notifItems.length > 0 && (
                      <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">{notifItems.length}</span>
                    )}
                  </div>
                  <div className="divide-y divide-border max-h-72 overflow-y-auto">
                    {notifItems.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Bell className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-[12px] text-muted-foreground">All clear — no alerts right now</p>
                      </div>
                    ) : notifItems.map(n => (
                      <div
                        key={n.id}
                        onClick={() => { if (n.href) { setLocation(n.href); setNotifOpen(false); } }}
                        className={cn("flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors", n.href && "cursor-pointer")}
                      >
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", n.bg)}>
                          <n.icon className={cn("w-4 h-4", n.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-foreground truncate">{n.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{n.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2.5 border-t border-border">
                    <button
                      onClick={() => { setLocation("/activity-logs"); setNotifOpen(false); }}
                      className="w-full text-[12px] text-primary font-medium hover:underline text-center"
                    >
                      View activity logs
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* User chip + dropdown */}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setUserMenuOpen(o => !o)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold border border-primary/30 shrink-0">
                  {getInitials(userName)}
                </div>
                <div className="hidden md:block leading-tight text-left">
                  <p className="text-[12px] font-semibold text-foreground">{userName}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{userRole}</p>
                </div>
              </button>

              {/* User dropdown */}
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  {/* User info header */}
                  <div className="px-4 py-3 border-b border-border bg-muted/40">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-bold border border-primary/30 shrink-0">
                        {getInitials(userName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">{userName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>
                      </div>
                    </div>
                    <span className="mt-2 inline-block text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-medium capitalize">
                      {userRole}
                    </span>
                  </div>
                  {/* Logout */}
                  <div className="p-1.5">
                    <button
                      onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5 shrink-0" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable page content — only this area scrolls */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
