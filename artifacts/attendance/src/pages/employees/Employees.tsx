import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee,
  useListBranches
} from "@workspace/api-client-react";
import { PageHeader, Card, Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  Search, Plus, Edit2, Trash2, Download, Mail,
  MapPin, ChevronDown, X, Building2, Users, Layers,
  FileText, Upload, CheckCircle2, AlertCircle, Eye, UserCircle
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
              <Eye className="w-3 h-3" /> View uploaded file
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
  const createEmp = useCreateEmployee();
  const updateEmp = useUpdateEmployee();

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  function handleSave() {
    const payload = {
      ...form,
      fullName: `${form.firstName} ${form.lastName}`.trim() || form.firstName || "Employee",
      branchId: Number(form.branchId),
      shiftId: form.shiftId ? Number(form.shiftId) : null,
      reportingManagerId: form.reportingManagerId ? Number(form.reportingManagerId) : null,
    };
    if (emp?.id) {
      updateEmp.mutate({ id: emp.id, data: payload }, { onSuccess: onSaved });
    } else {
      createEmp.mutate({ data: payload }, { onSuccess: onSaved });
    }
  }

  const isPending = createEmp.isPending || updateEmp.isPending;
  const isSaved = !!emp?.id;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-background border-l border-border shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <UserCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base">{emp ? "Edit Employee Profile" : "Add New Employee"}</h2>
              {emp && <p className="text-xs text-muted-foreground">{emp.employeeId} · {empDisplayName(emp)}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-border px-5 bg-card">
          {(["personal","professional","documents"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-2.5 text-xs font-medium capitalize border-b-2 -mb-px transition-colors whitespace-nowrap",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              {t === "personal" ? "👤 Personal" : t === "professional" ? "💼 Professional" : "📄 Documents"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {tab === "personal" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">First Name *</Label>
                  <Input placeholder="e.g. Rahul" value={form.firstName} onChange={e => set("firstName", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Last Name *</Label>
                  <Input placeholder="e.g. Sharma" value={form.lastName} onChange={e => set("lastName", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Gender</Label>
                  <Select value={form.gender} onChange={e => set("gender", e.target.value)}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Date of Birth</Label>
                  <Input type="date" value={form.dateOfBirth} onChange={e => set("dateOfBirth", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Phone *</Label>
                  <Input placeholder="9XXXXXXXXX" value={form.phone} onChange={e => set("phone", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" placeholder="name@indiapost.gov.in" value={form.email} onChange={e => set("email", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Address</Label>
                  <Input placeholder="House No., Street, City, State, PIN" value={form.address} onChange={e => set("address", e.target.value)} />
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Identity Documents</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Aadhar Number</Label>
                    <Input placeholder="XXXX XXXX XXXX" value={form.aadharNumber} onChange={e => set("aadharNumber", e.target.value)} maxLength={14} />
                  </div>
                  <div>
                    <Label className="text-xs">PAN Number</Label>
                    <Input placeholder="ABCDE1234F" value={form.panNumber} onChange={e => set("panNumber", e.target.value.toUpperCase())} maxLength={10} />
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "professional" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Employee ID *</Label>
                <Input placeholder="EMP-0001" value={form.employeeId} onChange={e => set("employeeId", e.target.value)} disabled={!!emp} />
              </div>
              <div>
                <Label className="text-xs">Employee Status</Label>
                <Select value={form.status} onChange={e => set("status", e.target.value)}>
                  <option value="active">Active</option>
                  <option value="on_leave">On Leave</option>
                  <option value="resigned">Resigned</option>
                  <option value="terminated">Terminated</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Department *</Label>
                <Select value={form.department} onChange={e => set("department", e.target.value)}>
                  <option value="">— Select Department —</option>
                  {DEPT_LIST.map(d => <option key={d} value={d}>{d}</option>)}
                </Select>
              </div>
              <div>
                <Label className="text-xs">Designation *</Label>
                <Select value={form.designation} onChange={e => set("designation", e.target.value)}>
                  <option value="">— Select Designation —</option>
                  {DESIGNATION_LIST.map(d => <option key={d} value={d}>{d}</option>)}
                </Select>
              </div>
              <div>
                <Label className="text-xs">Branch *</Label>
                <Select value={form.branchId} onChange={e => set("branchId", Number(e.target.value))}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </div>
              <div>
                <Label className="text-xs">Employee Type</Label>
                <Select value={form.employeeType} onChange={e => set("employeeType", e.target.value)}>
                  <option value="permanent">Permanent</option>
                  <option value="contract">Contract</option>
                  <option value="casual">Casual</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Joining Date *</Label>
                <Input type="date" value={form.joiningDate} onChange={e => set("joiningDate", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Biometric Device ID</Label>
                <Input placeholder="e.g. 101" value={form.biometricId} onChange={e => set("biometricId", e.target.value)} />
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
                  <DocUploadRow label="Aadhar Card" fieldName="aadharDoc"
                    currentUrl={emp?.aadharDocUrl} empId={emp?.id} onUploaded={onSaved} />
                  <DocUploadRow label="PAN Card" fieldName="panDoc"
                    currentUrl={emp?.panDocUrl} empId={emp?.id} onUploaded={onSaved} />
                  <DocUploadRow label="Certificates" fieldName="certificatesDoc"
                    currentUrl={emp?.certificatesDocUrl} empId={emp?.id} onUploaded={onSaved} />
                  <DocUploadRow label="Resume / CV" fieldName="resumeDoc"
                    currentUrl={emp?.resumeDocUrl} empId={emp?.id} onUploaded={onSaved} />

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

        {/* Footer */}
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
              {(depts || []).map((d: any) => (
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
              {!(depts || []).length && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No departments found.</td></tr>
              )}
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
                {(depts || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
              {(desigs || []).map((d: any) => (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-mono text-primary font-medium">{d.code}</td>
                  <td className="px-3 py-2.5 font-medium">{d.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{d.departmentName || "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 bg-muted rounded text-xs">{LEVEL_LABEL[d.level] || "Staff"}</span>
                  </td>
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
              {!(desigs || []).length && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No designations found.</td></tr>
              )}
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
  const [drawerEmp, setDrawerEmp] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: branchRes } = useListBranches();
  const branches = branchRes || [];

  const params: any = { limit: 200 };
  if (filterStatus) params.status = filterStatus;
  if (filterDept) params.department = filterDept;
  if (filterType) params.employeeType = filterType;

  const { data, isLoading, refetch } = useListEmployees(params);
  const deleteEmp = useDeleteEmployee();

  const employees = useMemo(() => {
    const list = data?.employees || [];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter((e: any) =>
      empDisplayName(e).toLowerCase().includes(s) ||
      e.employeeId.toLowerCase().includes(s) ||
      (e.aadharNumber || "").replace(/\s/g,"").includes(s.replace(/\s/g,"")) ||
      (e.panNumber || "").toLowerCase().includes(s) ||
      (e.email || "").toLowerCase().includes(s)
    );
  }, [data, search]);

  const stats = useMemo(() => {
    const all = data?.employees || [];
    return {
      total: all.length,
      active: all.filter((e: any) => e.status === "active").length,
      on_leave: all.filter((e: any) => e.status === "on_leave").length,
      resigned: all.filter((e: any) => e.status === "resigned").length,
      terminated: all.filter((e: any) => e.status === "terminated").length,
    };
  }, [data]);

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

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Total Employees", val: stats.total, cls: "text-foreground",   bg: "bg-card" },
          { label: "Active",          val: stats.active,     cls: "text-green-600",  bg: "bg-green-50" },
          { label: "On Leave",        val: stats.on_leave,   cls: "text-yellow-600", bg: "bg-yellow-50" },
          { label: "Resigned",        val: stats.resigned,   cls: "text-orange-600", bg: "bg-orange-50" },
          { label: "Terminated",      val: stats.terminated, cls: "text-red-600",    bg: "bg-red-50" },
        ].map(s => (
          <button key={s.label}
            onClick={() => { setFilterStatus(s.label === "Total Employees" ? "" : s.label.toLowerCase().replace(" ","_")); setActiveTab("Employee List"); }}
            className={cn("rounded-xl border border-border p-3 text-center hover:shadow-md transition-shadow cursor-pointer", s.bg)}>
            <p className={cn("text-2xl font-bold", s.cls)}>{s.val}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={cn("px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
              activeTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {t === "Employee List" && <Users className="w-3.5 h-3.5" />}
            {t === "Departments" && <Building2 className="w-3.5 h-3.5" />}
            {t === "Designations" && <Layers className="w-3.5 h-3.5" />}
            {t}
          </button>
        ))}
        <div className="ml-auto flex gap-2 mb-2">
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
          {/* Filter Bar */}
          <Card className="p-3 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search name, ID, Aadhar, PAN, email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-8 text-xs w-36">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="resigned">Resigned</option>
              <option value="terminated">Terminated</option>
            </Select>
            <Select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="h-8 text-xs w-44">
              <option value="">All Departments</option>
              {DEPT_LIST.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-8 text-xs w-32">
              <option value="">All Types</option>
              <option value="permanent">Permanent</option>
              <option value="contract">Contract</option>
              <option value="casual">Casual</option>
            </Select>
            {(search || filterStatus || filterDept || filterType) && (
              <button onClick={() => { setSearch(""); setFilterStatus(""); setFilterDept(""); setFilterType(""); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{employees.length} employee{employees.length !== 1 ? "s" : ""}</span>
          </Card>

          {/* Table */}
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
                          <div className="font-medium">{empDisplayName(emp)}</div>
                          <div className="text-muted-foreground flex items-center gap-1">
                            <Mail className="w-2.5 h-2.5" /> {emp.email}
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
                            <button onClick={() => { setDrawerEmp(emp); setDrawerOpen(true); }}
                              className="p-1.5 hover:bg-muted rounded text-muted-foreground" title="Edit Profile">
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

      {/* Drawer */}
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
