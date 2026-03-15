import { Router } from "express";
import { db } from "@workspace/db";
import {
  branches, shifts, departments, designations, employees, holidays, systemSettings, attendanceRecords
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const SL_HOLIDAY_DATES_2026 = new Set([
  "2026-01-01","2026-01-11","2026-01-14",
  "2026-02-04","2026-02-10","2026-02-17",
  "2026-03-11","2026-03-31",
]);

function pad2(n: number) { return String(n).padStart(2, "0"); }

function addMins(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${pad2(Math.floor(total / 60) % 24)}:${pad2(total % 60)}`;
}

function diffHrs(inT: string, outT: string): number {
  const [ih, im] = inT.split(":").map(Number);
  const [oh, om] = outT.split(":").map(Number);
  return ((oh * 60 + om) - (ih * 60 + im)) / 60;
}

function buildAttendance(empList: { id: number; branchId: number }[]) {
  const records: any[] = [];
  const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  const months = [
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
    { year: 2026, month: 3 },
  ];

  for (const { year, month } of months) {
    const daysInMonth = new Date(year, month, 0).getDate();
    for (const emp of empList) {
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
        const dow = new Date(year, month - 1, d).getDay();

        if (dow === 0) continue;

        if (SL_HOLIDAY_DATES_2026.has(dateStr)) {
          records.push({
            employeeId: emp.id,
            branchId: emp.branchId,
            date: dateStr,
            status: "holiday",
            source: "system",
          });
          continue;
        }

        const roll = Math.random();
        if (roll < 0.07) {
          records.push({
            employeeId: emp.id,
            branchId: emp.branchId,
            date: dateStr,
            status: "absent",
            source: "system",
          });
        } else if (roll < 0.10) {
          records.push({
            employeeId: emp.id,
            branchId: emp.branchId,
            date: dateStr,
            status: "leave",
            source: "system",
          });
        } else {
          const isLate = roll > 0.88;
          const inBase = isLate ? "08:20" : "07:45";
          const inOffset = rng(0, isLate ? 50 : 30);
          const inTime = addMins(inBase, inOffset);
          const outBase = "17:00";
          const outOffset = rng(0, 45);
          const outTime = addMins(outBase, outOffset);
          const worked = Math.round(diffHrs(inTime, outTime) * 100) / 100;
          const overtime = worked > 8 ? Math.round((worked - 8) * 100) / 100 : 0;

          records.push({
            employeeId: emp.id,
            branchId: emp.branchId,
            date: dateStr,
            status: isLate ? "late" : "present",
            inTime1: inTime,
            outTime1: outTime,
            workHours1: worked,
            totalHours: worked,
            overtimeHours: overtime,
            source: "biometric",
          });
        }
      }
    }
  }
  return records;
}

const SL_BRANCHES = [
  { name: "Sri Lanka Post – Head Office", code: "SLP-HQ", type: "head_office" as const, address: "310 D.R. Wijewardena Mawatha, Colombo 10", phone: "+94-11-2326601", managerName: "W.A.C. Rodrigo", isActive: true },
  { name: "Colombo Sorting Centre", code: "SLP-CSC", type: "regional" as const, address: "Old Colombo Post Office, Colombo 01", phone: "+94-11-2326200", managerName: "R.M. Perera", isActive: true },
  { name: "Kandy Head Post Office", code: "SLP-KDY", type: "regional" as const, address: "Sir Sankili Mahadeva Mawatha, Kandy", phone: "+94-81-2224200", managerName: "K.A. Dissanayake", isActive: true },
  { name: "Galle Post Office", code: "SLP-GLE", type: "regional" as const, address: "Church Street, Galle Fort, Galle", phone: "+94-91-2234567", managerName: "S.P. Jayasinghe", isActive: true },
  { name: "Jaffna Post Office", code: "SLP-JFN", type: "regional" as const, address: "First Cross Street, Jaffna", phone: "+94-21-2220300", managerName: "T. Krishnamurthy", isActive: true },
  { name: "Nugegoda Sub Post Office", code: "SLP-NGD", type: "sub_branch" as const, address: "High Street, Nugegoda, Colombo", phone: "+94-11-2851234", managerName: "M.D. Fernando", isActive: true },
  { name: "Matara Post Office", code: "SLP-MTR", type: "regional" as const, address: "Esplanade Road, Matara", phone: "+94-41-2222111", managerName: "G.P. Rathnayake", isActive: true },
  { name: "Kurunegala Post Office", code: "SLP-KGL", type: "regional" as const, address: "Rajapihilla Road, Kurunegala", phone: "+94-37-2222400", managerName: "P.B. Wickramasinghe", isActive: true },
];

const SL_SHIFTS = [
  { name: "General Shift", type: "normal" as const, startTime1: "08:00", endTime1: "17:00", graceMinutes: 10, overtimeThreshold: 60, isActive: true },
  { name: "Morning Shift", type: "normal" as const, startTime1: "06:00", endTime1: "14:00", graceMinutes: 5, overtimeThreshold: 60, isActive: true },
  { name: "Evening Shift", type: "normal" as const, startTime1: "14:00", endTime1: "22:00", graceMinutes: 5, overtimeThreshold: 60, isActive: true },
  { name: "Split Shift", type: "split" as const, startTime1: "07:00", endTime1: "12:00", startTime2: "14:00", endTime2: "18:00", graceMinutes: 10, overtimeThreshold: 45, isActive: true },
];

const SL_DEPARTMENTS = [
  { name: "Operations & Delivery", code: "OPS", description: "Mail processing, sorting, and delivery", isActive: true },
  { name: "Finance & Accounts", code: "FIN", description: "Budgeting, payroll, and financial reporting", isActive: true },
  { name: "Human Resources", code: "HR", description: "Recruitment, training, and employee welfare", isActive: true },
  { name: "Information Technology", code: "IT", description: "Systems, networks, and digital services", isActive: true },
  { name: "Postal Savings Bank", code: "PSB", description: "Savings accounts, remittances, and banking services", isActive: true },
  { name: "Customer Service", code: "CS", description: "Public counter, complaints, and inquiries", isActive: true },
  { name: "Administration", code: "ADM", description: "General administration and office management", isActive: true },
  { name: "Logistics & Transport", code: "LOG", description: "Vehicle management and route planning", isActive: true },
];

const SL_DESIGNATIONS = [
  { name: "Postmaster General", code: "PMG", level: 5, description: "Head of Sri Lanka Post", isActive: true },
  { name: "Deputy Postmaster General", code: "DPMG", level: 5, description: "Deputy head", isActive: true },
  { name: "Regional Postmaster", code: "RPM", level: 4, description: "Regional operations head", isActive: true },
  { name: "Sub Postmaster", code: "SPM", level: 3, description: "Sub-branch head", isActive: true },
  { name: "Postal Supervisor", code: "PSUP", level: 3, description: "Supervises postal operations", isActive: true },
  { name: "Senior Postal Officer", code: "SPSO", level: 2, description: "Senior counter and operations officer", isActive: true },
  { name: "Postal Officer", code: "PSO", level: 2, description: "General postal officer", isActive: true },
  { name: "Counter Clerk", code: "CCK", level: 1, description: "Front counter services", isActive: true },
  { name: "Sorting Officer", code: "STO", level: 1, description: "Mail sorting and processing", isActive: true },
  { name: "Delivery Agent", code: "DLA", level: 1, description: "Last-mile mail delivery", isActive: true },
  { name: "Accounts Officer", code: "ACO", level: 2, description: "Financial accounts management", isActive: true },
  { name: "HR Officer", code: "HRO", level: 2, description: "Human resources management", isActive: true },
  { name: "IT Officer", code: "ITO", level: 2, description: "IT systems administration", isActive: true },
  { name: "Driver", code: "DRV", level: 1, description: "Vehicle operator", isActive: true },
  { name: "Security Officer", code: "SCO", level: 1, description: "Premises security", isActive: true },
  { name: "Clerical Assistant", code: "CLA", level: 1, description: "Administrative support", isActive: true },
  { name: "Data Entry Operator", code: "DEO", level: 1, description: "Data processing and entry", isActive: true },
  { name: "PSB Officer", code: "PSBO", level: 2, description: "Postal Savings Bank officer", isActive: true },
];

const SL_HOLIDAYS_2026 = [
  { name: "New Year's Day", date: "2026-01-01", type: "national" as const, description: "Public holiday" },
  { name: "Duruthu Full Moon Poya Day", date: "2026-01-11", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Tamil Thai Pongal Day", date: "2026-01-14", type: "national" as const, description: "Tamil harvest festival" },
  { name: "Independence Day", date: "2026-02-04", type: "national" as const, description: "Sri Lanka Independence Day" },
  { name: "Nawam Full Moon Poya Day", date: "2026-02-10", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Maha Sivarathri Day", date: "2026-02-17", type: "religious" as const, description: "Hindu festival" },
  { name: "Medin Full Moon Poya Day", date: "2026-03-11", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Good Friday", date: "2026-04-03", type: "religious" as const, description: "Christian holiday" },
  { name: "Sinhala & Tamil New Year", date: "2026-04-13", type: "national" as const, description: "Sri Lankan New Year" },
  { name: "Sinhala & Tamil New Year (Holiday)", date: "2026-04-14", type: "national" as const, description: "Sri Lankan New Year holiday" },
  { name: "Bak Full Moon Poya Day", date: "2026-04-12", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Eid ul-Fitr", date: "2026-03-31", type: "religious" as const, description: "End of Ramadan" },
  { name: "May Day", date: "2026-05-01", type: "national" as const, description: "International Workers Day" },
  { name: "Vesak Full Moon Poya Day", date: "2026-05-11", type: "religious" as const, description: "Buddhist Poya Day – Birth of Buddha" },
  { name: "Day after Vesak", date: "2026-05-12", type: "religious" as const, description: "Vesak holiday" },
  { name: "Eid ul-Adha", date: "2026-06-07", type: "religious" as const, description: "Festival of Sacrifice" },
  { name: "Poson Full Moon Poya Day", date: "2026-06-10", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Esala Full Moon Poya Day", date: "2026-07-10", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Nikini Full Moon Poya Day", date: "2026-08-08", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Milad un-Nabi (Prophet's Birthday)", date: "2026-09-04", type: "religious" as const, description: "Islamic holiday" },
  { name: "Binara Full Moon Poya Day", date: "2026-09-07", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Vap Full Moon Poya Day", date: "2026-10-06", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Deepavali", date: "2026-10-18", type: "religious" as const, description: "Hindu Festival of Lights" },
  { name: "Il Full Moon Poya Day", date: "2026-11-05", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Unduvap Full Moon Poya Day", date: "2026-12-05", type: "religious" as const, description: "Buddhist Poya Day" },
  { name: "Christmas Day", date: "2026-12-25", type: "religious" as const, description: "Christian holiday" },
];

const SL_FIRST_NAMES_M = ["Nuwan","Kasun","Chamara","Dimuth","Sanjaya","Prasanna","Lahiru","Chathura","Malinda","Supun","Amila","Dushantha","Pradeep","Samith","Gayan","Tharaka","Rajitha","Isuru","Ruwan","Janaka","Manoj","Roshan","Vimukthi","Asanka","Harsha","Nishantha","Sumedha","Chandima","Uditha","Nimesh"];
const SL_FIRST_NAMES_F = ["Dilini","Sanduni","Chamari","Nilufar","Maneesha","Sachini","Thilini","Madushi","Shanika","Ayasha","Nimesha","Hasini","Sumudu","Hiruni","Nadeesha","Tharindi","Harshani","Kavisha","Amaya","Ruwindi"];
const SL_LAST_NAMES = ["Perera","Fernando","Silva","Wickramasinghe","Rajapaksha","Jayasinghe","Dissanayake","Gunasekara","Rathnayake","Mendis","Bandara","Seneviratne","Pathirana","Karunaratne","Liyanage","Abeysekara","Herath","Kumara","Prasad","Gamage","Ranasinghe","Weerasinghe","Abeywickrama","Samarasinghe","Gunawardena"];

function randItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function padZ(n: number, w = 2) { return String(n).padStart(w, "0"); }

function randomDate(startYear: number, endYear: number): string {
  const y = randInt(startYear, endYear);
  const m = randInt(1, 12);
  const d = randInt(1, 28);
  return `${y}-${padZ(m)}-${padZ(d)}`;
}

function buildEmployees(branchIds: number[], shiftIds: number[], deptNames: string[], desigNames: string[]) {
  const list: any[] = [];
  const genders: Array<"male" | "female"> = ["male", "female"];
  const types: Array<"permanent" | "contract" | "casual"> = ["permanent", "permanent", "permanent", "contract", "casual"];
  const statuses: Array<"active" | "on_leave" | "resigned"> = ["active", "active", "active", "active", "on_leave"];

  for (let i = 1; i <= 50; i++) {
    const gender = genders[i % 2];
    const firstName = gender === "male" ? SL_FIRST_NAMES_M[i % SL_FIRST_NAMES_M.length] : SL_FIRST_NAMES_F[i % SL_FIRST_NAMES_F.length];
    const lastName = SL_LAST_NAMES[i % SL_LAST_NAMES.length];
    const fullName = `${firstName} ${lastName}`;
    const empId = `SLP${padZ(1000 + i, 4)}`;
    const dept = deptNames[i % deptNames.length];
    const desig = desigNames[i % desigNames.length];
    const branchId = branchIds[i % branchIds.length];
    const shiftId = shiftIds[i % shiftIds.length];
    const joiningDate = randomDate(2010, 2024);
    const dob = randomDate(1970, 2000);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@slpost.lk`;
    const phone = `+94-7${randInt(0,8)}-${randInt(1000000, 9999999)}`;
    const nic = `${randInt(195000000, 200099999)}V`;
    const epf = `EPF${padZ(100000 + i, 6)}`;

    list.push({
      employeeId: empId,
      firstName,
      lastName,
      fullName,
      designation: desig,
      department: dept,
      branchId,
      shiftId,
      joiningDate,
      email,
      phone,
      biometricId: String(1000 + i),
      status: statuses[i % statuses.length],
      gender,
      dateOfBirth: dob,
      address: `${randInt(10, 500)}, ${randItem(["Galle Road", "Kandy Road", "High Street", "Main Street", "Temple Road"])}, Sri Lanka`,
      employeeType: types[i % types.length],
      nicNumber: nic,
      epfNumber: epf,
    });
  }
  return list;
}

router.post("/import", async (_req, res) => {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(branches).values(SL_BRANCHES).onConflictDoNothing();
      const allBranches = await tx.select({ id: branches.id }).from(branches);
      const branchIds = allBranches.map(b => b.id);

      await tx.insert(shifts).values(SL_SHIFTS).onConflictDoNothing();
      const allShifts = await tx.select({ id: shifts.id }).from(shifts);
      const shiftIds = allShifts.map(s => s.id);

      await tx.insert(departments).values(SL_DEPARTMENTS).onConflictDoNothing();
      const allDepts = await tx.select({ id: departments.id, code: departments.code }).from(departments);
      const deptMap: Record<string, number> = {};
      allDepts.forEach(d => { deptMap[d.code] = d.id; });

      const desigRows = SL_DESIGNATIONS.map(d => {
        const deptCode = d.code === "PMG" || d.code === "DPMG" ? "ADM"
          : d.code === "RPM" || d.code === "SPM" || d.code === "PSUP" || d.code === "SPSO" || d.code === "PSO" || d.code === "CCK" || d.code === "STO" || d.code === "DLA" ? "OPS"
          : d.code === "ACO" ? "FIN"
          : d.code === "HRO" ? "HR"
          : d.code === "ITO" || d.code === "DEO" ? "IT"
          : d.code === "PSBO" ? "PSB"
          : d.code === "SCO" ? "ADM"
          : d.code === "DRV" ? "LOG"
          : "ADM";
        return { ...d, departmentId: deptMap[deptCode] || null };
      });

      await tx.insert(designations).values(desigRows).onConflictDoNothing();

      const deptNames = SL_DEPARTMENTS.map(d => d.name);
      const desigNames = SL_DESIGNATIONS.map(d => d.name);
      const empList = buildEmployees(branchIds, shiftIds, deptNames, desigNames);
      await tx.insert(employees).values(empList).onConflictDoNothing();

      const holidayRows = SL_HOLIDAYS_2026.map(h => ({ ...h, type: h.type as "national" | "religious" | "optional" }));
      await tx.insert(holidays).values(holidayRows).onConflictDoNothing();

      const [existingSetting] = await tx.select().from(systemSettings);
      if (existingSetting) {
        await tx.update(systemSettings).set({
          organizationName: "Sri Lanka Post",
          organizationCode: "SLP",
          timezone: "Asia/Colombo",
          workingDays: JSON.stringify(["monday","tuesday","wednesday","thursday","friday","saturday"]),
          updatedAt: new Date(),
        }).where(eq(systemSettings.id, existingSetting.id));
      } else {
        await tx.insert(systemSettings).values({
          organizationName: "Sri Lanka Post",
          organizationCode: "SLP",
          timezone: "Asia/Colombo",
          workingDays: JSON.stringify(["monday","tuesday","wednesday","thursday","friday","saturday"]),
        });
      }

      await tx.delete(attendanceRecords);
      const allEmps = await tx.select({ id: employees.id, branchId: employees.branchId }).from(employees);
      const attendanceBatch = buildAttendance(allEmps);
      for (let i = 0; i < attendanceBatch.length; i += 200) {
        await tx.insert(attendanceRecords).values(attendanceBatch.slice(i, i + 200));
      }
    });

    res.json({ success: true, message: "Sri Lanka Post mock data imported successfully (including attendance records)" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Failed to import mock data" });
  }
});

router.delete("/clear", async (_req, res) => {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(attendanceRecords);
      await tx.delete(employees);
      await tx.delete(designations);
      await tx.delete(departments);
      await tx.delete(shifts);
      await tx.delete(branches);
      await tx.delete(holidays);
    });
    res.json({ success: true, message: "All data cleared successfully" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Failed to clear data" });
  }
});

export default router;
