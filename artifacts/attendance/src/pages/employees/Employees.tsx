import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee,
  useListBranches
} from "@workspace/api-client-react";
import { PageHeader, Card, Button, Input, Label, Select, useConfirm } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  Search, Plus, Edit2, Trash2, Download, Mail,
  MapPin, X, Building2, Users, Layers,
  FileText, Upload, CheckCircle2, AlertCircle, UserCircle,
  Briefcase, Phone, Hash, CreditCard, Calendar,
  IdCard, Home, Shield, Camera
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUS_STYLE: Record<string, string> = {
  active:     "bg-green-100 text-green-700 border border-green-200",
  on_leave:   "bg-yellow-100 text-yellow-700 border border-yellow-200",
  resigned:   "bg-orange-100 text-orange-700 border border-orange-200",
  terminated: "bg-red-100 text-red-700 border border-red-200",
};
const EMP_TYPE_STYLE: Record<string, string> = {
  permanent: "bg-blue-100 text-blue-700",
  contract:  "bg-purple-100 text-purple-700",
  casual:    "bg-gray-100 text-gray-600",
};

const TABS = ["Employee List", "Departments", "Designations"] as const;
type Tab = typeof TABS[number];

const DEPT_LIST = ["Operations","Finance & Accounts","Human Resources","Information Technology","Postal Services","Customer Service","Administration","Logistics & Delivery"];
const DESIGNATION_LIST = ["Postmaster","Assistant Postmaster","Supervisor","Postal Officer","Counter Clerk","Sorting Officer","Delivery Agent","Data Entry Operator","Accounts Officer","HR Officer","IT Officer","Driver","Security Officer","Clerical Assistant"];

function apiUrl(path: string) { return `${BASE}/api${path}`; }

function empDisplayName(emp: any) {
  if (emp.firstName && emp.lastName) return `${emp.firstName} ${emp.lastName}`;
  return emp.fullName || "";
}

function useGet(key: string[], path: string) {
  return useQuery({ queryKey: key, queryFn: () => fetch(apiUrl(path)).then(r => r.json()) });
}
function useMut(method: string, path: string, qk: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => fetch(apiUrl(typeof path === "function" ? (path as any)(body) : path), {
      method, headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });
}

// ── Mini Dashboard ─────────────────────────────────────────────────────────────
function EmployeeMiniDashboard({ allEmployees, onFilter }: { allEmployees: any[]; onFilter: (status: string) => void }) {
  const total = allEmployees.length;
  const active = allEmployees.filter(e => e.status === "active").length;
  const onLeave = allEmployees.filter(e => e.status === "on_leave").length;
  const resigned = allEmployees.filter(e => e.status === "resigned").length;
  const terminated = allEmployees.filter(e => e.status === "terminated").length;

  const permanent = allEmployees.filter(e => e.employeeType === "permanent").length;
  const contract = allEmployees.filter(e => e.employeeType === "contract").length;
  const casual = allEmployees.filter(e => e.employeeType === "casual").length;

  const deptMap: Record<string, number> = {};
  allEmployees.forEach(e => { if (e.department) deptMap[e.department] = (deptMap[e.department] || 0) + 1; });
  const topDepts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="grid grid-cols-12 gap-3 mb-1">
      {/* Left: Status breakdown */}
      <div className="col-span-12 md:col-span-5 bg-card border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Employee Status
        </p>
        <div className="flex items-end gap-3 mb-3">
          <span className="text-4xl font-bold text-foreground">{total}</span>
          <span className="text-xs text-muted-foreground mb-1">Total Employees</span>
        </div>
        <div className="space-y-2">
          {[
            { label: "Active",     val: active,     color: "bg-green-500",  status: "active" },
            { label: "On Leave",   val: onLeave,    color: "bg-yellow-400", status: "on_leave" },
            { label: "Resigned",   val: resigned,   color: "bg-orange-400", status: "resigned" },
            { label: "Terminated", val: terminated, color: "bg-red-500",    status: "terminated" },
          ].map(s => (
            <button key={s.label} onClick={() => onFilter(s.status)}
              className="w-full flex items-center gap-2 text-xs hover:bg-muted/40 rounded px-1 py-0.5 transition-colors group">
              <div className={cn("w-2 h-2 rounded-full shrink-0", s.color)} />
              <span className="flex-1 text-left text-muted-foreground group-hover:text-foreground">{s.label}</span>
              <span className="font-semibold text-foreground">{s.val}</span>
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full", s.color)} style={{ width: total ? `${(s.val / total) * 100}%` : "0%" }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Middle: Employment Type */}
      <div className="col-span-12 md:col-span-3">
        <div className="bg-card border border-border rounded-xl p-4 h-full">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" /> Employment Type
          </p>
          <div className="space-y-3">
            {[
              { label: "Permanent", val: permanent, cls: "text-blue-600 bg-blue-50", bar: "bg-blue-400" },
              { label: "Contract",  val: contract,  cls: "text-purple-600 bg-purple-50", bar: "bg-purple-400" },
              { label: "Casual",    val: casual,    cls: "text-gray-600 bg-gray-50", bar: "bg-gray-400" },
            ].map(t => (
              <div key={t.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{t.label}</span>
                  <span className={cn("text-xs font-bold px-2 py-0.5 rounded", t.cls)}>{t.val}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", t.bar)} style={{ width: total ? `${(t.val / total) * 100}%` : "0%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Department breakdown */}
      <div className="col-span-12 md:col-span-4 bg-card border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" /> Top Departments
        </p>
        {topDepts.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No data yet</p>
        ) : (
          <div className="space-y-3">
            {topDepts.map(([dept, count]) => (
              <div key={dept}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs truncate max-w-[160px] text-muted-foreground">{dept}</span>
                  <span className="text-xs font-bold text-foreground">{count}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Active headcount</span>
          <span className="text-xs font-bold text-green-600">{active} / {total}</span>
        </div>
      </div>
    </div>
  );
}

// ── Document Upload Row ────────────────────────────────────────────────────────
function DocUploadRow({
  label, fieldName, currentUrl, empId, onUploaded
}: {
  label: string; fieldName: string; currentUrl?: string; empId?: number; onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !empId) return;
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append(fieldName, file);
      const resp = await fetch(apiUrl(`/employees/${empId}/documents`), { method: "POST", body: fd });
      if (!resp.ok) throw new Error("Upload failed");
      onUploaded();
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-xs font-medium">{label}</p>
          {currentUrl ? (
            <a href={currentUrl} target="_blank" rel="noreferrer"
              className="text-xs text-primary flex items-center gap-1 hover:underline">
              View uploaded file
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No file uploaded</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {currentUrl && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {error && <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</span>}
        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={handleFile} />
        <Button variant="outline" className="text-xs h-7 px-2.5" disabled={uploading || !empId}
          onClick={() => fileRef.current?.click()}>
          {uploading ? (
            <span className="flex items-center gap-1.5"><Upload className="w-3 h-3 animate-pulse" />Uploading...</span>
          ) : (
            <span className="flex items-center gap-1.5"><Upload className="w-3 h-3" />{currentUrl ? "Replace" : "Upload"}</span>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Employee Profile Drawer ────────────────────────────────────────────────────
const EMPTY_EMP = {
  employeeId:"", firstName:"", lastName:"", gender:"male", dateOfBirth:"", phone:"", email:"",
  address:"", aadharNumber:"", panNumber:"",
  designation:"", department:"", branchId:1, shiftId:"", joiningDate:"",
  employeeType:"permanent", reportingManagerId:"", biometricId:"", status:"active",
};

function EmployeeDrawer({ emp, branches, onClose, onSaved }: { emp?: any; branches: any[]; onClose: () => void; onSaved: () => void }) {
  const { data: apiDepts } = useGet(["departments"], "/departments");
  const { data: apiDesigs } = useGet(["designations"], "/designations");
  const deptOptions: string[] = Array.isArray(apiDepts) && apiDepts.length > 0
    ? apiDepts.map((d: any) => d.name)
    : DEPT_LIST;
  const desigOptions: string[] = Array.isArray(apiDesigs) && apiDesigs.length > 0
    ? apiDesigs.map((d: any) => d.name)
    : DESIGNATION_LIST;

  const [tab, setTab] = useState<"personal"|"professional"|"documents">("personal");
  const [form, setForm] = useState(emp ? {
    ...EMPTY_EMP, ...emp,
    firstName: emp.firstName || "",
    lastName: emp.lastName || (emp.fullName && !emp.firstName ? emp.fullName : ""),
    branchId: emp.branchId || 1,
    dateOfBirth: emp.dateOfBirth || "",
    shiftId: emp.shiftId || "",
    reportingManagerId: emp.reportingManagerId || "",
    aadharNumber: emp.aadharNumber || "",
    panNumber: emp.panNumber || "",
  } : { ...EMPTY_EMP });
  const [photoPreview, setPhotoPreview] = useState<string>(emp?.photoUrl || "");
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const [regionalInfo, setRegionalInfo] = useState<{ prefix: string; nextId: string; regionalName: string } | null>(null);
  const [empIdError, setEmpIdError] = useState<string>("");

  useEffect(() => {
    if (emp) return;
    const branchId = Number(form.branchId);
    if (!branchId) return;
    fetch(apiUrl(`/employees/next-id?branchId=${branchId}`))
      .then(r => r.json())
      .then(data => {
        if (!data.noRegional) {
          setRegionalInfo({ prefix: data.prefix, nextId: data.nextId, regionalName: data.regionalName });
          setForm(f => ({ ...f, employeeId: data.nextId }));
          setEmpIdError("");
        } else {
          setRegionalInfo(null);
        }
      })
      .catch(() => {});
  }, [form.branchId, emp]);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !emp?.id) return;
    setPhotoUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
      const fd = new FormData();
      fd.append("photo", file);
      const resp = await fetch(apiUrl(`/employees/${emp.id}/documents`), { method: "POST", body: fd });
      if (resp.ok) { const d = await resp.json(); setPhotoPreview(d.employee?.photoUrl || photoPreview); onSaved(); }
    } finally {
      setPhotoUploading(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  }
  const createEmp = useCreateEmployee();
  const updateEmp = useUpdateEmployee();

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  function handleSave() {
    setEmpIdError("");
    const payload = {
      ...form,
      fullName: `${form.firstName} ${form.lastName}`.trim() || form.firstName || "Employee",
      branchId: Number(form.branchId),
      shiftId: form.shiftId ? Number(form.shiftId) : null,
      reportingManagerId: form.reportingManagerId ? Number(form.reportingManagerId) : null,
    };
    const onError = (data: any) => {
      if (data?.code === "INVALID_EMPLOYEE_ID") {
        setEmpIdError(data.message || "Invalid Employee ID");
        setTab("professional");
      }
    };
    if (emp?.id) {
      updateEmp.mutate({ id: emp.id, data: payload }, {
        onSuccess: (data) => { if (data?.code === "INVALID_EMPLOYEE_ID") { onError(data); } else { onSaved(); } }
      });
    } else {
      createEmp.mutate({ data: payload }, {
        onSuccess: (data) => { if (data?.code === "INVALID_EMPLOYEE_ID") { onError(data); } else { onSaved(); } }
      });
    }
  }

  const isPending = createEmp.isPending || updateEmp.isPending;
  const isSaved = !!emp?.id;

  const initials = form.firstName && form.lastName
    ? `${form.firstName[0]}${form.lastName[0]}`.toUpperCase()
    : form.firstName?.[0]?.toUpperCase() || "E";

  const DRAWER_TABS = [
    { key: "personal", label: "Personal", icon: UserCircle, step: 1 },
    { key: "professional", label: "Professional", icon: Briefcase, step: 2 },
    { key: "documents", label: "Documents", icon: FileText, step: 3 },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-background border-l border-border shadow-2xl flex flex-col h-full overflow-hidden">

        {/* Drawer Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border bg-gradient-to-r from-primary/5 to-background">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                {photoPreview
                  ? <img src={photoPreview} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-base font-bold text-primary">{initials}</span>
                }
              </div>
              <div>
                <h2 className="font-bold text-base leading-tight">{emp ? "Edit Employee Profile" : "New Employee"}</h2>
                {emp
                  ? <p className="text-xs text-muted-foreground mt-0.5">{emp.employeeId} · {empDisplayName(emp)}</p>
                  : <p className="text-xs text-muted-foreground mt-0.5">Fill in the details below</p>
                }
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step Tabs */}
          <div className="flex gap-2 mt-4">
            {DRAWER_TABS.map(({ key, label, icon: Icon, step }) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex-1 justify-center",
                  tab === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}>
                <span className={cn(
                  "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                  tab === key ? "bg-white/20" : "bg-background"
                )}>{step}</span>
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {tab === "personal" && (
            <>
              {/* Photo Upload */}
              <div className="flex flex-col items-center gap-2 py-3">
                <div className="relative group">
                  <div className="w-20 h-20 rounded-full border-2 border-border bg-muted/40 overflow-hidden flex items-center justify-center shadow-sm">
                    {photoPreview
                      ? <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                      : <UserCircle className="w-10 h-10 text-muted-foreground/50" />
                    }
                  </div>
                  <button type="button"
                    disabled={!emp?.id || photoUploading}
                    onClick={() => photoRef.current?.click()}
                    className={cn(
                      "absolute bottom-0 right-0 w-7 h-7 rounded-full border-2 border-background flex items-center justify-center shadow transition-all",
                      emp?.id
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}>
                    {photoUploading
                      ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <Camera className="w-3.5 h-3.5" />
                    }
                  </button>
                  <input ref={photoRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {emp?.id
                    ? (photoPreview ? "Click camera to change photo" : "Click camera icon to upload photo")
                    : "Save employee first to upload photo"
                  }
                </p>
              </div>

              {/* Basic Info Section */}
              <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
                  <UserCircle className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Basic Information</span>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4">
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">First Name <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input className="pl-8" placeholder="e.g. Rahul" value={form.firstName} onChange={e => set("firstName", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Last Name <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input className="pl-8" placeholder="e.g. Sharma" value={form.lastName} onChange={e => set("lastName", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Gender</Label>
                    <Select value={form.gender} onChange={e => set("gender", e.target.value)}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Date of Birth</Label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input type="date" className="pl-8" value={form.dateOfBirth} onChange={e => set("dateOfBirth", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Section */}
              <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
                  <Phone className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Contact Details</span>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4">
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Phone <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input className="pl-8" placeholder="9XXXXXXXXX" value={form.phone} onChange={e => set("phone", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Email <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input type="email" className="pl-8" placeholder="name@company.com" value={form.email} onChange={e => set("email", e.target.value)} />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs font-semibold mb-1.5 block">Address</Label>
                    <div className="relative">
                      <Home className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input className="pl-8" placeholder="House No., Street, City, State, PIN" value={form.address} onChange={e => set("address", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Identity Section */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 border-b border-primary/20">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-bold text-primary uppercase tracking-widest">Government Identity</span>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4">
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Aadhar Number</Label>
                    <div className="relative">
                      <IdCard className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input className="pl-8 font-mono tracking-wider" placeholder="XXXX XXXX XXXX" value={form.aadharNumber} onChange={e => set("aadharNumber", e.target.value)} maxLength={14} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">PAN Number</Label>
                    <div className="relative">
                      <CreditCard className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input className="pl-8 font-mono tracking-wider uppercase" placeholder="ABCDE1234F" value={form.panNumber} onChange={e => set("panNumber", e.target.value.toUpperCase())} maxLength={10} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "professional" && (
            <div className="space-y-5">
              {/* Employment Info */}
              <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
                  <Briefcase className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Employment Information</span>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4">
                  <div className="col-span-2">
                    <Label className="text-xs font-semibold mb-1.5 block">
                      Employee ID <span className="text-red-500">*</span>
                      {regionalInfo && !emp && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          <Building2 className="w-2.5 h-2.5" />
                          {regionalInfo.regionalName} Regional · prefix: <span className="font-mono font-bold">{regionalInfo.prefix}</span>
                        </span>
                      )}
                    </Label>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        className={cn("pl-8 font-mono uppercase", empIdError ? "border-red-400 focus:border-red-500" : "")}
                        placeholder={regionalInfo ? `${regionalInfo.prefix}001` : "EMP-0001"}
                        value={form.employeeId}
                        onChange={e => { set("employeeId", e.target.value.toUpperCase()); setEmpIdError(""); }}
                        disabled={!!emp}
                      />
                    </div>
                    {empIdError ? (
                      <p className="text-xs text-red-500 flex items-start gap-1 mt-1.5">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />{empIdError}
                      </p>
                    ) : regionalInfo && !emp ? (
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                        Suggested next ID: <span className="font-mono font-semibold text-foreground">{regionalInfo.nextId}</span>
                        — must be unique across all {regionalInfo.regionalName} branches
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Status</Label>
                    <Select value={form.status} onChange={e => set("status", e.target.value)}>
                      <option value="active">✅ Active</option>
                      <option value="on_leave">🟡 On Leave</option>
                      <option value="resigned">🟠 Resigned</option>
                      <option value="terminated">🔴 Terminated</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Employee Type</Label>
                    <Select value={form.employeeType} onChange={e => set("employeeType", e.target.value)}>
                      <option value="permanent">Permanent</option>
                      <option value="contract">Contract</option>
                      <option value="casual">Casual</option>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Joining Date <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input type="date" className="pl-8" value={form.joiningDate} onChange={e => set("joiningDate", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Role & Placement */}
              <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Role & Placement</span>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4">
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Department <span className="text-red-500">*</span></Label>
                    <Select value={form.department} onChange={e => set("department", e.target.value)}>
                      <option value="">— Select Department —</option>
                      {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Designation <span className="text-red-500">*</span></Label>
                    <Select value={form.designation} onChange={e => set("designation", e.target.value)}>
                      <option value="">— Select Designation —</option>
                      {desigOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Branch <span className="text-red-500">*</span></Label>
                    <Select value={form.branchId} onChange={e => set("branchId", Number(e.target.value))}>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Biometric Device ID</Label>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input className="pl-8" placeholder="e.g. 101" value={form.biometricId} onChange={e => set("biometricId", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "documents" && (
            <div className="space-y-3">
              {!isSaved ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Save employee profile first</p>
                  <p className="text-xs text-muted-foreground mt-1">Create the employee record before uploading documents.</p>
                  <Button onClick={handleSave} disabled={isPending} className="mt-3 text-xs h-8">
                    {isPending ? "Saving..." : "Save Profile Now"}
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Upload documents in PDF, JPG, PNG, or DOC format (max 10MB each).</p>
                  <DocUploadRow label="Aadhar Card" fieldName="aadharDoc" currentUrl={emp?.aadharDocUrl} empId={emp?.id} onUploaded={onSaved} />
                  <DocUploadRow label="PAN Card" fieldName="panDoc" currentUrl={emp?.panDocUrl} empId={emp?.id} onUploaded={onSaved} />
                  <DocUploadRow label="Certificates" fieldName="certificatesDoc" currentUrl={emp?.certificatesDocUrl} empId={emp?.id} onUploaded={onSaved} />
                  <DocUploadRow label="Resume / CV" fieldName="resumeDoc" currentUrl={emp?.resumeDocUrl} empId={emp?.id} onUploaded={onSaved} />
                  <div className="rounded-lg bg-muted/50 p-3 mt-2">
                    <p className="text-xs font-medium mb-1.5">Document Status</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Aadhar Card", url: emp?.aadharDocUrl },
                        { label: "PAN Card", url: emp?.panDocUrl },
                        { label: "Certificates", url: emp?.certificatesDocUrl },
                        { label: "Resume / CV", url: emp?.resumeDocUrl },
                      ].map(doc => (
                        <div key={doc.label} className="flex items-center gap-1.5 text-xs">
                          {doc.url
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          <span className={doc.url ? "text-foreground" : "text-muted-foreground"}>{doc.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {tab !== "documents" && (
          <div className="border-t border-border px-5 py-4 flex justify-end gap-3 bg-muted/20">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : emp ? "Update Employee" : "Create Employee"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Departments Tab ────────────────────────────────────────────────────────────
function DepartmentsTab() {
  const qc = useQueryClient();
  const { data: depts, isLoading } = useGet(["departments"], "/departments");
  const createD = useMut("POST", "/departments", ["departments"]);
  const updateD = useMutation({
    mutationFn: ({ id, data }: any) => fetch(apiUrl(`/departments/${id}`), {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });
  const deleteD = useMutation({
    mutationFn: (id: number) => fetch(apiUrl(`/departments/${id}`), { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });
  const [form, setForm] = useState({ name:"", code:"", description:"" });
  const [editId, setEditId] = useState<number|null>(null);
  const [showForm, setShowForm] = useState(false);

  function openEdit(d: any) { setForm({ name: d.name, code: d.code, description: d.description || "" }); setEditId(d.id); setShowForm(true); }
  function openNew() { setForm({ name:"", code:"", description:"" }); setEditId(null); setShowForm(true); }
  function handleSave() {
    if (editId) updateD.mutate({ id: editId, data: form }, { onSuccess: () => setShowForm(false) });
    else createD.mutate(form, { onSuccess: () => setShowForm(false) });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={openNew} className="text-xs flex items-center gap-1.5 h-8 px-3"><Plus className="w-3.5 h-3.5" />Add Department</Button>
      </div>
      {showForm && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <p className="text-xs font-semibold mb-3">{editId ? "Edit Department" : "New Department"}</p>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Department Name</Label><Input placeholder="e.g. Operations" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
            <div><Label className="text-xs">Code</Label><Input placeholder="OPS" value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value.toUpperCase()}))} /></div>
            <div><Label className="text-xs">Description</Label><Input placeholder="Short description" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} /></div>
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <Button variant="outline" className="text-xs h-8" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="text-xs h-8" onClick={handleSave}>Save</Button>
          </div>
        </Card>
      )}
      <Card className="overflow-hidden">
        {isLoading ? <p className="text-center py-8 text-sm text-muted-foreground">Loading...</p> : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>{["Code","Department Name","Description","Status","Actions"].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(Array.isArray(depts) ? depts : []).map((d: any) => (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-mono font-medium text-primary">{d.code}</td>
                  <td className="px-3 py-2.5 font-medium">{d.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{d.description || "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("px-2 py-0.5 rounded text-xs", d.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                      {d.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(d)} className="p-1.5 hover:bg-muted rounded"><Edit2 className="w-3 h-3" /></button>
                      <button onClick={() => { if(confirm(`Delete "${d.name}"?`)) deleteD.mutate(d.id); }} className="p-1.5 hover:bg-red-100 text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!(Array.isArray(depts) ? depts : []).length && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No departments found.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ── Designations Tab ───────────────────────────────────────────────────────────
function DesignationsTab() {
  const qc = useQueryClient();
  const { data: desigs, isLoading } = useGet(["designations"], "/designations");
  const { data: depts } = useGet(["departments"], "/departments");
  const createDes = useMut("POST", "/designations", ["designations"]);
  const updateDes = useMutation({
    mutationFn: ({ id, data }: any) => fetch(apiUrl(`/designations/${id}`), {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["designations"] }),
  });
  const deleteDes = useMutation({
    mutationFn: (id: number) => fetch(apiUrl(`/designations/${id}`), { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["designations"] }),
  });
  const [form, setForm] = useState({ name:"", code:"", departmentId:"", level:1, description:"" });
  const [editId, setEditId] = useState<number|null>(null);
  const [showForm, setShowForm] = useState(false);

  const LEVEL_LABEL = ["","Staff","Officer","Supervisor","Manager","Head"];

  function openEdit(d: any) { setForm({ name: d.name, code: d.code, departmentId: d.departmentId || "", level: d.level || 1, description: d.description || "" }); setEditId(d.id); setShowForm(true); }
  function openNew() { setForm({ name:"", code:"", departmentId:"", level:1, description:"" }); setEditId(null); setShowForm(true); }
  function handleSave() {
    const payload = { ...form, departmentId: form.departmentId ? Number(form.departmentId) : null };
    if (editId) updateDes.mutate({ id: editId, data: payload }, { onSuccess: () => setShowForm(false) });
    else createDes.mutate(payload, { onSuccess: () => setShowForm(false) });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={openNew} className="text-xs flex items-center gap-1.5 h-8 px-3"><Plus className="w-3.5 h-3.5" />Add Designation</Button>
      </div>
      {showForm && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <p className="text-xs font-semibold mb-3">{editId ? "Edit Designation" : "New Designation"}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-xs">Designation Name</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></div>
            <div><Label className="text-xs">Code</Label><Input value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value.toUpperCase()}))} /></div>
            <div>
              <Label className="text-xs">Department</Label>
              <Select value={form.departmentId} onChange={e => setForm(f => ({...f, departmentId: e.target.value}))}>
                <option value="">— Any —</option>
                {(Array.isArray(depts) ? depts : []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
            <div>
              <Label className="text-xs">Level</Label>
              <Select value={form.level} onChange={e => setForm(f => ({...f, level: Number(e.target.value)}))}>
                {[1,2,3,4,5].map(l => <option key={l} value={l}>{l} – {LEVEL_LABEL[l]}</option>)}
              </Select>
            </div>
            <div className="col-span-2 md:col-span-4"><Label className="text-xs">Description</Label><Input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} /></div>
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <Button variant="outline" className="text-xs h-8" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="text-xs h-8" onClick={handleSave}>Save</Button>
          </div>
        </Card>
      )}
      <Card className="overflow-hidden">
        {isLoading ? <p className="text-center py-8 text-sm text-muted-foreground">Loading...</p> : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>{["Code","Designation","Department","Level","Status","Actions"].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(Array.isArray(desigs) ? desigs : []).map((d: any) => (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-mono text-primary font-medium">{d.code}</td>
                  <td className="px-3 py-2.5 font-medium">{d.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{d.departmentName || "—"}</td>
                  <td className="px-3 py-2.5"><span className="px-2 py-0.5 bg-muted rounded text-xs">{LEVEL_LABEL[d.level] || "Staff"}</span></td>
                  <td className="px-3 py-2.5">
                    <span className={cn("px-2 py-0.5 rounded text-xs", d.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                      {d.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(d)} className="p-1.5 hover:bg-muted rounded"><Edit2 className="w-3 h-3" /></button>
                      <button onClick={() => { if(confirm(`Delete "${d.name}"?`)) deleteDes.mutate(d.id); }} className="p-1.5 hover:bg-red-100 text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!(Array.isArray(desigs) ? desigs : []).length && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No designations found.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Employees() {
  const [activeTab, setActiveTab] = useState<Tab>("Employee List");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterRegionalId, setFilterRegionalId] = useState("");
  const [filterBranchId, setFilterBranchId] = useState("");
  const [drawerEmp, setDrawerEmp] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: branchRes } = useListBranches();
  const branches: any[] = branchRes || [];

  const regionalBranches = branches.filter((b: any) => b.type === "regional");
  const subBranchesOfSelected = branches.filter(
    (b: any) => b.type === "sub_branch" && String(b.parentId) === filterRegionalId
  );

  const params: any = { limit: 500 };
  if (filterStatus) params.status = filterStatus;
  if (filterDept) params.department = filterDept;
  if (filterType) params.employeeType = filterType;

  const { data, isLoading, refetch } = useListEmployees(params);
  const deleteEmp = useDeleteEmployee();

  const allEmployees = data?.employees || [];

  // Collect all branch IDs that belong to the selected regional (regional itself + its sub-branches)
  const regionalBranchIds = useMemo(() => {
    if (!filterRegionalId) return null;
    const id = Number(filterRegionalId);
    const subIds = branches
      .filter((b: any) => b.type === "sub_branch" && b.parentId === id)
      .map((b: any) => b.id);
    return new Set([id, ...subIds]);
  }, [filterRegionalId, branches]);

  const employees = useMemo(() => {
    let list = allEmployees;
    if (filterBranchId) {
      list = list.filter((e: any) => e.branchId === Number(filterBranchId));
    } else if (regionalBranchIds) {
      list = list.filter((e: any) => regionalBranchIds.has(e.branchId));
    }
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter((e: any) =>
      empDisplayName(e).toLowerCase().includes(s) ||
      e.employeeId.toLowerCase().includes(s) ||
      (e.aadharNumber || "").replace(/\s/g,"").includes(s.replace(/\s/g,"")) ||
      (e.panNumber || "").toLowerCase().includes(s) ||
      (e.email || "").toLowerCase().includes(s)
    );
  }, [allEmployees, search, filterBranchId, regionalBranchIds]);

  function exportCSV() {
    const headers = ["Employee ID","First Name","Last Name","Gender","Designation","Department","Branch","Type","Status","Phone","Email","Aadhar","PAN","Joining Date"];
    const rows = employees.map((e: any) => [
      e.employeeId, e.firstName || "", e.lastName || e.fullName || "",
      e.gender, e.designation, e.department,
      e.branchName, e.employeeType, e.status, e.phone, e.email,
      e.aadharNumber || "", e.panNumber || "", e.joiningDate
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "employees.csv"; a.click();
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Employee Management" description="Manage staff profiles, departments, and designations." />

      {/* Mini Dashboard */}
      <EmployeeMiniDashboard
        allEmployees={allEmployees}
        onFilter={status => { setFilterStatus(status); setActiveTab("Employee List"); }}
      />

      {/* Tab Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-xl border border-border">
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200",
                activeTab === t
                  ? "bg-background text-primary shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}>
              {t === "Employee List" && <Users className="w-3.5 h-3.5" />}
              {t === "Departments" && <Building2 className="w-3.5 h-3.5" />}
              {t === "Designations" && <Layers className="w-3.5 h-3.5" />}
              {t}
              {t === "Employee List" && (
                <span className={cn(
                  "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums",
                  activeTab === t ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>{allEmployees.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {activeTab === "Employee List" && (
            <>
              <Button variant="outline" onClick={exportCSV} className="text-xs h-8 px-3 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
              <Button onClick={() => { setDrawerEmp(null); setDrawerOpen(true); }} className="text-xs h-8 px-3 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Employee
              </Button>
            </>
          )}
        </div>
      </div>

      {activeTab === "Employee List" && (
        <>
          <Card className="p-3 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search name, ID, Aadhar, PAN, email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select
              value={filterRegionalId}
              onChange={e => { setFilterRegionalId(e.target.value); setFilterBranchId(""); }}
              className="h-8 text-xs w-48"
            >
              <option value="">All Regional Offices</option>
              {regionalBranches.map((b: any) => (
                <option key={b.id} value={b.id}>[{b.code}] {b.name}</option>
              ))}
            </Select>
            {filterRegionalId && (
              <Select
                value={filterBranchId}
                onChange={e => setFilterBranchId(e.target.value)}
                className="h-8 text-xs w-44"
              >
                <option value="">All Sub-branches</option>
                <option value={filterRegionalId}>— Regional Office itself —</option>
                {subBranchesOfSelected.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            )}
            <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-8 text-xs w-32">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="resigned">Resigned</option>
              <option value="terminated">Terminated</option>
            </Select>
            <Select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="h-8 text-xs w-40">
              <option value="">All Departments</option>
              {DEPT_LIST.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-8 text-xs w-28">
              <option value="">All Types</option>
              <option value="permanent">Permanent</option>
              <option value="contract">Contract</option>
              <option value="casual">Casual</option>
            </Select>
            {(search || filterStatus || filterDept || filterType || filterRegionalId || filterBranchId) && (
              <button
                onClick={() => { setSearch(""); setFilterStatus(""); setFilterDept(""); setFilterType(""); setFilterRegionalId(""); setFilterBranchId(""); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{employees.length} employee{employees.length !== 1 ? "s" : ""}</span>
          </Card>

          <Card className="overflow-hidden">
            {isLoading ? (
              <p className="text-center py-10 text-sm text-muted-foreground">Loading employees...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      {["Emp ID","Name","Designation / Dept","Branch","Type","Aadhar / PAN","Status","Actions"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {employees.map((emp: any) => (
                      <tr key={emp.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-3 py-2.5 font-mono text-xs text-primary font-medium">{emp.employeeId}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-muted/60 border border-border overflow-hidden shrink-0 flex items-center justify-center">
                              {emp.photoUrl
                                ? <img src={emp.photoUrl} alt={empDisplayName(emp)} className="w-full h-full object-cover" />
                                : <span className="text-[10px] font-bold text-muted-foreground">
                                    {(emp.firstName?.[0] || emp.fullName?.[0] || "E").toUpperCase()}
                                  </span>
                              }
                            </div>
                            <div>
                              <div className="font-medium">{empDisplayName(emp)}</div>
                              <div className="text-muted-foreground flex items-center gap-1"><Mail className="w-2.5 h-2.5" /> {emp.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{emp.designation}</div>
                          <div className="text-muted-foreground">{emp.department}</div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          <div className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate max-w-[120px]">{emp.branchName}</span></div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", EMP_TYPE_STYLE[emp.employeeType] || EMP_TYPE_STYLE.permanent)}>
                            {emp.employeeType?.[0]?.toUpperCase() + emp.employeeType?.slice(1) || "Permanent"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground text-xs">
                          <div>{emp.aadharNumber || "—"}</div>
                          {emp.panNumber && <div className="text-primary">{emp.panNumber}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn("px-2 py-0.5 rounded text-xs font-medium", STATUS_STYLE[emp.status] || STATUS_STYLE.active)}>
                            {emp.status === "on_leave" ? "On Leave" : emp.status?.[0]?.toUpperCase() + emp.status?.slice(1) || "Active"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setDrawerEmp(emp); setDrawerOpen(true); }} className="p-1.5 hover:bg-muted rounded text-muted-foreground" title="Edit">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { if(confirm(`Delete "${empDisplayName(emp)}"?`)) deleteEmp.mutate({ id: emp.id }, { onSuccess: () => refetch() }); }}
                              className="p-1.5 hover:bg-red-100 text-red-500 rounded" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!employees.length && (
                      <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No employees found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {activeTab === "Departments" && <DepartmentsTab />}
      {activeTab === "Designations" && <DesignationsTab />}

      {drawerOpen && (
        <EmployeeDrawer
          emp={drawerEmp}
          branches={branches}
          onClose={() => setDrawerOpen(false)}
          onSaved={() => { setDrawerOpen(false); refetch(); }}
        />
      )}
    </div>
  );
}
