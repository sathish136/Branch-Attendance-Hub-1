import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
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
  Banknote,
  Activity,
  UserCog,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem  = { href: string; label: string; icon: React.ElementType };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Attendance",
    items: [
      { href: "/attendance/today",   label: "Today's Attendance", icon: CalendarDays },
      { href: "/attendance/monthly", label: "Monthly Sheet",      icon: CalendarRange },
    ],
  },
  {
    label: "HR Management",
    items: [
      { href: "/employees", label: "Employees", icon: Users    },
      { href: "/payroll",   label: "Payroll",   icon: Banknote },
      { href: "/shifts",    label: "Shifts",    icon: Clock    },
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
    items: [
      { href: "/reports", label: "Reports", icon: FileBarChart },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/users",          label: "User Management", icon: UserCog  },
      { href: "/activity-logs",  label: "Activity Logs",   icon: Activity },
      { href: "/settings",       label: "Settings",        icon: Settings },
    ],
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>(() => localStorage.getItem("org_logo") || "");

  useEffect(() => {
    const handler = () => setLogoUrl(localStorage.getItem("org_logo") || "");
    window.addEventListener("org_logo_updated", handler);
    return () => window.removeEventListener("org_logo_updated", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground flex flex-col border-r border-white/8 shadow-xl z-10 shrink-0",
          "transition-[width] duration-300 ease-in-out overflow-hidden",
          collapsed ? "w-[60px]" : "w-[220px]"
        )}
      >
        {/* Brand + collapse toggle */}
        <div className={cn(
          "flex items-center border-b border-white/8 shrink-0",
          collapsed ? "justify-center px-0 py-4" : "px-4 pt-5 pb-4 gap-3"
        )}>
          <div className="w-8 h-8 rounded-xl bg-sidebar-active flex items-center justify-center shadow overflow-hidden shrink-0">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-0.5" />
              : <span className="font-extrabold text-sm text-white">P</span>}
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <span className="font-bold text-sm tracking-tight text-white block truncate">PostHRMS</span>
              <span className="text-[10px] text-white/50 block truncate">Sri Lanka Post</span>
            </div>
          )}

          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors shrink-0"
              title="Collapse sidebar"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Expand button (collapsed state) */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center py-3 hover:bg-white/10 text-white/40 hover:text-white transition-colors border-b border-white/8"
            title="Expand sidebar"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}

        {/* Navigation */}
        <nav className={cn(
          "flex-1 py-4 overflow-y-auto overflow-x-hidden",
          collapsed ? "px-2 space-y-1" : "px-3 space-y-5"
        )}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {/* Category label — hidden when collapsed */}
              {!collapsed && (
                <p className="px-2 mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/35 select-none">
                  {group.label}
                </p>
              )}

              {/* Divider line when collapsed */}
              {collapsed && (
                <div className="my-2 border-t border-white/10" />
              )}

              <div className={cn("space-y-0.5", collapsed && "space-y-1")}>
                {group.items.map((item) => {
                  const isActive =
                    location === item.href ||
                    (item.href !== "/" && location.startsWith(item.href));

                  return collapsed ? (
                    /* ── Collapsed: icon-only pill with tooltip ── */
                    <div key={item.href} className="relative group/tip">
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center justify-center w-full h-9 rounded-xl transition-all duration-150",
                          isActive
                            ? "bg-sidebar-active shadow-md shadow-sidebar-active/30"
                            : "hover:bg-white/10"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "w-[17px] h-[17px] shrink-0",
                            isActive ? "text-white" : "text-white/45 group-hover/tip:text-white"
                          )}
                        />
                      </Link>
                      {/* Tooltip */}
                      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50
                                      opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
                        <div className="bg-gray-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                          {item.label}
                          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Expanded: icon + label ── */
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150",
                        isActive
                          ? "bg-sidebar-active text-white shadow-lg shadow-sidebar-active/25"
                          : "text-white/55 hover:bg-white/8 hover:text-white"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "w-[15px] h-[15px] shrink-0 transition-colors",
                          isActive ? "text-white" : "text-white/45 group-hover:text-white"
                        )}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User profile footer */}
        <div className={cn(
          "border-t border-white/8 shrink-0",
          collapsed ? "p-2" : "p-3"
        )}>
          {collapsed ? (
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-sidebar-active/30 text-white flex items-center justify-center text-xs font-bold border border-white/20">
                AD
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/8 transition-colors">
              <div className="w-8 h-8 rounded-full bg-sidebar-active/30 text-white flex items-center justify-center text-xs font-bold border border-white/20 shrink-0">
                AD
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate leading-tight">Admin User</p>
                <p className="text-[10px] text-white/45 truncate leading-tight">admin@post.com</p>
              </div>
              <button
                className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                title="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 shrink-0 shadow-sm">
          <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
            <span className="font-semibold text-foreground">Head Office</span>
            <span className="text-border">|</span>
            <span>
              {new Date().toLocaleDateString("en-US", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors">
              <Bell className="w-[18px] h-[18px]" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-card" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
