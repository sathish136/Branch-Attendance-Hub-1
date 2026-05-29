import { useState } from "react";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useListBranches } from "@workspace/api-client-react";
import { PageHeader, Card, Button, Input, Select, Label, useConfirm } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Plus, Edit2, Trash2, ShieldCheck, Building2, KeyRound, RotateCcw, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/authFetch";

const ROLE_LABELS: Record<string, { label: string; cls: string }> = {
  super_admin:    { label: "Super Admin",    cls: "bg-red-100 text-red-700"    },
  regional_admin: { label: "Regional Admin", cls: "bg-blue-100 text-blue-700"  },
  branch_admin:   { label: "Branch Admin",   cls: "bg-green-100 text-green-700"},
  viewer:         { label: "Viewer",         cls: "bg-gray-100 text-gray-600"  },
};

const ROLE_DEFAULT_PASSWORDS: Record<string, string> = {
  super_admin:    "Colombo@555",
  regional_admin: "Regpo@123",
  branch_admin:   "Subpo@123",
  viewer:         "Subpo@123",
};

const HIDDEN_USERS = ["liveu"];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

interface UserForm {
  username: string; fullName: string; email: string; password: string;
  role: "super_admin" | "regional_admin" | "branch_admin" | "viewer";
  branchIds: number[]; isActive: boolean;
}

function getDefaultPassword(role: string): string {
  return ROLE_DEFAULT_PASSWORDS[role] ?? "Subpo@123";
}

const EMPTY_FORM: UserForm = {
  username: "", fullName: "", email: "", password: getDefaultPassword("branch_admin"),
  role: "branch_admin", branchIds: [], isActive: true,
};

export default function Users() {
  const currentUser: any = (() => { try { return JSON.parse(localStorage.getItem("auth_user") || "{}"); } catch { return {}; } })();
  const currentRole: string = currentUser?.role || "viewer";
  const currentBranchIds: number[] = currentUser?.branchIds || [];
  const isSuper = currentRole === "super_admin";

  const { data: users, isLoading, refetch } = useListUsers();
  const { data: branches } = useListBranches();
  const create = useCreateUser();
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [showPwd, setShowPwd] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);

  const branchList: any[] = branches || [];

  const allowedBranches = isSuper
    ? branchList
    : branchList.filter(b => currentBranchIds.includes(b.id));

  const regionalBranches = allowedBranches.filter(b => b.type === "regional" || b.type === "head_office");
  const subBranches = allowedBranches.filter(b => b.type === "sub_branch");

  const allowedRoles = isSuper
    ? [
        { value: "super_admin",    label: "Super Admin (All access)" },
        { value: "regional_admin", label: "Regional Admin" },
        { value: "branch_admin",   label: "Branch Admin" },
        { value: "viewer",         label: "Viewer (Read-only)" },
      ]
    : [
        { value: "branch_admin", label: "Branch Admin" },
        { value: "viewer",       label: "Viewer (Read-only)" },
      ];

  function openCreate() {
    const defaultRole = "branch_admin";
    setForm({ ...EMPTY_FORM, role: defaultRole, password: getDefaultPassword(defaultRole) });
    setEditId(null); setShowForm(true); setShowPwd(false);
  }
  function openEdit(u: any) {
    setForm({ username: u.username, fullName: u.fullName, email: u.email, password: "", role: u.role, branchIds: u.branchIds, isActive: u.isActive });
    setEditId(u.id); setShowForm(true); setShowPwd(false);
  }

  function handleRoleChange(role: any) {
    // Auto-update password when role changes (only for new users)
    if (!editId) {
      setForm(f => ({ ...f, role, password: getDefaultPassword(role) }));
    } else {
      setForm(f => ({ ...f, role }));
    }
  }

  function handleSave() {
    if (editId) {
      const payload: any = { fullName: form.fullName, email: form.email, role: form.role, branchIds: form.branchIds, isActive: form.isActive };
      if (form.password) payload.password = form.password;
      update.mutate({ id: editId, data: payload }, {
        onSuccess: () => { setShowForm(false); refetch(); toast.success("User updated successfully."); },
        onError: () => toast.error("Failed to update user."),
      });
    } else {
      create.mutate({ data: { ...form } }, {
        onSuccess: () => { setShowForm(false); refetch(); toast.success("User created. They must change their password on first login."); },
        onError: () => toast.error("Failed to create user."),
      });
    }
  }

  async function handleResetPassword(u: any) {
    if (!await doConfirm(
      `Reset password for "${u.username}" to the default for their role (${ROLE_DEFAULT_PASSWORDS[u.role] ?? "Subpo@123"})?\n\nThey will be required to change it on next login.`,
      { title: "Reset Password", confirmLabel: "Reset", danger: true }
    )) return;

    setResettingId(u.id);
    try {
      const res = await authFetch(apiUrl(`/users/${u.id}/reset-password`), { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success(`Password reset for "${u.username}". Default: ${ROLE_DEFAULT_PASSWORDS[u.role] ?? "Subpo@123"}`);
      refetch();
    } catch {
      toast.error("Failed to reset password.");
    } finally {
      setResettingId(null);
    }
  }

  function toggleRegional(reg: any) {
    const subs = subBranches.filter(b => b.parentId === reg.id).map(b => b.id);
    const allIds = [reg.id, ...subs];
    const isSelected = form.branchIds.includes(reg.id);
    if (isSelected) {
      setForm(f => ({ ...f, branchIds: f.branchIds.filter(id => !allIds.includes(id)) }));
    } else {
      setForm(f => ({ ...f, branchIds: [...new Set([...f.branchIds, ...allIds])] }));
    }
  }

  function toggleBranch(id: number) {
    setForm(f => ({ ...f, branchIds: f.branchIds.includes(id) ? f.branchIds.filter(b => b !== id) : [...f.branchIds, id] }));
  }

  const { confirm: doConfirm, dialog: confirmDialog } = useConfirm();
  const branchMap = new Map(branchList.map(b => [b.id, b.name]));

  const visibleUsers = (users || []).filter((u: any) =>
    !HIDDEN_USERS.includes(u.username)
  );

  const defaultPwdForRole = getDefaultPassword(form.role);

  return (
    <div className="space-y-4">
      {confirmDialog}
      <PageHeader title="User Management" description="Manage system users and their branch access permissions." />

      <div className="flex justify-end">
        <Button onClick={openCreate} className="flex items-center gap-2 text-xs">
          <Plus className="w-4 h-4" />Add User
        </Button>
      </div>

      {showForm && (
        <Card className="p-5 border-primary/30 bg-primary/5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            {editId ? "Edit User" : "Create New User"}
          </h3>
          {!editId && (
            <div className="mb-3 flex items-start gap-2 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2">
              <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Default password for <strong>{ROLE_LABELS[form.role]?.label}</strong> is{" "}
                <code className="font-mono bg-blue-100 px-1 rounded">{defaultPwdForRole}</code>.
                User must change it on first login.
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {!editId && (
              <div>
                <Label className="text-xs">Username</Label>
                <Input placeholder="username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
            )}
            <div>
              <Label className="text-xs">Full Name</Label>
              <Input placeholder="Full Name" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" placeholder="user@org.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">{editId ? "New Password (leave blank to keep)" : "Temporary Password"}</Label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  placeholder={editId ? "Leave blank to keep" : "Temporary password"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onChange={e => handleRoleChange(e.target.value as any)}>
                {allowedRoles.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-primary" id="userActive" />
              <label htmlFor="userActive" className="text-sm">Active</label>
            </div>
          </div>

          {form.role !== "super_admin" && (
            <div className="mt-4">
              <Label className="text-xs mb-2 block">
                Allocated Branches{" "}
                <span className="text-muted-foreground">(selecting a regional office also selects all its sub-branches)</span>
                {!isSuper && (
                  <span className="ml-1 text-amber-600"> · limited to your assigned branches</span>
                )}
              </Label>
              <div className="max-h-56 overflow-y-auto border border-border rounded-lg p-3 bg-card space-y-3">
                {regionalBranches.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2">No branches available.</p>
                )}
                {regionalBranches.map(reg => {
                  const subs = subBranches.filter(b => b.parentId === reg.id);
                  const allSubIds = subs.map(b => b.id);
                  const regSelected = form.branchIds.includes(reg.id);
                  const someSubsSelected = allSubIds.some(id => form.branchIds.includes(id));
                  const allSubsSelected = allSubIds.length > 0 && allSubIds.every(id => form.branchIds.includes(id));
                  return (
                    <div key={reg.id}>
                      <label className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors font-semibold",
                        regSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      )}>
                        <input
                          type="checkbox"
                          checked={regSelected}
                          ref={el => { if (el) el.indeterminate = !regSelected && someSubsSelected && !allSubsSelected; }}
                          onChange={() => toggleRegional(reg)}
                          className="accent-primary"
                        />
                        <span className="truncate">{reg.name}</span>
                        <span className={cn("ml-auto text-xs px-1 py-0.5 rounded shrink-0",
                          reg.type === "head_office" ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                        )}>
                          {reg.type === "head_office" ? "HO" : "RO"}
                        </span>
                        {subs.length > 0 && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {allSubIds.filter(id => form.branchIds.includes(id)).length + (regSelected ? 1 : 0)}/{subs.length + 1}
                          </span>
                        )}
                      </label>
                      {subs.map(sub => (
                        <label key={sub.id} className={cn(
                          "flex items-center gap-2 px-2 py-1 ml-4 rounded cursor-pointer text-xs transition-colors",
                          form.branchIds.includes(sub.id) ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
                        )}>
                          <input type="checkbox" checked={form.branchIds.includes(sub.id)} onChange={() => toggleBranch(sub.id)} className="accent-primary" />
                          <span className="truncate">↳ {sub.name}</span>
                          <span className="ml-auto text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded shrink-0">SB</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{form.branchIds.length} branch(es) selected</p>
            </div>
          )}

          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? "Saving..." : "Save User"}
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Username","Full Name","Email","Role","Allocated Branches","Status","Last Login","Actions"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleUsers.map((u: any) => {
                  const roleInfo = ROLE_LABELS[u.role] || ROLE_LABELS.viewer;
                  const isSelf = u.id === currentUser?.id;
                  const canEdit = isSuper
                    ? true
                    : (u.role !== "super_admin" && u.role !== "regional_admin");
                  const canDelete = canEdit && !isSelf && u.role !== "super_admin";
                  const canReset = isSuper && !isSelf;
                  return (
                    <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium">{u.username}</span>
                          {isSelf && (
                            <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-medium">You</span>
                          )}
                          {u.mustChangePassword && (
                            <span className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              <KeyRound className="w-2.5 h-2.5" /> Must Change
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{u.fullName}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", roleInfo.cls)}>{roleInfo.label}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {u.role === "super_admin" ? (
                          <span className="flex items-center gap-1 text-muted-foreground"><ShieldCheck className="w-3 h-3" /> All Branches</span>
                        ) : u.branchIds?.length ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {u.branchIds.slice(0,3).map((id: number) => (
                              <span key={id} className="flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded text-xs">
                                <Building2 className="w-2.5 h-2.5" />
                                {branchMap.get(id) || id}
                              </span>
                            ))}
                            {u.branchIds.length > 3 && <span className="text-muted-foreground">+{u.branchIds.length - 3} more</span>}
                          </div>
                        ) : <span className="text-muted-foreground">No branches</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium",
                          u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        )}>{u.isActive ? "Active" : "Inactive"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : "Never"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {canEdit ? (
                            <>
                              <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-muted rounded text-muted-foreground" title="Edit user">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {canReset && (
                                <button
                                  onClick={() => handleResetPassword(u)}
                                  disabled={resettingId === u.id}
                                  className="p-1.5 hover:bg-amber-100 text-amber-600 rounded disabled:opacity-50"
                                  title={`Reset password to ${ROLE_DEFAULT_PASSWORDS[u.role] ?? "default"}`}
                                >
                                  <RotateCcw className={cn("w-3.5 h-3.5", resettingId === u.id && "animate-spin")} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={async () => {
                                    if (await doConfirm(`Delete user "${u.username}"?`, { title: "Delete User" })) {
                                      remove.mutate({ id: u.id }, {
                                        onSuccess: () => { refetch(); toast.success(`User "${u.username}" deleted.`); },
                                        onError: () => toast.error("Failed to delete user."),
                                      });
                                    }
                                  }}
                                  className="p-1.5 hover:bg-red-100 text-red-500 rounded"
                                  title="Delete user"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground px-1.5 py-1">
                              {isSelf ? "Current user" : "Protected"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!visibleUsers.length && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
