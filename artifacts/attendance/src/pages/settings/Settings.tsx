import { useState, useRef, useEffect } from "react";
import { PageHeader, Card, Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  Check, Building, Copy,
  Database, Download, Upload, FolderOpen,
  CheckCircle2, AlertTriangle, RefreshCw, Wifi, Settings2
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

type SettingsTab = "organisation" | "database";

const TABS: { key: SettingsTab; label: string; icon: React.ElementType; color: string; bg: string }[] = [
  { key: "organisation", label: "Organisation", icon: Building,  color: "text-emerald-600", bg: "bg-emerald-50" },
  { key: "database",     label: "Database",     icon: Database,  color: "text-orange-600",  bg: "bg-orange-50"  },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("organisation");
  const [orgSaved, setOrgSaved]   = useState(false);
  const [logoUrl, setLogoUrl]     = useState<string>(() => localStorage.getItem("org_logo") || "");
  const logoInputRef              = useRef<HTMLInputElement>(null);

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

  const [backupLoading,  setBackupLoading]  = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult,  setRestoreResult]  = useState<{ success: boolean; message: string } | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  async function handleBackup() {
    setBackupLoading(true);
    try {
      const r = await fetch(apiUrl("/settings/db/backup"));
      if (!r.ok) { const e = await r.json(); alert(e.message || "Backup failed"); return; }
      const blob = await r.blob();
      const cd = r.headers.get("content-disposition") || "";
      const filename = cd.match(/filename="([^"]+)"/)?.[1] || "backup.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Could not connect to server."); }
    setBackupLoading(false);
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(`Restore from "${file.name}"? This will add/merge data into the current database. Existing records will be kept.`)) return;
    setRestoreLoading(true); setRestoreResult(null);
    try {
      const fd = new FormData(); fd.append("backup", file);
      const r = await fetch(apiUrl("/settings/db/restore"), { method: "POST", body: fd });
      const d = await r.json();
      setRestoreResult(d);
    } catch { setRestoreResult({ success: false, message: "Could not connect to server." }); }
    setRestoreLoading(false);
    if (restoreInputRef.current) restoreInputRef.current.value = "";
  }

  const [dbSaved,       setDbSaved]       = useState(false);
  const [dbCopied,      setDbCopied]      = useState(false);
  const [dbTesting,     setDbTesting]     = useState(false);
  const [dbApplying,    setDbApplying]    = useState(false);
  const [dbApplyResult, setDbApplyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [dbTestResult,  setDbTestResult]  = useState<{ success: boolean; message: string } | null>(() => {
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

  function setDb(k: string, v: string) { setDbSettings((s: any) => ({ ...s, [k]: v })); }

  const dbConnStr = `postgresql://${dbSettings.user}:${encodeURIComponent(dbSettings.password)}@${dbSettings.host}:${dbSettings.port}/${dbSettings.database}`;

  async function handleTestDb() {
    setDbTesting(true); setDbTestResult(null);
    try {
      const r = await fetch(apiUrl("/settings/db/test"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dbSettings) });
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

  function handleSaveDb() { localStorage.setItem("db_settings", JSON.stringify(dbSettings)); saveFn(setDbSaved); }

  async function handleApplyDb() {
    setDbApplying(true); setDbApplyResult(null);
    try {
      const r = await fetch(apiUrl("/settings/db/apply"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dbSettings) });
      const d = await r.json();
      if (d.success) {
        localStorage.setItem("db_settings", JSON.stringify(dbSettings));
        localStorage.setItem("db_status", JSON.stringify({ success: true, message: d.message }));
        setDbTestResult({ success: true, message: d.message });
        setDbApplyResult({ success: true, message: d.message });
      } else {
        const err = { success: false, message: d.message || "Failed to apply." };
        localStorage.setItem("db_status", JSON.stringify(err));
        setDbTestResult(err); setDbApplyResult(err);
      }
    } catch { setDbApplyResult({ success: false, message: "Could not reach server." }); }
    setDbApplying(false);
  }

  function saveFn(setter: (v: boolean) => void) { setter(true); setTimeout(() => setter(false), 2500); }

  const active = TABS.find(t => t.key === activeTab)!;

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Page title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">Settings</h1>
          <p className="text-xs text-muted-foreground">Manage organisation and database configuration</p>
        </div>
      </div>

      {/* Horizontal tab bar */}
      <div className="flex gap-2 p-1 bg-muted rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon, color, bg }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
              activeTab === key
                ? "bg-white shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className={cn(
              "w-6 h-6 rounded-md flex items-center justify-center",
              activeTab === key ? bg : "bg-transparent"
            )}>
              <Icon className={cn("w-3.5 h-3.5", activeTab === key ? color : "text-muted-foreground")} />
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* ── Organisation ───────────────────────────────────────────── */}
      {activeTab === "organisation" && (
        <div className="space-y-4">
          {/* Logo upload */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <Building className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold">Organisation Logo</span>
            </div>
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted overflow-hidden shrink-0">
                {logoUrl
                  ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                  : <Building className="w-8 h-8 text-muted-foreground/40" />}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                <Button variant="outline" className="text-xs h-8" onClick={() => logoInputRef.current?.click()}>Upload Logo</Button>
                {logoUrl && <Button variant="outline" className="text-xs h-8 text-red-500 border-red-200 hover:bg-red-50" onClick={clearLogo}>Remove</Button>}
                <p className="text-[11px] text-muted-foreground">PNG, JPG up to 2 MB. Shown in the sidebar.</p>
              </div>
            </div>
          </Card>

          {/* Org fields */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <Building className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold">Organisation Details</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Organisation Name</Label>
                <Input defaultValue="Sri Lanka Post" />
              </div>
              <div>
                <Label className="text-xs">Short Name</Label>
                <Input defaultValue="SLP" />
              </div>
              <div>
                <Label className="text-xs">Country</Label>
                <Input defaultValue="Sri Lanka" readOnly className="bg-muted/60" />
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
                <Input defaultValue="LKR (Rs.)" readOnly className="bg-muted/60" />
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
            <div className="flex justify-end mt-5 pt-4 border-t">
              <Button className="text-xs flex items-center gap-2 min-w-[130px] justify-center" onClick={() => saveFn(setOrgSaved)}>
                {orgSaved ? <><Check className="w-3.5 h-3.5 text-green-300" />Saved!</> : "Save Organisation"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Database ───────────────────────────────────────────────── */}
      {activeTab === "database" && (
        <div className="space-y-4">

          {/* Status banner */}
          {dbTestResult && (
            <div className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl border text-xs",
              dbTestResult.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
            )}>
              {dbTestResult.success
                ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
              <span>{dbTestResult.message}</span>
              <button className="ml-auto opacity-60 hover:opacity-100 leading-none" onClick={() => setDbTestResult(null)}>✕</button>
            </div>
          )}

          {/* Credentials */}
          <Card className="p-5 border-orange-200 bg-orange-50/20">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-orange-100">
              <Database className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-semibold">Database Connection</span>
              <span className={cn("ml-auto text-[11px] px-2.5 py-0.5 rounded-full font-medium", dbLoaded ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>
                {dbLoaded ? "● Active" : "Loading…"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Enter your database credentials and click <strong>Test Connection</strong> before applying.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Host / IP Address</Label>
                <Input value={dbSettings.host}     onChange={e => setDb("host",     e.target.value)} placeholder="122.165.225.42" className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs">Port</Label>
                <Input value={dbSettings.port}     onChange={e => setDb("port",     e.target.value)} placeholder="5432"           className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs">Database Name</Label>
                <Input value={dbSettings.database} onChange={e => setDb("database", e.target.value)} placeholder="colombo"        className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs">Username</Label>
                <Input value={dbSettings.user}     onChange={e => setDb("user",     e.target.value)} placeholder="postgres"       className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs">Password</Label>
                <Input type="password" value={dbSettings.password} onChange={e => setDb("password", e.target.value)} placeholder="••••••••" className="font-mono text-xs" />
              </div>
            </div>
            <div className="flex justify-end mt-4 pt-4 border-t border-orange-100">
              <Button
                variant="outline"
                className={cn("text-xs flex items-center gap-2 min-w-[140px] justify-center border-orange-300",
                  dbTestResult?.success ? "border-green-400 bg-green-50 text-green-700 hover:bg-green-100" : "")}
                onClick={handleTestDb}
                disabled={dbTesting}
              >
                {dbTesting
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Testing…</>
                  : dbTestResult?.success
                    ? <><CheckCircle2 className="w-3.5 h-3.5" />Connection OK</>
                    : <><Wifi className="w-3.5 h-3.5" />Test Connection</>}
              </Button>
            </div>
          </Card>

          {/* Connection string */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b">
              <span className="text-sm font-semibold">Connection String</span>
              <span className="ml-auto text-[11px] text-muted-foreground">Copy into environment variable</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2.5 rounded-lg text-xs font-mono border border-border break-all select-all">{dbConnStr}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(dbConnStr); setDbCopied(true); setTimeout(() => setDbCopied(false), 2000); }}
                className="p-2.5 hover:bg-muted rounded-lg border border-border transition-colors shrink-0"
                title="Copy"
              >
                {dbCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            </div>
            {dbCopied && <p className="text-xs text-green-600 mt-1.5">Copied to clipboard!</p>}
          </Card>

          {/* Backup & Restore */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <Database className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold">Backup & Restore</span>
              <span className="ml-auto text-[11px] text-muted-foreground">Downloads a full JSON snapshot of all tables</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 rounded-xl border border-green-200 bg-green-50/40 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Download className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">Download Backup</span>
                </div>
                <p className="text-xs text-green-700 mb-3">Exports all database tables as a JSON file you can store safely.</p>
                <Button
                  className="text-xs w-full flex items-center gap-2 justify-center bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleBackup}
                  disabled={backupLoading}
                >
                  {backupLoading
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Exporting…</>
                    : <><Download className="w-3.5 h-3.5" />Download Backup</>}
                </Button>
              </div>
              <div className="flex-1 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">Restore from Backup</span>
                </div>
                <p className="text-xs text-blue-700 mb-3">Upload a previous backup file. Existing records will be kept (merge, not overwrite).</p>
                <input ref={restoreInputRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
                <Button
                  className="text-xs w-full flex items-center gap-2 justify-center"
                  variant="outline"
                  onClick={() => restoreInputRef.current?.click()}
                  disabled={restoreLoading}
                >
                  {restoreLoading
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Restoring…</>
                    : <><FolderOpen className="w-3.5 h-3.5" />Choose Backup File</>}
                </Button>
              </div>
            </div>
            {restoreResult && (
              <div className={cn(
                "mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
                restoreResult.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
              )}>
                {restoreResult.success
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                <span>{restoreResult.message}</span>
                <button className="ml-auto opacity-60 hover:opacity-100" onClick={() => setRestoreResult(null)}>✕</button>
              </div>
            )}
          </Card>

          {/* Apply result */}
          {dbApplyResult && (
            <div className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl border text-xs",
              dbApplyResult.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
            )}>
              {dbApplyResult.success
                ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
              <span>{dbApplyResult.message}</span>
            </div>
          )}

          {/* Save / Apply row */}
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs">
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
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Connecting…</>
                  : <><Database className="w-3.5 h-3.5" />Apply Database</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
