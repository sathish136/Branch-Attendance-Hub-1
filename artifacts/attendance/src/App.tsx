import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useRef } from "react";

import { AppLayout } from "@/components/Layout";
import Login from "@/pages/auth/Login";
import Dashboard from "@/pages/Dashboard";
import TodayAttendance from "@/pages/attendance/Today";
import MonthlySheet from "@/pages/attendance/Monthly";
import EmployeeList from "@/pages/employees/Employees";
import Branches from "@/pages/branches/Branches";
import Shifts from "@/pages/shifts/Shifts";
import Reports from "@/pages/reports/Reports";
import Biometric from "@/pages/biometric/Biometric";
import Settings from "@/pages/settings/Settings";
import Users from "@/pages/users/Users";
import Payroll from "@/pages/payroll/Payroll";
import ActivityLogs from "@/pages/activity-logs/ActivityLogs";
import NotFound from "@/pages/not-found";

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours in ms

function clearAuth() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
  localStorage.removeItem("auth_login_time");
}

export function isAuthValid(): boolean {
  const token = localStorage.getItem("auth_token");
  const loginTime = localStorage.getItem("auth_login_time");
  if (!token) return false;
  if (loginTime && Date.now() - Number(loginTime) > SESSION_DURATION) {
    clearAuth();
    return false;
  }
  return true;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

// Intercept 401 responses globally and auto-logout
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await originalFetch(...args);
  if (response.status === 401) {
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
    if (url.includes("/api/") && !url.includes("/api/auth/login")) {
      clearAuth();
      queryClient.clear();
      window.location.href = `${BASE}/login`;
    }
  }
  return response;
};

function AutoLogoutTimer() {
  const [, setLocation] = useLocation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function scheduleLogout() {
      if (timerRef.current) clearTimeout(timerRef.current);
      const loginTime = Number(localStorage.getItem("auth_login_time") || "0");
      if (!loginTime) return;
      const remaining = SESSION_DURATION - (Date.now() - loginTime);
      if (remaining <= 0) {
        clearAuth();
        queryClient.clear();
        setLocation("/login");
        return;
      }
      timerRef.current = setTimeout(() => {
        clearAuth();
        queryClient.clear();
        setLocation("/login");
      }, remaining);
    }

    scheduleLogout();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [setLocation]);

  return null;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  if (!isAuthValid()) return <Redirect to="/login" />;
  return (
    <AppLayout>
      <AutoLogoutTimer />
      <Component />
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/attendance/today"><ProtectedRoute component={TodayAttendance} /></Route>
      <Route path="/attendance/monthly"><ProtectedRoute component={MonthlySheet} /></Route>
      <Route path="/employees"><ProtectedRoute component={EmployeeList} /></Route>
      <Route path="/branches"><ProtectedRoute component={Branches} /></Route>
      <Route path="/shifts"><ProtectedRoute component={Shifts} /></Route>
      <Route path="/reports"><ProtectedRoute component={Reports} /></Route>
      <Route path="/payroll"><ProtectedRoute component={Payroll} /></Route>
      <Route path="/biometric"><ProtectedRoute component={Biometric} /></Route>
      <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
      <Route path="/users"><ProtectedRoute component={Users} /></Route>
      <Route path="/activity-logs"><ProtectedRoute component={ActivityLogs} /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
