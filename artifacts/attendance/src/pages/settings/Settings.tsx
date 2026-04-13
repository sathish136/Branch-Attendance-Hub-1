import { useState, useRef, useEffect } from "react";
import { useListHolidays, useCreateHoliday, useDeleteHoliday } from "@workspace/api-client-react";
import { PageHeader, Card, Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  Calendar, Plus, Trash2, Copy, Check, Building, Clock,
  Fingerprint, Users, ShieldCheck, FileText, Briefcase, ChevronRight,
  Database, Download, AlertTriangle, CheckCircle2, Upload, X, RefreshCw, Wifi
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TYPE_STYLE: Record<string, string> = {
  national:  "bg-blue-100 text-blue-700 border border-blue-200",
  religious: "bg-purple-100 text-purple-700 border border-purple-200",
  special:   "bg-amber-100 text-amber-700 border border-amber-200",
};

const POYA_ICON = "🌕";
function isPoya(name: string) { return name.toLowerCase().includes("poya"); }

type SettingsTab = "organisation" | "attendance" | "hr" | "holidays" | "biometric" | "database" | "mockdata";

const SETTINGS_TABS: { key: SettingsTab; label: string; icon: React.ElementType; description: string; color: string }[] = [
  { key: "organisation", label: "Organisation",       icon: Building,     description: "Name, country, timezone",       color: "text-emerald-600" },
  { key: "attendance",   label: "Attendance Rules",   icon: Clock,        description: "Late, overtime, work week",      color: "text-blue-600"    },
  { key: "hr",           label: "HR Settings",        icon: Users,        description: "Leave, payroll, employment",     color: "text-violet-600"  },
  { key: "holidays",     label: "Holiday Settings",   icon: Calendar,     description: "Public & gazetted holidays",     color: "text-amber-600"   },
  { key: "biometric",   label: "Biometric / ADMS",   icon: Fingerprint,  description: "ZKTeco ZK Push configuration",   color: "text-sky-600"     },
  { key: "database",     label: "Database",           icon: Database,     description: "DB host, port & credentials",   color: "text-orange-600"  },
  { key: "mockdata",     label: "Mock Data",          icon: Database,     description: "Import & clear sample data",     color: "text-rose-600"    },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("organisation");

  const year = 2026;
  const { data: holidays, isLoading, refetch } = useListHolidays({ year });
  const addHoliday    = useCreateHoliday();
  const removeHoliday = useDeleteHoliday();

  const [copied, setCopied]       = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: "", date: "", type: "national", description: "" });
  const [showAdd, setShowAdd]     = useState(false);

  const [orgSaved,  setOrgSaved]  = useState(false);
  const [attSaved,  setAttSaved]  = useState(false);
  const [hrSaved,   setHrSaved]   = useState(false);
  const [zkSaved,   setZkSaved]   = useState(false);

  const [logoUrl, setLogoUrl] = useState<string>(() => localStorage.getItem("org_logo") || "");
  const logoInputRef = useRef<HTMLInputElement>(null);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLogoUrl(result);
      localStorage.setItem("org_logo", result);
      window.dispatchEvent(new Event("org_logo_updated"));
    };
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    setLogoUrl("");
    localStorage.removeItem("org_logo");
    window.dispatchEvent(new Event("org_logo_updated"));
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  const [mockImporting, setMockImporting] = useState(false);
  const [mockClearing,  setMockClearing]  = useState(false);
  const [mockMsg, setMockMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleImportMock() {
    if (!confirm("This will import Sri Lanka Post sample data (branches, departments, designations, employees, holidays). Continue?")) return;
    setMockImporting(true); setMockMsg(null);
    try {
      const r = await fetch(apiUrl("/mock-data/import"), { method: "POST" });
      const d = await r.json();
      setMockMsg({ type: d.success ? "success" : "error", text: d.message });
    } catch { setMockMsg({ type: "error", text: "Request failed. Check server connection." }); }
    setMockImporting(false);
  }

  async function handleClearMock() {
    if (!confirm("WARNING: This will permanently delete ALL employees, departments, branches, shifts, and holidays. Are you sure?")) return;
    setMockClearing(true); setMockMsg(null);
    try {
      const r = await fetch(apiUrl("/mock-data/clear"), { method: "DELETE" });
      const d = await r.json();
      setMockMsg({ type: d.success ? "success" : "error", text: d.message });
    } catch { setMockMsg({ type: "error", text: "Request failed. Check server connection." }); }
    setMockClearing(false);
  }

  const [dbSaved, setDbSaved] = useState(false);
  const [dbCopied, setDbCopied] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbApplying, setDbApplying] = useState(false);
  const [dbApplyResult, setDbApplyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [dbTestResult, setDbTestResult] = useState<{ success: boolean; message: string } | null>(() => {
    const s = localStorage.getItem("db_status");
    return s ? JSON.parse(s) : null;
  });
  const [dbSettings, setDbSettings] = useState(() => {
    const saved = localStorage.getItem("db_settings");
    if (saved) return JSON.parse(saved);
    return { host: "122.165.225.42", port: "5432", database: "colombo", user: "postgres", password: "wtt@adm123" };
  });
  const [dbLoaded, setDbLoaded] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/settings/db/current"))
      .then(r => r.json())
      .then(d => {
        if (!localStorage.getItem("db_settings")) {
          setDbSettings((s: any) => ({ ...s, host: d.host, port: d.port, database: d.database, user: d.user }));
        }
        setDbLoaded(true);
      })
      .catch(() => setDbLoaded(true));
  }, []);

  function setDb(k: string, v: string) {
    setDbSettings((s: any) => ({ ...s, [k]: v }));
  }
  const dbConnStr = `postgresql://${dbSettings.user}:${encodeURIComponent(dbSettings.password)}@${dbSettings.host}:${dbSettings.port}/${dbSettings.database}`;

  async function handleTestDb() {
    setDbTesting(true);
    setDbTestResult(null);
    try {
      const r = await fetch(apiUrl("/settings/db/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dbSettings),
      });
      const d = await r.json();
      setDbTestResult(d);
      localStorage.setItem("db_status", JSON.stringify(d));
    } catch {
      const d = { success: false, message: "Could not reach the server." };
      setDbTestResult(d);
      localStorage.setItem("db_status", JSON.stringify(d));
    }
    setDbTesting(false);
  }

  function handleSaveDb() {
    localStorage.setItem("db_settings", JSON.stringify(dbSettings));
    saveFn(setDbSaved);
  }

  async function handleApplyDb() {
    setDbApplying(true);
    setDbApplyResult(null);
    try {
      const r = await fetch(apiUrl("/settings/db/apply"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dbSettings),
      });
      const d = await r.json();
      if (d.success) {
        localStorage.setItem("db_settings", JSON.stringify(dbSettings));
        localStorage.setItem("db_status", JSON.stringify({ success: true, message: "Applied & connected" }));
        setDbTestResult({ success: true, message: "Applied & connected" });
        setDbApplyResult({ success: true, message: "Server is restarting with new database..." });
      } else {
        setDbApplyResult({ success: false, message: d.message || "Failed to apply." });
      }
    } catch {
      setDbApplyResult({ success: false, message: "Could not reach server." });
    }
    setDbApplying(false);
  }

  const [hrSettings, setHrSettings] = useState({
    annualLeave: "21", sickLeave: "12", casualLeave: "7",
    maternityLeave: "180", paternityLeave: "15",
    probationPeriod: "6", noticePeriod: "30", retirementAge: "60",
    epfEmployee: "12", epfEmployer: "3.67",
    esiEmployee: "0.75", esiEmployer: "3.25",
    workingHoursPerDay: "8", workingDaysPerMonth: "26",
    salaryDay: "1", payrollCutoff: "25",
  });
  function setHr(k: string, v: string) { setHrSettings(s => ({ ...s, [k]: v })); }

  const serverUrl = `${window.location.origin}/api/biometric/push`;
  function handleCopy() { navigator.clipboard.writeText(serverUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  function handleAddHoliday() {
    addHoliday.mutate(
      { data: newHoliday },
      { onSuccess: () => { setNewHoliday({ name: "", date: "", type: "national", description: "" }); setShowAdd(false); refetch(); } }
    );
  }

  const byMonth: Record<number, any[]> = {};
  (holidays || []).forEach(h => {
    const m = new Date(h.date).getMonth();
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(h);
  });

  const poyas    = (holidays || []).filter(h => isPoya(h.name));
  const national = (holidays || []).filter(h => h.type === "national");
  const religious = (holidays || []).filter(h => h.type === "religious" && !isPoya(h.name));

  function saveFn(setter: (v: boolean) => void) {
    setter(true);
    setTimeout(() => setter(false), 2500);
  }

  const activeInfo = SETTINGS_TABS.find(t => t.key === activeTab)!;

  return (
    <div className="flex gap-5 max-w-6xl mx-auto h-full">

      {/* Left Sidebar Nav */}
      <div className="w-56 shrink-0">
        <div className="sticky top-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Settings</p>
          <nav className="flex flex-col gap-1">
            {SETTINGS_TABS.map(({ key, label, icon: Icon, description, color }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group",
                  activeTab === key
                    ? "bg-primary/10 border border-primary/20 shadow-sm"
                    : "hover:bg-muted/60 border border-transparent"
                )}>
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  activeTab === key ? "bg-primary/15" : "bg-muted group-hover:bg-muted/80"
                )}>
                  <Icon className={cn("w-4 h-4", activeTab === key ? color : "text-muted-foreground")} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-xs font-semibold leading-tight", activeTab === key ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{description}</p>
                </div>
                {activeTab === key && <ChevronRight className="w-3 h-3 text-primary shrink-0" />}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Tab Header */}
        <div className="flex items-center gap-3 pb-1">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", "bg-muted")}>
            <activeInfo.icon className={cn("w-5 h-5", activeInfo.color)} />
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight">{activeInfo.label}</h2>
            <p className="text-xs text-muted-foreground">{activeInfo.description}</p>
          </div>
        </div>

        {/* ── Organisation ─────────────────────────────────── */}
        {activeTab === "organisation" && (
          <Card className="p-5 space-y-5">
            <div>
              <Label className="text-xs mb-2 block">Organisation Logo</Label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted overflow-hidden shrink-0">
                  {logoUrl
                    ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                    : <Building className="w-8 h-8 text-muted-foreground" />}
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">Logo is displayed in the sidebar.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Organization Name</Label>
                <Input defaultValue="Sri Lanka Post" />
              </div>
              <div>
                <Label className="text-xs">Short Name</Label>
                <Input defaultValue="SLP" />
              </div>
              <div>
                <Label className="text-xs">Country</Label>
                <Input defaultValue="Sri Lanka" readOnly className="bg-muted" />
              </div>
              <div>
                <Label className="text-xs">Timezone</Label>
                <Select defaultValue="SLST">
                  <option value="SLST">Sri Lanka Standard Time (GMT+5:30)</option>
                  <option value="UTC">UTC (GMT+0)</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Financial Year Start</Label>
                <Select defaultValue="jan">
                  <option value="jan">January</option>
                  <option value="apr">April</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Currency</Label>
                <Input defaultValue="LKR (Rs.)" readOnly className="bg-muted" />
              </div>
              <div className="col-span-2 md:col-span-3">
                <Label className="text-xs">Head Office Address</Label>
                <Input defaultValue="310 D.R. Wijewardena Mawatha, Colombo 10, Sri Lanka" />
              </div>
              <div>
                <Label className="text-xs">Contact Email</Label>
                <Input type="email" defaultValue="hr@slpost.lk" />
              </div>
              <div>
                <Label className="text-xs">Contact Phone</Label>
                <Input defaultValue="+94-11-2326601" />
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <Button className="text-xs flex items-center gap-2" onClick={() => saveFn(setOrgSaved)}>
                {orgSaved ? <><Check className="w-3.5 h-3.5 text-green-400" />Saved!</> : "Save Organisation"}
              </Button>
            </div>
          </Card>
        )}

        {/* ── Attendance Rules ──────────────────────────────── */}
        {activeTab === "attendance" && (
          <Card className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Work Week</Label>
                <Select defaultValue="mon-sat">
                  <option value="mon-fri">Monday – Friday</option>
                  <option value="mon-sat">Monday – Saturday</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Working Hours / Day</Label>
                <Input type="number" defaultValue="8" />
              </div>
              <div>
                <Label className="text-xs">Half-Day Hours</Label>
                <Input type="number" defaultValue="4" />
              </div>
              <div>
                <Label className="text-xs">Late Arrival Threshold (min)</Label>
                <Input type="number" defaultValue="15" />
              </div>
              <div>
                <Label className="text-xs">Early Departure Threshold (min)</Label>
                <Input type="number" defaultValue="15" />
              </div>
              <div>
                <Label className="text-xs">Overtime Threshold (hrs)</Label>
                <Input type="number" defaultValue="8.5" />
              </div>
              <div>
                <Label className="text-xs">Grace Period (min)</Label>
                <Input type="number" defaultValue="5" />
              </div>
              <div>
                <Label className="text-xs">Auto Mark Absent After (hrs)</Label>
                <Input type="number" defaultValue="4" />
              </div>
              <div>
                <Label className="text-xs">Min Hours for Full Day</Label>
                <Input type="number" defaultValue="7" />
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <Button className="text-xs flex items-center gap-2" onClick={() => saveFn(setAttSaved)}>
                {attSaved ? <><Check className="w-3.5 h-3.5 text-green-400" />Saved!</> : "Save Attendance Rules"}
              </Button>
            </div>
          </Card>
        )}

        {/* ── HR Settings ───────────────────────────────────── */}
        {activeTab === "hr" && (
          <div className="space-y-4">
            {/* Leave Policy */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold">Leave Policy</span>
                <span className="text-xs text-muted-foreground ml-1">— days per year</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><Label className="text-xs">Annual / Earned Leave</Label>
                  <Input type="number" value={hrSettings.annualLeave} onChange={e => setHr("annualLeave", e.target.value)} /></div>
                <div><Label className="text-xs">Sick / Medical Leave</Label>
                  <Input type="number" value={hrSettings.sickLeave} onChange={e => setHr("sickLeave", e.target.value)} /></div>
                <div><Label className="text-xs">Casual Leave</Label>
                  <Input type="number" value={hrSettings.casualLeave} onChange={e => setHr("casualLeave", e.target.value)} /></div>
                <div><Label className="text-xs">Maternity Leave (Days)</Label>
                  <Input type="number" value={hrSettings.maternityLeave} onChange={e => setHr("maternityLeave", e.target.value)} /></div>
                <div><Label className="text-xs">Paternity Leave (Days)</Label>
                  <Input type="number" value={hrSettings.paternityLeave} onChange={e => setHr("paternityLeave", e.target.value)} /></div>
              </div>
            </Card>

            {/* Employment Terms */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                <Briefcase className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold">Employment Terms</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><Label className="text-xs">Probation Period (Months)</Label>
                  <Input type="number" value={hrSettings.probationPeriod} onChange={e => setHr("probationPeriod", e.target.value)} /></div>
                <div><Label className="text-xs">Notice Period (Days)</Label>
                  <Input type="number" value={hrSettings.noticePeriod} onChange={e => setHr("noticePeriod", e.target.value)} /></div>
                <div><Label className="text-xs">Retirement Age</Label>
                  <Input type="number" value={hrSettings.retirementAge} onChange={e => setHr("retirementAge", e.target.value)} /></div>
                <div><Label className="text-xs">Working Hours / Day</Label>
                  <Input type="number" value={hrSettings.workingHoursPerDay} onChange={e => setHr("workingHoursPerDay", e.target.value)} /></div>
              </div>
            </Card>

            {/* Payroll & Statutory */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold">Payroll & Statutory Deductions</span>
                <span className="text-xs text-muted-foreground ml-1">— percentages (%)</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><Label className="text-xs">EPF — Employee %</Label>
                  <Input type="number" step="0.01" value={hrSettings.epfEmployee} onChange={e => setHr("epfEmployee", e.target.value)} /></div>
                <div><Label className="text-xs">EPF — Employer %</Label>
                  <Input type="number" step="0.01" value={hrSettings.epfEmployer} onChange={e => setHr("epfEmployer", e.target.value)} /></div>
                <div><Label className="text-xs">ESI — Employee %</Label>
                  <Input type="number" step="0.01" value={hrSettings.esiEmployee} onChange={e => setHr("esiEmployee", e.target.value)} /></div>
                <div><Label className="text-xs">ESI — Employer %</Label>
                  <Input type="number" step="0.01" value={hrSettings.esiEmployer} onChange={e => setHr("esiEmployer", e.target.value)} /></div>
                <div><Label className="text-xs">Working Days / Month</Label>
                  <Input type="number" value={hrSettings.workingDaysPerMonth} onChange={e => setHr("workingDaysPerMonth", e.target.value)} /></div>
                <div><Label className="text-xs">Salary Credit Day</Label>
                  <Select value={hrSettings.salaryDay} onChange={e => setHr("salaryDay", e.target.value)}>
                    {[1,5,10,15,25,28,30].map(d => <option key={d} value={d}>Day {d} of Month</option>)}
                  </Select></div>
                <div><Label className="text-xs">Payroll Cutoff Day</Label>
                  <Input type="number" value={hrSettings.payrollCutoff} onChange={e => setHr("payrollCutoff", e.target.value)} /></div>
              </div>
            </Card>

            <div className="flex justify-end">
              <Button className="text-xs flex items-center gap-2" onClick={() => saveFn(setHrSaved)}>
                {hrSaved ? <><Check className="w-3.5 h-3.5 text-green-400" />Saved!</> : "Save HR Settings"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Holiday Settings ──────────────────────────────── */}
        {activeTab === "holidays" && (
          <div className="space-y-4">
            {/* Summary + Add */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                    National <span className="font-bold ml-0.5">({national.length})</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-base leading-none">{POYA_ICON}</span>
                    Poya <span className="font-bold ml-0.5">({poyas.length})</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                    Religious <span className="font-bold ml-0.5">({religious.length})</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                    Special <span className="font-bold ml-0.5">({(holidays || []).filter(h=>h.type==="special").length})</span>
                  </span>
                </div>
                <Button onClick={() => setShowAdd(v => !v)} className="text-xs flex items-center gap-1.5 h-8 px-3">
                  <Plus className="w-3.5 h-3.5" /> Add Holiday
                </Button>
              </div>

              {showAdd && (
                <div className="mt-4 p-4 bg-muted/40 rounded-lg border border-border">
                  <h4 className="text-xs font-semibold mb-3">New Holiday — {year}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><Label className="text-xs">Name</Label>
                      <Input placeholder="Holiday name" value={newHoliday.name} onChange={e => setNewHoliday(h => ({ ...h, name: e.target.value }))} /></div>
                    <div><Label className="text-xs">Date</Label>
                      <Input type="date" value={newHoliday.date} onChange={e => setNewHoliday(h => ({ ...h, date: e.target.value }))} /></div>
                    <div><Label className="text-xs">Type</Label>
                      <Select value={newHoliday.type} onChange={e => setNewHoliday(h => ({ ...h, type: e.target.value }))}>
                        <option value="national">National</option>
                        <option value="religious">Religious</option>
                        <option value="special">Special</option>
                      </Select></div>
                    <div><Label className="text-xs">Description (optional)</Label>
                      <Input placeholder="Details..." value={newHoliday.description} onChange={e => setNewHoliday(h => ({ ...h, description: e.target.value }))} /></div>
                  </div>
                  <div className="flex gap-2 justify-end mt-3">
                    <Button variant="outline" className="text-xs h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
                    <Button className="text-xs h-8" onClick={handleAddHoliday}
                      disabled={addHoliday.isPending || !newHoliday.name || !newHoliday.date}>
                      {addHoliday.isPending ? "Saving..." : "Add Holiday"}
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {/* Monthly Calendar Grid */}
            <Card className="p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3">Calendar View — {year}</p>
              {isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-6">Loading holidays...</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {MONTH_NAMES.map((monthName, mi) => {
                    const monthHolidays = byMonth[mi] || [];
                    return (
                      <div key={mi} className={cn(
                        "rounded-lg border p-3",
                        monthHolidays.length > 0 ? "border-primary/20 bg-primary/5" : "border-border bg-muted/20"
                      )}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold">{monthName}</span>
                          {monthHolidays.length > 0 && (
                            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                              {monthHolidays.length} holiday{monthHolidays.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        {monthHolidays.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No public holidays</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {monthHolidays.sort((a, b) => a.date.localeCompare(b.date)).map(h => (
                              <li key={h.id} className="flex items-start justify-between gap-1 group">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <span className="text-xs text-muted-foreground font-mono shrink-0 w-5">
                                    {new Date(h.date + "T00:00:00").getDate()}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium leading-tight truncate flex items-center gap-1">
                                      {isPoya(h.name) && <span className="text-sm leading-none">{POYA_ICON}</span>}
                                      {h.name}
                                    </p>
                                    <span className={cn("text-xs px-1.5 py-0 rounded", TYPE_STYLE[h.type] || TYPE_STYLE.special)}>
                                      {h.type === "national" ? "National" : h.type === "religious" ? "Religious" : "Special"}
                                    </span>
                                  </div>
                                </div>
                                <button onClick={() => { if(confirm(`Remove "${h.name}"?`)) removeHoliday.mutate({ id: h.id }, { onSuccess: refetch }); }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 shrink-0 transition-opacity">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Full List Table */}
            {!isLoading && (holidays || []).length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground">Full Holiday List — {year}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        {["Date","Day","Holiday","Type",""].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(holidays || []).sort((a, b) => a.date.localeCompare(b.date)).map(h => {
                        const d = new Date(h.date + "T00:00:00");
                        const day = d.toLocaleDateString("en-IN", { weekday: "long" });
                        const isSun = d.getDay() === 0;
                        return (
                          <tr key={h.id} className={cn("hover:bg-muted/30", isSun && "bg-amber-50/50")}>
                            <td className="px-3 py-2 font-mono">{h.date}</td>
                            <td className={cn("px-3 py-2", isSun && "text-red-500 font-medium")}>{day}</td>
                            <td className="px-3 py-2 font-medium flex items-center gap-1">
                              {isPoya(h.name) && <span>{POYA_ICON}</span>}{h.name}
                            </td>
                            <td className="px-3 py-2">
                              <span className={cn("px-2 py-0.5 rounded text-xs", TYPE_STYLE[h.type] || TYPE_STYLE.special)}>{h.type}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => { if(confirm(`Remove "${h.name}"?`)) removeHoliday.mutate({ id: h.id }, { onSuccess: refetch }); }}
                                className="text-muted-foreground hover:text-red-500 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── Biometric / ADMS ──────────────────────────────── */}
        {activeTab === "biometric" && (
          <div className="space-y-4">
            <Card className="p-5 border-sky-200 bg-sky-50/30">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-sky-100">
                <Fingerprint className="w-4 h-4 text-sky-600" />
                <span className="text-sm font-bold">ZKTeco ZK Push (ADMS) — Server Details</span>
                <span className="ml-auto text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded font-mono">ADMS Ready</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Configure ZKTeco biometric devices to push attendance data via the ADMS protocol.
                Enter these server details in each device's <strong>Cloud Server</strong> or <strong>ADMS settings</strong>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">ADMS Server URL <span className="text-muted-foreground">(copy to device)</span></Label>
                  <div className="flex gap-2">
                    <Input readOnly value={serverUrl} className="bg-muted font-mono text-xs" />
                    <Button variant="outline" className="shrink-0 text-xs h-9 px-3" onClick={handleCopy}>
                      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Server Port</Label>
                  <Input readOnly value="3333" className="bg-muted font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Protocol</Label>
                  <Input readOnly value="HTTP (ADMS / ZK Push)" className="bg-muted text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Heartbeat Interval (seconds)</Label>
                  <Input type="number" defaultValue="30" />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                <span className="text-sm font-bold">Device Setup Guide</span>
                <span className="text-xs text-muted-foreground ml-1">— ZKTeco F-Series / K-Series / G-Series</span>
              </div>
              <ol className="space-y-3">
                {[
                  { step: 1, text: "On the device: Menu → Cloud Server Settings (or ADMS)" },
                  { step: 2, text: "Enable: Cloud Service = ON" },
                  { step: 3, text: <>Server Address: <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{window.location.host}</code></> },
                  { step: 4, text: <>Server Port: <code className="bg-muted px-1.5 py-0.5 rounded font-mono">3333</code></> },
                  { step: 5, text: "Set device Serial Number — this is used as the Device ID in the system" },
                  { step: 6, text: "Save and restart the device — it will start pushing attendance immediately" },
                ].map(({ step, text }) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">{text}</span>
                  </li>
                ))}
              </ol>
            </Card>

            <div className="flex justify-end">
              <Button className="text-xs flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white" onClick={() => saveFn(setZkSaved)}>
                {zkSaved ? <><Check className="w-3.5 h-3.5" />Saved!</> : "Save ZK Settings"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Database ──────────────────────────────────────── */}
        {activeTab === "database" && (
          <div className="space-y-4">

            {/* Test result banner */}
            {dbTestResult && (
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm",
                dbTestResult.success
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              )}>
                {dbTestResult.success
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
                <span className="text-xs">{dbTestResult.message}</span>
                <button className="ml-auto text-xs opacity-60 hover:opacity-100" onClick={() => setDbTestResult(null)}>✕</button>
              </div>
            )}

            <Card className="p-5 border-orange-200 bg-orange-50/20">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-orange-100">
                <Database className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-bold">Database Connection</span>
                <span className={cn("ml-auto text-xs px-2 py-0.5 rounded font-mono", dbLoaded ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>
                  {dbLoaded ? "Active" : "Loading..."}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Enter credentials and click <strong>Test Connection</strong> to validate before updating. To apply a new database, copy the connection string into <code className="bg-muted px-1 rounded">COLOMBO_DB_URL</code> in <code className="bg-muted px-1 rounded">lib/db/src/index.ts</code> and restart the server.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Host / IP Address</Label>
                  <Input value={dbSettings.host} onChange={e => setDb("host", e.target.value)} placeholder="122.165.225.42" className="font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Port</Label>
                  <Input value={dbSettings.port} onChange={e => setDb("port", e.target.value)} placeholder="5432" className="font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Database Name</Label>
                  <Input value={dbSettings.database} onChange={e => setDb("database", e.target.value)} placeholder="colombo" className="font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Username</Label>
                  <Input value={dbSettings.user} onChange={e => setDb("user", e.target.value)} placeholder="postgres" className="font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Password</Label>
                  <Input type="password" value={dbSettings.password} onChange={e => setDb("password", e.target.value)} placeholder="••••••••" className="font-mono text-xs" />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  className={cn("text-xs flex items-center gap-2", dbTestResult?.success ? "bg-green-600 hover:bg-green-700 text-white" : "")}
                  onClick={handleTestDb}
                  disabled={dbTesting}
                >
                  {dbTesting ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Testing...</>
                  ) : dbTestResult?.success ? (
                    <><CheckCircle2 className="w-3.5 h-3.5" />Connection OK</>
                  ) : (
                    <><Wifi className="w-3.5 h-3.5" />Test Connection</>
                  )}
                </Button>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                <span className="text-sm font-bold">Generated Connection String</span>
              </div>
              <Label className="text-xs">Connection URL — copy this into your code / environment variable</Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-muted px-3 py-2.5 rounded-lg text-xs font-mono border border-border break-all select-all">{dbConnStr}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(dbConnStr); setDbCopied(true); setTimeout(() => setDbCopied(false), 2000); }}
                  className="p-2.5 hover:bg-muted rounded-lg border border-border transition-colors shrink-0"
                >
                  {dbCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>
              {dbCopied && <p className="text-xs text-green-600 mt-1">Copied to clipboard!</p>}
            </Card>

            {/* Apply result */}
            {dbApplyResult && (
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border text-xs",
                dbApplyResult.success
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              )}>
                {dbApplyResult.success
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
                <span>{dbApplyResult.message}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                {dbTestResult ? (
                  dbTestResult.success
                    ? <span className="flex items-center gap-1.5 text-green-600 font-medium"><CheckCircle2 className="w-3.5 h-3.5" />Connection verified</span>
                    : <span className="flex items-center gap-1.5 text-red-500 font-medium"><AlertTriangle className="w-3.5 h-3.5" />{dbTestResult.message}</span>
                ) : (
                  <span className="text-muted-foreground italic">Connection not tested yet</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="text-xs flex items-center gap-2" onClick={handleSaveDb}>
                  {dbSaved ? <><Check className="w-3.5 h-3.5 text-green-500" />Saved</> : "Save Credentials"}
                </Button>
                <Button
                  className="text-xs flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={handleApplyDb}
                  disabled={dbApplying}
                  title="Tests connection, saves to server and restarts to apply"
                >
                  {dbApplying
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Applying...</>
                    : <><Database className="w-3.5 h-3.5" />Apply & Restart</>}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Mock Data ─────────────────────────────────────── */}
        {activeTab === "mockdata" && (
          <div className="space-y-4">
            {/* Status message */}
            {mockMsg && (
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm",
                mockMsg.type === "success"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              )}>
                {mockMsg.type === "success"
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
                <span>{mockMsg.text}</span>
                <button className="ml-auto text-xs opacity-60 hover:opacity-100" onClick={() => setMockMsg(null)}>✕</button>
              </div>
            )}

            {/* About card */}
            <Card className="p-5 border-rose-200 bg-rose-50/30">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-rose-100">
                <Database className="w-4 h-4 text-rose-600" />
                <span className="text-sm font-bold">Sri Lanka Post — Sample Data</span>
                <span className="ml-auto text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-mono">LK / SLP</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Instantly populate the system with realistic Sri Lanka Post data for testing and demonstration.
                Includes branches across Sri Lanka, all departments, designations, 50 sample employees, and 2026 public holidays.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Branches", value: "8", note: "Colombo, Kandy, Galle, Jaffna & more" },
                  { label: "Departments", value: "8", note: "OPS, FIN, HR, IT, PSB & more" },
                  { label: "Designations", value: "18", note: "PMG to Delivery Agent" },
                  { label: "Employees", value: "50", note: "Sri Lankan names & NIC numbers" },
                  { label: "Holidays", value: "26", note: "National, Poya & religious — 2026" },
                  { label: "Shifts", value: "4", note: "General, Morning, Evening, Split" },
                  { label: "Country", value: "LK", note: "Sri Lanka" },
                  { label: "Currency", value: "LKR", note: "Sri Lankan Rupee" },
                ].map(({ label, value, note }) => (
                  <div key={label} className="bg-white rounded-lg border border-rose-100 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="text-xl font-bold text-rose-700 leading-tight">{value}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{note}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex items-center gap-2 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                  onClick={handleImportMock}
                  disabled={mockImporting || mockClearing}
                >
                  <Download className="w-3.5 h-3.5" />
                  {mockImporting ? "Importing..." : "Import Sri Lanka Post Data"}
                </Button>
              </div>
            </Card>

            {/* Danger zone */}
            <Card className="p-5 border-red-200 bg-red-50/20">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-red-100">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-bold text-red-700">Danger Zone</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Permanently deletes all employees, departments, designations, branches, shifts, and holidays from the database.
                This action cannot be undone. Use with caution.
              </p>
              <Button
                variant="outline"
                className="flex items-center gap-2 text-xs border-red-300 text-red-600 hover:bg-red-50"
                onClick={handleClearMock}
                disabled={mockImporting || mockClearing}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {mockClearing ? "Clearing..." : "Clear All Data"}
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
