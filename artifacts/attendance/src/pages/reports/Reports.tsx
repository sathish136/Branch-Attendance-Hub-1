import { useState } from "react";
import { useGetAttendanceReport, useGetMonthlyReport, useGetOvertimeReport, useListBranches } from "@workspace/api-client-react";
import { PageHeader, Card, Button, Input, Select, Label } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FileDown, Users, Clock, Calendar } from "lucide-react";

type Tab = "attendance" | "monthly" | "overtime";

const STATUS_COLORS: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-700",
  half_day: "bg-yellow-100 text-yellow-700",
  leave: "bg-purple-100 text-purple-700",
  holiday: "bg-gray-100 text-gray-700",
};

function getMonthName(m: number) {
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m-1];
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>("attendance");

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" description="Detailed attendance, monthly, and overtime reports for all branches." />
      <div className="flex gap-1 border-b border-border">
        {([
          { id: "attendance", label: "Attendance Report", icon: Users },
          { id: "monthly", label: "Monthly Report", icon: Calendar },
          { id: "overtime", label: "Overtime Report", icon: Clock },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "attendance" && <AttendanceReport />}
      {tab === "monthly" && <MonthlyReport />}
      {tab === "overtime" && <OvertimeReport />}
    </div>
  );
}

function AttendanceReport() {
  const now = new Date();
  const [startDate, setStartDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("");
  const [applied, setApplied] = useState({ startDate, endDate, branchId, status });

  const { data: branches } = useListBranches();
  const { data, isLoading } = useGetAttendanceReport({
    startDate: applied.startDate,
    endDate: applied.endDate,
    ...(applied.branchId ? { branchId: Number(applied.branchId) } : {}),
    ...(applied.status ? { status: applied.status } : {}),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
          <div>
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
              <option value="half_day">Half Day</option>
              <option value="leave">Leave</option>
            </Select>
          </div>
          <Button onClick={() => setApplied({ startDate, endDate, branchId, status })}>Apply</Button>
          <Button variant="outline" className="flex items-center gap-2">
            <FileDown className="w-4 h-4" />Export
          </Button>
        </div>
      </Card>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Present", val: data.summary.present, cls: "text-green-600" },
            { label: "Absent", val: data.summary.absent, cls: "text-red-600" },
            { label: "Late", val: data.summary.late, cls: "text-amber-600" },
            { label: "Half Day", val: data.summary.halfDay, cls: "text-yellow-600" },
            { label: "Leave", val: data.summary.leave, cls: "text-purple-600" },
            { label: "Holiday", val: data.summary.holiday, cls: "text-gray-600" },
          ].map(({ label, val, cls }) => (
            <Card key={label} className="p-3 text-center">
              <div className={cn("text-2xl font-bold", cls)}>{val}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Date","Emp ID","Employee","Branch","Designation","Status","In Time","Out Time","Total Hrs","OT Hrs"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.records || []).slice(0, 200).map(r => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.employeeCode}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{r.employeeName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.branchName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">—</td>
                    <td className="px-3 py-2">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-medium uppercase", STATUS_COLORS[r.status] || "bg-gray-100")}>
                        {r.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">{r.inTime1 ? new Date(r.inTime1).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.outTime1 ? new Date(r.outTime1).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.totalHours != null ? `${r.totalHours.toFixed(1)}h` : "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.overtimeHours != null && r.overtimeHours > 0 ? `${r.overtimeHours.toFixed(1)}h` : "—"}</td>
                  </tr>
                ))}
                {!data?.records?.length && (
                  <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">No records found. Apply filters and click Apply.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function MonthlyReport() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [branchId, setBranchId] = useState("");
  const [applied, setApplied] = useState({ month, year, branchId });
  const { data: branches } = useListBranches();
  const { data, isLoading } = useGetMonthlyReport({
    month: applied.month,
    year: applied.year,
    ...(applied.branchId ? { branchId: Number(applied.branchId) } : {}),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs">Month</Label>
            <Select value={month} onChange={e => setMonth(Number(e.target.value))}>
              {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{getMonthName(i+1)}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Year</Label>
            <Select value={year} onChange={e => setYear(Number(e.target.value))}>
              {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setApplied({ month, year, branchId })}>Generate</Button>
            <Button variant="outline" className="flex items-center gap-2"><FileDown className="w-4 h-4" /></Button>
          </div>
        </div>
      </Card>

      {data && (
        <Card className="p-3 flex gap-6 text-sm border-green-200 bg-green-50/30">
          <div><span className="text-muted-foreground">Period: </span><strong>{getMonthName(data.month)} {data.year}</strong></div>
          <div><span className="text-muted-foreground">Total Employees: </span><strong>{data.totalEmployees}</strong></div>
          <div><span className="text-muted-foreground">Working Days: </span><strong>{data.workingDays}</strong></div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Generating report...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Emp ID","Employee","Branch","Designation","Present","Absent","Late","Half Day","Leave","Holiday","Work Hours","OT Hours","Att %"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.employees || []).map(e => (
                  <tr key={e.employeeId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{e.employeeCode}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{e.employeeName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[120px] truncate">{e.branchName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{e.designation}</td>
                    <td className="px-3 py-2 text-center text-green-600 font-semibold">{e.presentDays}</td>
                    <td className="px-3 py-2 text-center text-red-600 font-semibold">{e.absentDays}</td>
                    <td className="px-3 py-2 text-center text-amber-600 font-semibold">{e.lateDays}</td>
                    <td className="px-3 py-2 text-center text-yellow-600 font-semibold">{e.halfDays}</td>
                    <td className="px-3 py-2 text-center text-purple-600 font-semibold">{e.leaveDays}</td>
                    <td className="px-3 py-2 text-center text-gray-600 font-semibold">{e.holidayDays}</td>
                    <td className="px-3 py-2 text-center font-mono">{e.totalWorkHours.toFixed(1)}h</td>
                    <td className="px-3 py-2 text-center font-mono text-amber-600">{e.overtimeHours.toFixed(1)}h</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-bold",
                        e.attendancePercentage >= 90 ? "bg-green-100 text-green-700" :
                        e.attendancePercentage >= 75 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                      )}>{e.attendancePercentage}%</span>
                    </td>
                  </tr>
                ))}
                {!data?.employees?.length && (
                  <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">Click Generate to load the monthly report.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function OvertimeReport() {
  const now = new Date();
  const [startDate, setStartDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);
  const [branchId, setBranchId] = useState("");
  const [applied, setApplied] = useState({ startDate, endDate, branchId });
  const { data: branches } = useListBranches();
  const { data, isLoading } = useGetOvertimeReport({
    startDate: applied.startDate,
    endDate: applied.endDate,
    ...(applied.branchId ? { branchId: Number(applied.branchId) } : {}),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">All Branches</option>
              {branches?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setApplied({ startDate, endDate, branchId })}>Apply</Button>
            <Button variant="outline" className="flex items-center gap-2"><FileDown className="w-4 h-4" /></Button>
          </div>
        </div>
      </Card>

      {data && (
        <Card className="p-3 flex gap-6 text-sm border-amber-200 bg-amber-50/30">
          <div><span className="text-muted-foreground">Total OT Hours: </span><strong className="text-amber-700">{data.totalOvertimeHours.toFixed(1)}h</strong></div>
          <div><span className="text-muted-foreground">Employees with OT: </span><strong>{data.employees.length}</strong></div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Emp ID","Employee","Branch","Designation","OT Days","Total OT Hours","Daily Breakdown"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.employees || []).map(e => (
                  <tr key={e.employeeId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{e.employeeCode}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{e.employeeName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[100px] truncate">{e.branchName}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{e.designation}</td>
                    <td className="px-3 py-2 text-center font-semibold text-amber-600">{e.overtimeDays}</td>
                    <td className="px-3 py-2 text-center font-bold text-amber-700">{e.totalOvertimeHours.toFixed(1)}h</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.records.slice(0,3).map(r => `${r.date}: ${r.overtimeHours.toFixed(1)}h`).join(" | ")}
                      {e.records.length > 3 && ` +${e.records.length-3} more`}
                    </td>
                  </tr>
                ))}
                {!data?.employees?.length && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No overtime records found for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
