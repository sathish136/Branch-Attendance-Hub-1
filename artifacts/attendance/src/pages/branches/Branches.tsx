import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Card, Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Plus, Edit2, Trash2, X, Network, MapPin, User, Building2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

const TYPE_STYLE: Record<string, string> = {
  head_office: "bg-blue-100 text-blue-700 border border-blue-200",
  regional:    "bg-purple-100 text-purple-700 border border-purple-200",
  sub_branch:  "bg-gray-100 text-gray-600 border border-gray-200",
};
const TYPE_LABEL: Record<string, string> = {
  head_office: "Head Office",
  regional:    "Regional",
  sub_branch:  "Sub Branch",
};

const EMPTY_BRANCH = {
  name: "", code: "", type: "sub_branch", parentId: "", address: "", phone: "", managerName: "", isActive: true,
};

export default function Branches() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: () => fetch(apiUrl("/branches")).then(r => r.json()),
  });
  const branches = data || [];

  const createB = useMutation({
    mutationFn: (body: any) => fetch(apiUrl("/branches"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });
  const updateB = useMutation({
    mutationFn: ({ id, data }: any) => fetch(apiUrl(`/branches/${id}`), {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });
  const deleteB = useMutation({
    mutationFn: (id: number) => fetch(apiUrl(`/branches/${id}`), { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_BRANCH });

  function openAdd() { setForm({ ...EMPTY_BRANCH }); setEditBranch(null); setDrawerOpen(true); }
  function openEdit(b: any) {
    setForm({
      name: b.name, code: b.code, type: b.type,
      parentId: b.parentId ? String(b.parentId) : "",
      address: b.address || "", phone: b.phone || "",
      managerName: b.managerName || "", isActive: b.isActive,
    });
    setEditBranch(b); setDrawerOpen(true);
  }
  function handleSave() {
    const payload = { ...form, parentId: form.parentId ? Number(form.parentId) : null };
    if (editBranch?.id) {
      updateB.mutate({ id: editBranch.id, data: payload }, { onSuccess: () => setDrawerOpen(false) });
    } else {
      createB.mutate(payload, { onSuccess: () => setDrawerOpen(false) });
    }
  }
  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  const isPending = createB.isPending || updateB.isPending;
  const headOffices = branches.filter((b: any) => b.type === "head_office");
  const regionals   = branches.filter((b: any) => b.type === "regional");
  const subBranches = branches.filter((b: any) => b.type === "sub_branch");
  const parentOptions = branches.filter((b: any) => b.id !== editBranch?.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Branch Management"
        description="Manage head offices, regional offices, and sub-branches."
        action={
          <Button onClick={openAdd} className="gap-2 text-xs h-9">
            <Plus className="w-4 h-4" /> Add Branch
          </Button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Head Offices",     val: headOffices.length, color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
          { label: "Regional Offices", val: regionals.length,   color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
          { label: "Sub Branches",     val: subBranches.length, color: "text-gray-700",   bg: "bg-gray-50",   border: "border-gray-200" },
        ].map(s => (
          <div key={s.label} className={cn("rounded-xl border p-4", s.bg, s.border)}>
            <p className={cn("text-3xl font-bold", s.color)}>{s.val}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <p className="text-center py-10 text-sm text-muted-foreground">Loading branches...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Code","Branch Name","Type","Parent","Manager","Phone","Staff","Status","Actions"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {branches.map((b: any) => (
                  <tr key={b.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-3 py-2.5 font-mono font-medium text-primary">{b.code}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />{b.name}
                      </div>
                      {b.address && <div className="text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{b.address}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-medium", TYPE_STYLE[b.type] || TYPE_STYLE.sub_branch)}>
                        {TYPE_LABEL[b.type] || b.type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{b.parentName || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {b.managerName ? <span className="flex items-center gap-1"><User className="w-3 h-3 shrink-0" />{b.managerName}</span> : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{b.phone || "—"}</td>
                    <td className="px-3 py-2.5 font-medium text-center">{b.employeeCount ?? 0}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-medium", b.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600")}>
                        {b.isActive ? "Active" : "Closed"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(b)} className="p-1.5 hover:bg-muted rounded text-muted-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if(confirm(`Delete "${b.name}"?`)) deleteB.mutate(b.id); }} className="p-1.5 hover:bg-red-100 text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!branches.length && (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No branches yet. Click "Add Branch" to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-lg bg-background border-l border-border shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Network className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-base">{editBranch ? "Edit Branch" : "Add New Branch"}</h2>
                  {editBranch && <p className="text-xs text-muted-foreground">{editBranch.code} · {editBranch.name}</p>}
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs">Branch Name *</Label>
                  <Input placeholder="e.g. Colombo Head Post Office" value={form.name} onChange={e => set("name", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Branch Code *</Label>
                  <Input placeholder="HO-01" value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} />
                </div>
                <div>
                  <Label className="text-xs">Branch Type *</Label>
                  <Select value={form.type} onChange={e => set("type", e.target.value)}>
                    <option value="head_office">Head Office</option>
                    <option value="regional">Regional Office</option>
                    <option value="sub_branch">Sub Branch</option>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Parent Branch</Label>
                  <Select value={form.parentId} onChange={e => set("parentId", e.target.value)}>
                    <option value="">— None (Top Level) —</option>
                    {parentOptions.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Address</Label>
                  <Input placeholder="Street, City, District" value={form.address} onChange={e => set("address", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input placeholder="0XX-XXXXXXX" value={form.phone} onChange={e => set("phone", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Manager Name</Label>
                  <Input placeholder="e.g. John Silva" value={form.managerName} onChange={e => set("managerName", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.isActive ? "active" : "inactive"} onChange={e => set("isActive", e.target.value === "active")}>
                    <option value="active">Active</option>
                    <option value="inactive">Closed / Inactive</option>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t border-border px-5 py-4 flex justify-end gap-3 bg-muted/20">
              <Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isPending || !form.name || !form.code}>
                {isPending ? "Saving..." : editBranch ? "Update Branch" : "Add Branch"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
