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
  Bell
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/attendance/today", label: "Today's Attendance", icon: CalendarDays },
  { href: "/attendance/monthly", label: "Monthly Sheet", icon: CalendarRange },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/shifts", label: "Shifts", icon: Clock },
  { href: "/branches", label: "Branches", icon: Building2 },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/biometric", label: "Biometric Devices", icon: Fingerprint },
  { href: "/users", label: "User Management", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [logoUrl, setLogoUrl] = useState<string>(() => localStorage.getItem("org_logo") || "");

  useEffect(() => {
    const handler = () => setLogoUrl(localStorage.getItem("org_logo") || "");
    window.addEventListener("org_logo_updated", handler);
    return () => window.removeEventListener("org_logo_updated", handler);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border shadow-xl z-10 shrink-0">
        <div className="p-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shadow-md overflow-hidden shrink-0">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-0.5" />
              : <span className="font-bold text-base text-white">P</span>}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm tracking-tight text-white block truncate">PostHRMS</span>
            <span className="text-[10px] text-white/50 block truncate">Sri Lanka Post</span>
          </div>
        </div>
        
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-sidebar-active text-white shadow-md shadow-primary/20" 
                    : "hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className={cn("w-4 h-4", isActive ? "text-white" : "text-sidebar-foreground opacity-70")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold border border-primary/30">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Admin User</p>
              <p className="text-xs text-sidebar-foreground truncate">admin@post.com</p>
            </div>
            <button className="text-sidebar-foreground hover:text-white transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shrink-0 z-0 shadow-sm">
          <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
            <span>Head Office</span>
            <span className="text-border">|</span>
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-card"></span>
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
