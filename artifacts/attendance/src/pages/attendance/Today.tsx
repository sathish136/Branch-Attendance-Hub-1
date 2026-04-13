import { useState } from "react";
import { Search, MapPin } from "lucide-react";
import { PageHeader, Card, Table, Th, Tr, Td, Badge, Input, Select } from "@/components/ui";
import { useTodayAttendance } from "@/hooks/use-attendance";
import { formatTime } from "@/lib/utils";

export default function TodayAttendance() {
  const [branch, setBranch] = useState("all");
  const { data, isLoading } = useTodayAttendance();

  const records = data?.records || [
    { id: 1, employeeId: 101, employeeCode: "EMP001", employeeName: "Alice Walker", branchName: "Head Office", status: "present", inTime1: "08:00", outTime1: null, source: "biometric" },
    { id: 2, employeeId: 102, employeeCode: "EMP002", employeeName: "Bob Smith", branchName: "Head Office", status: "absent", inTime1: null, outTime1: null, source: "system" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Today's Attendance" 
        description="Monitor daily presence, late arrivals, and live punches." 
      />

      <Card className="p-4 flex flex-col md:flex-row gap-4 items-center bg-white/50">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search employee..." className="pl-9" />
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <Select value={branch} onChange={e => setBranch(e.target.value)} className="min-w-[180px]">
            <option value="all">All Branches</option>
            <option value="1">Head Office</option>
            <option value="2">North Regional</option>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground animate-pulse">Loading records...</div>
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Employee</Th>
                <Th>Branch</Th>
                <Th>Status</Th>
                <Th>In Time</Th>
                <Th>Out Time</Th>
              </Tr>
            </thead>
            <tbody>
              {records.map((r: any) => (
                <Tr key={r.id}>
                  <Td>
                    <div className="font-semibold text-foreground">{r.employeeName}</div>
                    <div className="text-xs text-muted-foreground">{r.employeeCode}</div>
                  </Td>
                  <Td className="text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> {r.branchName}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={
                      r.status === 'present' ? 'success' : 
                      r.status === 'late' ? 'warning' : 
                      r.status === 'absent' ? 'danger' : 'neutral'
                    }>
                      {r.status.toUpperCase()}
                    </Badge>
                  </Td>
                  <Td className="font-mono text-xs font-medium">{formatTime(r.inTime1)}</Td>
                  <Td className="font-mono text-xs font-medium text-muted-foreground">{formatTime(r.outTime1)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
