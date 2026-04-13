import { useState, useMemo } from "react";
import { Search, MapPin, RefreshCw, Users, CheckCircle2, XCircle, Clock, CalendarOff, Fingerprint, PenLine } from "lucide-react";
import { PageHeader, Card, Table, Th, Tr, Td, Badge, Input, Select } from "@/components/ui";
import { useTodayAttendance } from "@/hooks/use-attendance";
import { useBranches } from "@/hooks/use-core";
import { formatTime } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTodayAttendanceQueryKey } from "@workspace/api-client-react";

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <Card className="p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-xl ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </Card>
  );
}

export default function TodayAttendance() {
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const queryClient = useQueryClient();

  const params = branchId !== "all" ? { branchId: Number(branchId) } : undefined;
  const { data, isLoading } = useTodayAttendance(params);
  const { data: branchesData } = useBranches();

  const branches = useMemo(() => {
    const all: any[] = branchesData || [];
    return all;
  }, [branchesData]);

  const records: any[] = useMemo(() => {
    const raw = data?.records || [];
    if (!search.trim()) return raw;
    const q = search.toLowerCase();
    return raw.filter((r: any) =>
      r.employeeName?.toLowerCase().includes(q) ||
      r.employeeCode?.toLowerCase().includes(q) ||
      r.branchName?.toLowerCase().includes(q)
    );
  }, [data?.records, search]);

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: [getGetTodayAttendanceQueryKey()[0]] });
    setRefreshKey(k => k + 1);
  }

  const today = data?.date
    ? new Date(data.date).toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const statusConfig: Record<string, { label: string; variant: "success" | "danger" | "warning" | "neutral" | "info" }> = {
    present:  { label: "Present",  variant: "success" },
    absent:   { label: "Absent",   variant: "danger" },
    late:     { label: "Late",     variant: "warning" },
    half_day: { label: "Half Day", variant: "neutral" },
    leave:    { label: "On Leave", variant: "info" },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today's Attendance"
        description={today}
        action={
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Users}        label="Total"    value={data?.totalEmployees ?? 0} color="bg-slate-500" />
        <StatCard icon={CheckCircle2} label="Present"  value={data?.present ?? 0}        color="bg-emerald-500" />
        <StatCard icon={XCircle}      label="Absent"   value={data?.absent ?? 0}          color="bg-red-500" />
        <StatCard icon={Clock}        label="Late"     value={data?.late ?? 0}            color="bg-amber-500" />
        <StatCard icon={CalendarOff}  label="Half Day" value={data?.halfDay ?? 0}         color="bg-orange-500" />
        <StatCard icon={CalendarOff}  label="On Leave" value={data?.onLeave ?? 0}         color="bg-blue-500" />
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-col md:flex-row gap-3 items-center bg-white/50">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID or branch..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={branchId}
          onChange={e => setBranchId(e.target.value)}
          className="w-full md:w-[220px]"
        >
          <option value="all">All Branches</option>
          {branches.map((b: any) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground animate-pulse">Loading records...</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <div className="font-medium">No records found</div>
            <div className="text-sm mt-1">Try adjusting your search or branch filter.</div>
          </div>
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Employee</Th>
                <Th>Branch</Th>
                <Th>Status</Th>
                <Th>In Time</Th>
                <Th>Out Time</Th>
                <Th>Work Hours</Th>
                <Th>Source</Th>
              </Tr>
            </thead>
            <tbody>
              {records.map((r: any) => {
                const sc = statusConfig[r.status] ?? { label: r.status, variant: "neutral" as const };
                const workHours = r.totalHours
                  ? `${Math.floor(Number(r.totalHours))}h ${Math.round((Number(r.totalHours) % 1) * 60)}m`
                  : r.workHours1
                    ? `${Math.floor(Number(r.workHours1))}h ${Math.round((Number(r.workHours1) % 1) * 60)}m`
                    : "—";
                return (
                  <Tr key={r.id}>
                    <Td>
                      <div className="font-semibold text-foreground">{r.employeeName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.employeeCode}</div>
                    </Td>
                    <Td className="text-muted-foreground text-sm">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {r.branchName || "—"}
                      </div>
                    </Td>
                    <Td>
                      <Badge variant={sc.variant}>{sc.label}</Badge>
                    </Td>
                    <Td className="font-mono text-sm font-medium">
                      {r.inTime1 ? (
                        <span className="text-emerald-700">{formatTime(r.inTime1)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td className="font-mono text-sm">
                      {r.outTime1 ? (
                        <span className="text-blue-700">{formatTime(r.outTime1)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td className="text-sm font-medium text-muted-foreground">{workHours}</Td>
                    <Td>
                      {r.source === "biometric" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full font-medium">
                          <Fingerprint className="w-3 h-3" /> Biometric
                        </span>
                      ) : r.source === "manual" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full font-medium">
                          <PenLine className="w-3 h-3" /> Manual
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {records.length > 0 && (
          <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-muted/30">
            Showing {records.length} of {data?.totalEmployees ?? records.length} employee{records.length !== 1 ? "s" : ""}
          </div>
        )}
      </Card>
    </div>
  );
}
