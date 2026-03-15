import { useState } from "react";
import { useListHolidays, useCreateHoliday, useDeleteHoliday } from "@workspace/api-client-react";
import { PageHeader, Card, Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Calendar, Plus, Trash2, Copy, Check, Building, Clock, Fingerprint, Users, ShieldCheck, FileText, Briefcase } from "lucide-react";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TYPE_STYLE: Record<string, string> = {
  national: "bg-blue-100 text-blue-700 border border-blue-200",
  religious: "bg-purple-100 text-purple-700 border border-purple-200",
  special: "bg-amber-100 text-amber-700 border border-amber-200",
};

const POYA_ICON = "🌕";

function isPoya(name: string) {
  return name.toLowerCase().includes("poya");
}

export default function Settings() {
  const year = 2026;
  const { data: holidays, isLoading, refetch } = useListHolidays({ year });
  const addHoliday = useCreateHoliday();
  const removeHoliday = useDeleteHoliday();

  const [copied, setCopied] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: "", date: "", type: "national", description: "" });
  const [showAdd, setShowAdd] = useState(false);

  const [hrSaved, setHrSaved] = useState(false);
  const [hrSettings, setHrSettings] = useState({
    annualLeave: "21",
    sickLeave: "12",
    casualLeave: "7",
    maternityLeave: "180",
    paternityLeave: "15",
    probationPeriod: "6",
    noticePeriod: "30",
    retirementAge: "60",
    epfEmployee: "12",
    epfEmployer: "3.67",
    esiEmployee: "0.75",
    esiEmployer: "3.25",
    workingHoursPerDay: "8",
    workingDaysPerMonth: "26",
    salaryDay: "1",
    payrollCutoff: "25",
  });
  function setHr(k: string, v: string) { setHrSettings(s => ({ ...s, [k]: v })); }
  function saveHrSettings() { setHrSaved(true); setTimeout(() => setHrSaved(false), 2500); }

  const serverUrl = `${window.location.origin}/api/biometric/push`;

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleAddHoliday() {
    addHoliday.mutate(
      { data: newHoliday },
      { onSuccess: () => { setNewHoliday({ name: "", date: "", type: "national", description: "" }); setShowAdd(false); refetch(); } }
    );
  }

  // Group holidays by month for calendar view
  const byMonth: Record<number, any[]> = {};
  (holidays || []).forEach(h => {
    const m = new Date(h.date).getMonth();
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(h);
  });

  const poyas = (holidays || []).filter(h => isPoya(h.name));
  const national = (holidays || []).filter(h => h.type === "national");
  const religious = (holidays || []).filter(h => h.type === "religious" && !isPoya(h.name));

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <PageHeader title="System Settings" description="Organisation settings, HR policies, holidays, and biometric configuration." />

      {/* Organization Settings */}
      <Card className="p-5">
        <h3 className="font-bold text-sm flex items-center gap-2 border-b border-border pb-3 mb-4">
          <Building className="w-4 h-4 text-primary" />Organisation & Attendance Rules
        </h3>
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
            <Select defaultValue="IST">
              <option value="IST">Sri Lanka Standard Time (GMT+5:30)</option>
              <option value="UTC">UTC (GMT+0)</option>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Late Threshold (Minutes)</Label>
            <Input type="number" defaultValue="15" />
          </div>
          <div>
            <Label className="text-xs">Overtime Threshold (Hours)</Label>
            <Input type="number" defaultValue="8.5" />
          </div>
          <div>
            <Label className="text-xs">Work Week</Label>
            <Select defaultValue="mon-fri">
              <option value="mon-fri">Monday – Friday</option>
              <option value="mon-sat">Monday – Saturday</option>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Half-day Hours</Label>
            <Input type="number" defaultValue="4" />
          </div>
          <div>
            <Label className="text-xs">Financial Year Start</Label>
            <Select defaultValue="jan">
              <option value="jan">January</option>
              <option value="apr">April</option>
            </Select>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button className="text-xs">Save Organisation Settings</Button>
        </div>
      </Card>

      {/* HR Settings */}
      <Card className="p-5">
        <h3 className="font-bold text-sm flex items-center gap-2 border-b border-border pb-3 mb-4">
          <Users className="w-4 h-4 text-primary" />HR Policy Settings
        </h3>

        {/* Leave Policy */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leave Policy (Days per Year)</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Annual / Earned Leave</Label>
              <Input type="number" value={hrSettings.annualLeave} onChange={e => setHr("annualLeave", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Sick / Medical Leave</Label>
              <Input type="number" value={hrSettings.sickLeave} onChange={e => setHr("sickLeave", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Casual Leave</Label>
              <Input type="number" value={hrSettings.casualLeave} onChange={e => setHr("casualLeave", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Maternity Leave (Days)</Label>
              <Input type="number" value={hrSettings.maternityLeave} onChange={e => setHr("maternityLeave", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Paternity Leave (Days)</Label>
              <Input type="number" value={hrSettings.paternityLeave} onChange={e => setHr("paternityLeave", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Employment Terms */}
        <div className="mb-5 border-t border-border pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employment Terms</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Probation Period (Months)</Label>
              <Input type="number" value={hrSettings.probationPeriod} onChange={e => setHr("probationPeriod", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Notice Period (Days)</Label>
              <Input type="number" value={hrSettings.noticePeriod} onChange={e => setHr("noticePeriod", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Retirement Age</Label>
              <Input type="number" value={hrSettings.retirementAge} onChange={e => setHr("retirementAge", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Working Hours / Day</Label>
              <Input type="number" value={hrSettings.workingHoursPerDay} onChange={e => setHr("workingHoursPerDay", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Payroll & Statutory */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payroll & Statutory Deductions (%)</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">EPF — Employee %</Label>
              <Input type="number" step="0.01" value={hrSettings.epfEmployee} onChange={e => setHr("epfEmployee", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">EPF — Employer %</Label>
              <Input type="number" step="0.01" value={hrSettings.epfEmployer} onChange={e => setHr("epfEmployer", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">ESI — Employee %</Label>
              <Input type="number" step="0.01" value={hrSettings.esiEmployee} onChange={e => setHr("esiEmployee", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">ESI — Employer %</Label>
              <Input type="number" step="0.01" value={hrSettings.esiEmployer} onChange={e => setHr("esiEmployer", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Working Days / Month</Label>
              <Input type="number" value={hrSettings.workingDaysPerMonth} onChange={e => setHr("workingDaysPerMonth", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Salary Credit Day</Label>
              <Select value={hrSettings.salaryDay} onChange={e => setHr("salaryDay", e.target.value)}>
                {[1,5,10,15,25,28,30].map(d => <option key={d} value={d}>Day {d} of Month</option>)}
              </Select>
            </div>
            <div>
              <Label className="text-xs">Payroll Cutoff Day</Label>
              <Input type="number" value={hrSettings.payrollCutoff} onChange={e => setHr("payrollCutoff", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button className="text-xs flex items-center gap-2" onClick={saveHrSettings}>
            {hrSaved ? <><Check className="w-3.5 h-3.5 text-green-400" />Saved!</> : "Save HR Settings"}
          </Button>
        </div>
      </Card>

      {/* Holiday Management */}
      <Card className="p-5">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Sri Lanka Public Holidays — {year}
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1"><span className={cn("w-2.5 h-2.5 rounded-full inline-block bg-blue-500")}></span> National ({national.length})</span>
              <span className="flex items-center gap-1"><span className="text-base leading-none">{POYA_ICON}</span> Poya ({poyas.length})</span>
              <span className="flex items-center gap-1"><span className={cn("w-2.5 h-2.5 rounded-full inline-block bg-purple-500")}></span> Religious ({religious.length})</span>
            </div>
            <Button onClick={() => setShowAdd(v => !v)} className="text-xs flex items-center gap-1 h-8 px-3">
              <Plus className="w-3.5 h-3.5" /> Add Holiday
            </Button>
          </div>
        </div>

        {showAdd && (
          <div className="mb-4 p-4 bg-muted/40 rounded-lg border border-border">
            <h4 className="text-xs font-semibold mb-3">Add New Holiday</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input placeholder="Holiday name" value={newHoliday.name} onChange={e => setNewHoliday(h => ({ ...h, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={newHoliday.date} onChange={e => setNewHoliday(h => ({ ...h, date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={newHoliday.type} onChange={e => setNewHoliday(h => ({ ...h, type: e.target.value }))}>
                  <option value="national">National</option>
                  <option value="religious">Religious</option>
                  <option value="special">Special</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Description (optional)</Label>
                <Input placeholder="Details..." value={newHoliday.description} onChange={e => setNewHoliday(h => ({ ...h, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-3">
              <Button variant="outline" className="text-xs h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button className="text-xs h-8" onClick={handleAddHoliday} disabled={addHoliday.isPending || !newHoliday.name || !newHoliday.date}>
                {addHoliday.isPending ? "Saving..." : "Add Holiday"}
              </Button>
            </div>
          </div>
        )}

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
                    <span className="text-xs font-bold text-foreground">{monthName}</span>
                    {monthHolidays.length > 0 && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">{monthHolidays.length} holiday{monthHolidays.length > 1 ? "s" : ""}</span>
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
                              <span className={cn("text-xs px-1.5 py-0 rounded text-xs", TYPE_STYLE[h.type] || TYPE_STYLE.special)}>
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

        {/* Holiday List Table */}
        {!isLoading && (holidays || []).length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Full Holiday List — {year}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 px-2 text-muted-foreground">Date</th>
                    <th className="text-left py-1.5 px-2 text-muted-foreground">Day</th>
                    <th className="text-left py-1.5 px-2 text-muted-foreground">Holiday</th>
                    <th className="text-left py-1.5 px-2 text-muted-foreground">Type</th>
                    <th className="py-1.5 px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(holidays || []).sort((a, b) => a.date.localeCompare(b.date)).map(h => {
                    const d = new Date(h.date + "T00:00:00");
                    const day = d.toLocaleDateString("en-LK", { weekday: "long" });
                    const isSun = d.getDay() === 0;
                    return (
                      <tr key={h.id} className={cn("hover:bg-muted/30", isSun && "bg-amber-50/50")}>
                        <td className="px-2 py-1.5 font-mono">{h.date}</td>
                        <td className={cn("px-2 py-1.5", isSun && "text-red-500 font-medium")}>{day}</td>
                        <td className="px-2 py-1.5 font-medium flex items-center gap-1">
                          {isPoya(h.name) && <span>{POYA_ICON}</span>}{h.name}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={cn("px-2 py-0.5 rounded text-xs", TYPE_STYLE[h.type] || TYPE_STYLE.special)}>{h.type}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button onClick={() => { if(confirm(`Remove "${h.name}"?`)) removeHoliday.mutate({ id: h.id }, { onSuccess: refetch }); }}
                            className="text-muted-foreground hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* ZK Push Setup */}
      <Card className="p-5 border-blue-200 bg-blue-50/20">
        <h3 className="font-bold text-sm flex items-center gap-2 border-b border-blue-100 pb-3 mb-4">
          <Fingerprint className="w-4 h-4 text-blue-600" />
          ZKTeco Biometric ZK Push (ADMS) Configuration
          <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">ADMS Ready</span>
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Configure ZKTeco biometric devices to push attendance data via the ADMS (Attendance Data Management System) protocol.
          Enter these server details in each device's Cloud Server or ADMS settings.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">ADMS Server URL (copy to device)</Label>
            <div className="flex gap-2">
              <Input readOnly value={serverUrl} className="bg-muted font-mono text-xs" />
              <Button variant="outline" className="shrink-0 text-xs h-9 px-3" onClick={() => handleCopy(serverUrl)}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Server Port</Label>
            <Input readOnly value="80" className="bg-muted font-mono text-xs" />
          </div>
          <div>
            <Label className="text-xs">Protocol</Label>
            <Input readOnly value="HTTP (ADMS/ZK Push)" className="bg-muted text-xs" />
          </div>
          <div>
            <Label className="text-xs">Heartbeat Interval (seconds)</Label>
            <Input type="number" defaultValue="30" />
          </div>
        </div>
        <div className="mt-4 p-3 bg-blue-100/50 rounded-lg border border-blue-200">
          <p className="text-xs font-semibold text-blue-800 mb-2">Device Setup Steps (ZKTeco F-Series / K-Series)</p>
          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
            <li>On device: Menu → Cloud Server Settings (or ADMS)</li>
            <li>Enable: Cloud Service = <strong>ON</strong></li>
            <li>Server Address: <code className="bg-blue-200/50 px-1 rounded">{window.location.host}</code></li>
            <li>Server Port: <code className="bg-blue-200/50 px-1 rounded">80</code></li>
            <li>Set device Serial Number (used as device ID in the system)</li>
            <li>Save and restart the device — it will start pushing immediately</li>
          </ol>
        </div>
        <div className="flex justify-end mt-4">
          <Button className="text-xs bg-blue-600 hover:bg-blue-700 text-white">Save ZK Settings</Button>
        </div>
      </Card>
    </div>
  );
}
