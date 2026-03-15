import { useState, useCallback, useEffect } from "react";
import { PageHeader, Card, Button, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  Banknote, RefreshCw, CheckCircle, CreditCard, Download,
  Users, TrendingUp, Minus, Eye, X, Printer,
  ChevronDown, ChevronUp, AlertCircle
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function fmt(n: number) {
  return `Rs. ${Math.round(n).toLocaleString("en-LK")}`;
}

type PayStatus = "draft" | "approved" | "paid";

interface PayrollRow {
  id: number;
  employeeId: number;
  branchId: number;
  month: number;
  year: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  holidayDays: number;
  overtimeHours: number;
  basicSalary: number;
  transportAllowance: number;
  housingAllowance: number;
  otherAllowances: number;
  overtimePay: number;
  grossSalary: number;
  epfEmployee: number;
  epfEmployer: number;
  etfEmployer: number;
  apit: number;
  lateDeduction: number;
  absenceDeduction: number;
  totalDeductions: number;
  netSalary: number;
  status: PayStatus;
  generatedAt: string;
  approvedAt?: string;
  paidAt?: string;
  employee: {
    id: number;
    employeeId: string;
    fullName: string;
    designation: string;
    department: string;
    branchId: number;
  };
}

interface Summary {
  totalEmployees: number;
  totalGross: number;
  totalNet: number;
  totalEPF: number;
  totalETF: number;
  totalAPIT: number;
  totalOTPay: number;
  statusCounts: { draft: number; approved: number; paid: number };
}

const STATUS_STYLES: Record<PayStatus, string> = {
  draft:    "bg-amber-100 text-amber-700 border border-amber-200",
  approved: "bg-blue-100 text-blue-700 border border-blue-200",
  paid:     "bg-emerald-100 text-emerald-700 border border-emerald-200",
};

function PayslipModal({ row, onClose }: { row: PayrollRow; onClose: () => void }) {
  const logo = localStorage.getItem("org_logo");
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {logo
                ? <img src={logo} alt="Logo" className="w-12 h-12 object-contain" />
                : <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">P</div>}
              <div>
                <h2 className="font-bold text-lg text-foreground">Sri Lanka Post</h2>
                <p className="text-sm text-muted-foreground">PAY SLIP — {MONTHS[row.month - 1]} {row.year}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="text-xs flex items-center gap-1.5 py-1.5" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" />Print
              </Button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="bg-muted/40 rounded-xl p-4 mb-5 grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground text-xs">Employee Name</span><p className="font-semibold">{row.employee.fullName}</p></div>
            <div><span className="text-muted-foreground text-xs">Employee ID</span><p className="font-semibold">{row.employee.employeeId}</p></div>
            <div><span className="text-muted-foreground text-xs">Designation</span><p className="font-semibold">{row.employee.designation}</p></div>
            <div><span className="text-muted-foreground text-xs">Department</span><p className="font-semibold">{row.employee.department}</p></div>
            <div><span className="text-muted-foreground text-xs">Pay Period</span><p className="font-semibold">{MONTHS[row.month - 1]} {row.year}</p></div>
            <div><span className="text-muted-foreground text-xs">Payment Status</span>
              <span className={cn("inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium", STATUS_STYLES[row.status])}>
                {row.status.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-5 gap-2 text-center text-xs">
            {[
              { label: "Working Days", val: row.workingDays },
              { label: "Present", val: row.presentDays },
              { label: "Absent", val: row.absentDays },
              { label: "Late", val: row.lateDays },
              { label: "OT Hours", val: row.overtimeHours.toFixed(1) },
            ].map(s => (
              <div key={s.label} className="bg-muted/40 rounded-lg p-2">
                <p className="text-muted-foreground text-[10px]">{s.label}</p>
                <p className="font-bold text-sm mt-0.5">{s.val}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <h3 className="font-semibold text-sm mb-2 text-emerald-700 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />Earnings
              </h3>
              <div className="space-y-1.5 text-sm">
                {[
                  { label: "Basic Salary",       val: row.basicSalary },
                  { label: "Transport Allowance", val: row.transportAllowance },
                  { label: "Housing Allowance",   val: row.housingAllowance },
                  { label: "Other Allowances",    val: row.otherAllowances },
                  { label: "Overtime Pay",        val: row.overtimePay },
                ].map(e => (
                  <div key={e.label} className="flex justify-between">
                    <span className="text-muted-foreground">{e.label}</span>
                    <span className="font-medium">{fmt(e.val)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-emerald-700 border-t border-emerald-100 pt-1.5 mt-1">
                  <span>Gross Salary</span>
                  <span>{fmt(row.grossSalary)}</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2 text-red-600 flex items-center gap-1.5">
                <Minus className="w-3.5 h-3.5" />Deductions
              </h3>
              <div className="space-y-1.5 text-sm">
                {[
                  { label: "EPF (Employee 8%)",   val: row.epfEmployee },
                  { label: "APIT (Income Tax)",   val: row.apit },
                  { label: "Absence Deduction",   val: row.absenceDeduction },
                  { label: "Late Deduction",      val: row.lateDeduction },
                ].map(d => (
                  <div key={d.label} className="flex justify-between">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="font-medium text-red-600">{fmt(d.val)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-red-600 border-t border-red-100 pt-1.5 mt-1">
                  <span>Total Deductions</span>
                  <span>{fmt(row.totalDeductions)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">Net Salary (Take Home)</p>
              <p className="text-2xl font-bold text-primary">{fmt(row.netSalary)}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-0.5">
              <p>EPF Employer (12%): {fmt(row.epfEmployer)}</p>
              <p>ETF Employer (3%): {fmt(row.etfEmployer)}</p>
              <p>Total Employer Cost: {fmt(row.grossSalary + row.epfEmployer + row.etfEmployer)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Payroll() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [payslip, setPayslip] = useState<PayrollRow | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string>("employee.fullName");
  const [sortAsc, setSortAsc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fetchPayroll = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const [pr, sr] = await Promise.all([
        fetch(apiUrl(`/payroll?month=${month}&year=${year}`)).then(r => r.json()),
        fetch(apiUrl(`/payroll/summary?month=${month}&year=${year}`)).then(r => r.json()),
      ]);
      setPayroll(Array.isArray(pr) ? pr : []);
      setSummary(sr.totalEmployees !== undefined ? sr : null);
    } catch {
      setMsg({ type: "error", text: "Failed to load payroll data." });
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchPayroll(); }, [fetchPayroll]);

  const generatePayroll = async () => {
    if (!confirm(`Generate payroll for ${MONTHS[month - 1]} ${year}? This will overwrite existing draft records.`)) return;
    setGenerating(true); setMsg(null);
    try {
      const r = await fetch(apiUrl("/payroll/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg({ type: "success", text: d.message });
        await fetchPayroll();
      } else {
        setMsg({ type: "error", text: d.message });
      }
    } catch {
      setMsg({ type: "error", text: "Generation failed. Check server." });
    } finally {
      setGenerating(false);
    }
  };

  const updateStatus = async (id: number, status: PayStatus) => {
    await fetch(apiUrl(`/payroll/${id}/status`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setPayroll(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    if (summary) {
      const old = payroll.find(r => r.id === id)?.status;
      if (old) {
        setSummary(s => s ? { ...s, statusCounts: { ...s.statusCounts, [old]: s.statusCounts[old as keyof typeof s.statusCounts] - 1, [status]: s.statusCounts[status] + 1 } } : s);
      }
    }
  };

  const bulkUpdateStatus = async (status: PayStatus) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    await fetch(apiUrl("/payroll/bulk-status"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    setPayroll(prev => prev.map(r => ids.includes(r.id) ? { ...r, status } : r));
    setSelected(new Set());
    setMsg({ type: "success", text: `${ids.length} records updated to ${status}` });
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const filtered = payroll
    .filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.employee.fullName.toLowerCase().includes(q) ||
        r.employee.employeeId.toLowerCase().includes(q) ||
        r.employee.designation.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      let av: any = sortField === "employee.fullName" ? a.employee.fullName :
        sortField === "netSalary" ? a.netSalary :
        sortField === "grossSalary" ? a.grossSalary :
        sortField === "status" ? a.status : a.employee.fullName;
      let bv: any = sortField === "employee.fullName" ? b.employee.fullName :
        sortField === "netSalary" ? b.netSalary :
        sortField === "grossSalary" ? b.grossSalary :
        sortField === "status" ? b.status : b.employee.fullName;
      if (typeof av === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll Management"
        subtitle="Generate, review and process monthly payroll for Sri Lanka Post employees."
      />

      {msg && (
        <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border",
          msg.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200")}>
          {msg.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Select value={String(month)} onChange={e => setMonth(Number(e.target.value))} className="w-36">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
            <Select value={String(year)} onChange={e => setYear(Number(e.target.value))} className="w-24">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <Button
            onClick={fetchPayroll}
            disabled={loading}
            className="text-xs flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Loading…" : "Load Payroll"}
          </Button>
          <Button
            onClick={generatePayroll}
            disabled={generating}
            className="text-xs flex items-center gap-2"
          >
            <Banknote className="w-3.5 h-3.5" />
            {generating ? "Generating…" : "Generate Payroll"}
          </Button>
          {selected.size > 0 && (
            <>
              <Button
                onClick={() => bulkUpdateStatus("approved")}
                className="text-xs flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <CheckCircle className="w-3.5 h-3.5" />Approve ({selected.size})
              </Button>
              <Button
                onClick={() => bulkUpdateStatus("paid")}
                className="text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CreditCard className="w-3.5 h-3.5" />Mark Paid ({selected.size})
              </Button>
            </>
          )}
        </div>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Employees", val: summary.totalEmployees, icon: Users, color: "text-blue-600", bg: "bg-blue-50", fmt: (v: number) => v.toString() },
            { label: "Total Gross",    val: summary.totalGross, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", fmt },
            { label: "Total Net Pay",  val: summary.totalNet,   icon: Banknote,   color: "text-primary",     bg: "bg-primary/5",  fmt },
            { label: "Total EPF",      val: summary.totalEPF,   icon: CreditCard, color: "text-violet-600", bg: "bg-violet-50",  fmt },
          ].map(s => (
            <Card key={s.label} className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-lg", s.bg)}>
                  <s.icon className={cn("w-4 h-4", s.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("font-bold text-base mt-0.5 truncate", s.color)}>{s.fmt(s.val)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {summary && (
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "Draft",    count: summary.statusCounts.draft,    color: "bg-amber-100 text-amber-700 border-amber-200" },
            { label: "Approved", count: summary.statusCounts.approved,  color: "bg-blue-100 text-blue-700 border-blue-200" },
            { label: "Paid",     count: summary.statusCounts.paid,      color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
          ].map(s => (
            <div key={s.label} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium", s.color)}>
              {s.label}: <span className="font-bold">{s.count}</span>
            </div>
          ))}
        </div>
      )}

      {payroll.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, ID or designation…"
              className="border border-border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            />
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-32 text-xs">
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </Select>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={allSelected}
                      onChange={e => setSelected(e.target.checked ? new Set(filtered.map(r => r.id)) : new Set())}
                      className="rounded" />
                  </th>
                  {[
                    { label: "Employee",    field: "employee.fullName" },
                    { label: "Attendance",  field: null },
                    { label: "Basic",       field: null },
                    { label: "Gross Salary", field: "grossSalary" },
                    { label: "Deductions",  field: null },
                    { label: "Net Salary",  field: "netSalary" },
                    { label: "Status",      field: "status" },
                    { label: "Actions",     field: null },
                  ].map(col => (
                    <th key={col.label}
                      className={cn("p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                        col.field && "cursor-pointer hover:text-foreground")}
                      onClick={() => col.field && toggleSort(col.field)}>
                      <div className="flex items-center gap-1">
                        {col.label}
                        {col.field && sortField === col.field && (
                          sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={row.id}
                    className={cn("border-b border-border/60 hover:bg-muted/30 transition-colors",
                      i % 2 === 0 ? "bg-background" : "bg-muted/10",
                      selected.has(row.id) && "bg-primary/5")}>
                    <td className="p-3">
                      <input type="checkbox" checked={selected.has(row.id)}
                        onChange={e => {
                          const s = new Set(selected);
                          e.target.checked ? s.add(row.id) : s.delete(row.id);
                          setSelected(s);
                        }} className="rounded" />
                    </td>
                    <td className="p-3">
                      <p className="font-medium text-foreground">{row.employee.fullName}</p>
                      <p className="text-xs text-muted-foreground">{row.employee.employeeId} · {row.employee.designation}</p>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 text-[11px]">
                        <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">P:{row.presentDays}</span>
                        <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded">A:{row.absentDays}</span>
                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">L:{row.lateDays}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{fmt(row.basicSalary)}</td>
                    <td className="p-3 font-medium">{fmt(row.grossSalary)}</td>
                    <td className="p-3 text-red-600 text-sm">{fmt(row.totalDeductions)}</td>
                    <td className="p-3 font-bold text-primary">{fmt(row.netSalary)}</td>
                    <td className="p-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_STYLES[row.status])}>
                        {row.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPayslip(row)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="View Payslip"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {row.status === "draft" && (
                          <button
                            onClick={() => updateStatus(row.id, "approved")}
                            className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors text-blue-600"
                            title="Approve"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {row.status === "approved" && (
                          <button
                            onClick={() => updateStatus(row.id, "paid")}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 transition-colors text-emerald-600"
                            title="Mark as Paid"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No payroll records match your filter.
            </div>
          )}
        </Card>
      )}

      {payroll.length === 0 && !loading && (
        <Card className="p-12 text-center">
          <Banknote className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium mb-1">No payroll data for {MONTHS[month - 1]} {year}</p>
          <p className="text-xs text-muted-foreground mb-4">Click "Generate Payroll" to calculate salaries from attendance records.</p>
          <Button onClick={generatePayroll} disabled={generating} className="text-xs mx-auto flex items-center gap-2">
            <Banknote className="w-3.5 h-3.5" />
            {generating ? "Generating…" : "Generate Payroll"}
          </Button>
        </Card>
      )}

      {payslip && <PayslipModal row={payslip} onClose={() => setPayslip(null)} />}
    </div>
  );
}
