import { useState, useRef, useEffect } from "react";
import { PageHeader, Card, Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  Check, Building, Copy,
  Database, ChevronRight,
  CheckCircle2, AlertTriangle, RefreshCw, Wifi
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

type SettingsTab = "organisation" | "database";

const SETTINGS_TABS: { key: SettingsTab; label: string; icon: React.ElementType; description: string; color: string }[] = [
  { key: "organisation", label: "Organisation",   icon: Building,  description: "Name, country, timezone",     color: "text-emerald-600" },
  { key: "database",     label: "Database",        icon: Database,  description: "DB host, port & credentials", color: "text-orange-600"  },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("organisation");

  const [orgSaved, setOrgSaved] = useState(false);

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
        localStorage.setItem("db_status", JSON.stringify({ success: true, message: d.message }));
        setDbTestResult({ success: true, message: d.message });
        setDbApplyResult({ success: true, message: d.message });
      } else {
        const errStatus = { success: false, message: d.message || "Failed to apply." };
        localStorage.setItem("db_status", JSON.stringify(errStatus));
        setDbTestResult(errStatus);
        setDbApplyResult(errStatus);
      }
    } catch {
      setDbApplyResult({ success: false, message: "Could not reach server." });
    }
    setDbApplying(false);
  }

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
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  <Button variant="outline" className="text-xs h-8" onClick={() => logoInputRef.current?.click()}>Upload Logo</Button>
                  {logoUrl && <Button variant="outline" className="text-xs h-8 text-red-500 border-red-200" onClick={clearLogo}>Remove</Button>}
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
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Connecting...</>
                    : <><Database className="w-3.5 h-3.5" />Apply Database</>}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
