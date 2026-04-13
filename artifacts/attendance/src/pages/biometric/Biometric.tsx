import { useState } from "react";
import { useListBiometricDevices, useUpdateBiometricDevice, useDeleteBiometricDevice, useListBranches, useListBiometricLogs } from "@workspace/api-client-react";
import { PageHeader, Card, Button, Select, Label } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Edit2, Trash2, Wifi, WifiOff, AlertCircle, RefreshCw, Info, Copy, Radio } from "lucide-react";

const DEVICE_STATUS: Record<string, { cls: string; icon: React.ElementType }> = {
  online: { cls: "bg-green-100 text-green-700", icon: Wifi },
  offline: { cls: "bg-gray-100 text-gray-600", icon: WifiOff },
  error: { cls: "bg-red-100 text-red-700", icon: AlertCircle },
};

type Tab = "devices" | "logs" | "setup";

export default function Biometric() {
  const [tab, setTab] = useState<Tab>("devices");

  return (
    <div className="space-y-4">
      <PageHeader title="Biometric Devices" description="Manage ZKTeco biometric devices and ZK Push ADMS configuration." />

      <div className="flex gap-1 border-b border-border">
        {([
          { id: "devices", label: "Devices" },
          { id: "logs", label: "Push Logs" },
          { id: "setup", label: "ZK Push Setup Guide" },
        ] as const).map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {label}
          </button>
        ))}
      </div>

      {tab === "devices" && <DevicesTab />}
      {tab === "logs" && <LogsTab />}
      {tab === "setup" && <SetupGuide />}
    </div>
  );
}

interface BranchForm { branchId: number; name: string; }

function DevicesTab() {
  const { data: devices, isLoading, refetch } = useListBiometricDevices();
  const { data: branches } = useListBranches();
  const update = useUpdateBiometricDevice();
  const remove = useDeleteBiometricDevice();

  const [editId, setEditId] = useState<number | null>(null);
  const [branchForm, setBranchForm] = useState<BranchForm>({ branchId: 0, name: "" });

  function openEdit(d: any) {
    setBranchForm({ branchId: d.branchId || 0, name: d.name });
    setEditId(d.id);
  }
  function handleSave() {
    if (!editId) return;
    update.mutate(
      { id: editId, data: { branchId: branchForm.branchId || null, name: branchForm.name } },
      { onSuccess: () => setEditId(null) }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 px-3 py-2 rounded-lg text-xs text-green-700">
        <Radio className="w-3.5 h-3.5 text-green-600 shrink-0 animate-pulse" />
        <span>
          ADMS server listening on port <strong>3333</strong> — devices appear automatically when your ZKTeco machine connects to this port.
        </span>
        <button onClick={() => refetch()} className="ml-auto p-1 hover:bg-green-100 rounded" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {editId && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <h3 className="font-semibold text-sm mb-3">Assign Branch — {branchForm.name}</h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">Branch</Label>
              <Select value={branchForm.branchId || ""} onChange={e => setBranchForm(f => ({ ...f, branchId: Number(e.target.value) }))}>
                <option value="">Select Branch</option>
                {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
            <Button onClick={handleSave} disabled={update.isPending} className="text-xs">
              {update.isPending ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={() => setEditId(null)} className="text-xs">Cancel</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading devices...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Device Name","Model","Serial No.","Branch","IP Address","Last Sync","Status","Actions"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(devices || []).map((d: any) => {
                  const st = DEVICE_STATUS[d.status] || DEVICE_STATUS.offline;
                  const StatusIcon = st.icon;
                  return (
                    <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium">{d.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.model}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{d.serialNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {d.branchName
                          ? <span className="text-muted-foreground">{d.branchName}</span>
                          : <button onClick={() => openEdit(d)} className="text-amber-600 font-medium text-xs bg-amber-50 px-2 py-0.5 rounded border border-amber-200 hover:bg-amber-100 transition-colors">
                              ⚠ Assign Branch
                            </button>
                        }
                      </td>
                      <td className="px-3 py-2 font-mono">{d.ipAddress || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.lastSync ? new Date(d.lastSync).toLocaleString() : "Never"}</td>
                      <td className="px-3 py-2">
                        <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium w-fit", st.cls)}>
                          <StatusIcon className="w-3 h-3" />
                          {d.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(d)} className="p-1.5 hover:bg-muted rounded text-muted-foreground" title="Assign Branch">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if(confirm("Remove this device?")) remove.mutate({ id: d.id }); }}
                            className="p-1.5 hover:bg-red-100 text-red-500 rounded" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!devices?.length && (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Radio className="w-8 h-8 text-muted-foreground/40" />
                      <p>No devices connected yet.</p>
                      <p className="text-xs">Configure your ZKTeco machine to push to port <strong>3333</strong> — it will appear here automatically.</p>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function LogsTab() {
  const { data, isLoading } = useListBiometricLogs({});
  return (
    <Card className="overflow-hidden">
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading logs...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Device","Biometric ID","Employee","Punch Time","Punch Type","Processed"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data?.logs || []).map(l => (
                <tr key={l.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{l.deviceName}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{l.biometricId}</td>
                  <td className="px-3 py-2">{l.employeeName}</td>
                  <td className="px-3 py-2 font-mono">{new Date(l.punchTime).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className={cn("px-2 py-0.5 rounded text-xs font-medium",
                      l.punchType === "in" ? "bg-green-100 text-green-700" :
                      l.punchType === "out" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                    )}>{l.punchType.toUpperCase()}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={l.processed ? "text-green-600" : "text-amber-600"}>
                      {l.processed ? "✓ Processed" : "Pending"}
                    </span>
                  </td>
                </tr>
              ))}
              {!data?.logs?.length && (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No biometric push logs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-xs font-mono border border-border truncate">{value}</code>
        <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="p-2 hover:bg-muted rounded-lg border border-border transition-colors">
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        {copied && <span className="text-xs text-green-600">Copied!</span>}
      </div>
    </div>
  );
}

function SetupGuide() {
  const admsPort = "3333";
  const serverIp = window.location.hostname;
  const apiOrigin = `${window.location.protocol}//${serverIp}:${admsPort}`;

  return (
    <div className="space-y-4 max-w-4xl">
      <Card className="p-5 border-blue-200 bg-blue-50/20">
        <div className="flex items-center gap-3 mb-4">
          <Info className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-sm text-blue-900">ZKTeco ADMS (ZK Push) Configuration</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          ZK Push (Attendance Data Management System) allows ZKTeco biometric devices to automatically push attendance data to this server over HTTP/HTTPS. Once configured, devices will appear automatically in the Devices tab and attendance logs will be recorded in Push Logs.
        </p>

        <div className="space-y-5">
          <div>
            <h4 className="font-semibold text-sm mb-2">Step 1: Server URLs to configure in device</h4>
            <div className="space-y-2">
              <CopyField label="ADMS Server Address / Domain" value={serverIp} />
              <CopyField label="ADMS Port (ZK Push)" value={admsPort} />
              <CopyField label="ADMS Endpoint (full URL)" value={`${apiOrigin}/iclock/cdata`} />
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Step 2: Configure the ZKTeco Device</h4>
            <div className="space-y-2">
              {[
                ["1. Access Device Menu", "Press Menu on the device → Go to Comm. Settings → Cloud Server Settings (ADMS)"],
                ["2. Enable ADMS", "Set ADMS Enable = Yes / On"],
                ["3. Server Address", `Enter the server IP or domain: ${serverIp}`],
                ["4. Server Port", `Set port to ${admsPort} (ZK Push / ADMS port)`],
                ["5. ADMS Upload Interval", "Set to 1–5 minutes (recommended)"],
                ["6. Enable Push", "Enable Attendance Push, enable Real-time Upload if available"],
                ["7. Save & Restart", "Save settings and restart the device — it will appear in the Devices tab automatically"],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-3 p-3 bg-card rounded-lg border border-border">
                  <div className="text-xs">
                    <div className="font-semibold text-foreground">{title}</div>
                    <div className="text-muted-foreground mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-2">Step 3: Verify Connection</h4>
            <p className="text-xs text-muted-foreground">After configuration, go to Devices tab and click the test icon (↻) next to the device. You should see "online" status and recent logs appear in the Push Logs tab within a few minutes.</p>
          </div>

          <div className="border border-amber-200 bg-amber-50/30 rounded-lg p-4">
            <h4 className="font-semibold text-sm text-amber-800 mb-2">⚠ Important Notes</h4>
            <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
              <li>Ensure this server is accessible from the device's network (check firewall rules)</li>
              <li>Each employee must have a matching Biometric ID registered in the system (Employee → Biometric ID field)</li>
              <li>ZK Push supports ZKTeco models: F18, F19, F21, K40, MA300, UA300, FR1200, and compatible devices</li>
              <li>For HTTPS/SSL, ensure your certificate is valid — self-signed certs may not work with all devices</li>
              <li>ADMS polling interval: device will push every N minutes (default: 5 minutes)</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-2">Supported Device Models</h4>
            <div className="flex flex-wrap gap-2">
              {["ZKTeco F18","ZKTeco F19","ZKTeco F21","ZKTeco K40","ZKTeco MA300","ZKTeco UA300","ZKTeco FR1200","ZKTeco G4","ZKTeco iClock880","ZKTeco MB360"].map(m => (
                <span key={m} className="bg-muted px-2 py-1 rounded text-xs font-mono">{m}</span>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
