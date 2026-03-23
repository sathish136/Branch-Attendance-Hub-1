import { db } from "@workspace/db";
import {
  branches, employees, shifts, attendanceRecords,
  systemUsers, systemSettings, holidays
} from "@workspace/db/schema";
import crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "salt_po_2024").digest("hex");
}

function calcWorkHours(t1: string, t2: string): number {
  const [h1, m1] = t1.split(":").map(Number);
  const [h2, m2] = t2.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
}

async function seed() {
  console.log("Seeding database...");

  // Clear existing
  await db.delete(attendanceRecords);
  await db.delete(employees);
  await db.delete(shifts);
  await db.delete(systemUsers);
  await db.delete(holidays);
  await db.delete(branches);
  await db.delete(systemSettings);

  // Settings
  await db.insert(systemSettings).values({
    organizationName: "Sri Lanka Post",
    organizationCode: "SLP",
    workingDays: JSON.stringify(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]),
    timezone: "Asia/Colombo",
    lateThresholdMinutes: 15,
    halfDayThresholdHours: 4,
    overtimeThresholdHours: 8,
    autoMarkAbsent: false,
    biometricSyncInterval: 5,
    zkPushServerUrl: "http://0.0.0.0:8765",
    zkPushApiKey: null,
  });

  // Holidays
  await db.insert(holidays).values([
    { name: "New Year", date: "2026-01-01", type: "national" },
    { name: "Independence Day", date: "2026-02-04", type: "national" },
    { name: "Poya Day", date: "2026-03-03", type: "religious" },
    { name: "Sinhala & Tamil New Year", date: "2026-04-13", type: "national" },
    { name: "May Day", date: "2026-05-01", type: "national" },
  ]);

  // Head Office
  const [ho] = await db.insert(branches).values({
    name: "Head Office - Colombo",
    code: "HO",
    type: "head_office",
    address: "310, D.R. Wijewardana Mawatha, Colombo 10",
    phone: "+94-11-2696200",
    managerName: "Mr. Pradeep Fernando",
    isActive: true,
  }).returning();

  // Regional Offices — each with a short Key Code used as employee ID prefix
  const regionalData = [
    { name: "Western Regional Office",       code: "WR", address: "Colombo",       phone: "+94-11-2230000", manager: "Ms. Chamari Silva" },
    { name: "Central Regional Office",       code: "CR", address: "Kandy",         phone: "+94-81-2223000", manager: "Mr. Nimal Perera" },
    { name: "Southern Regional Office",      code: "SR", address: "Galle",         phone: "+94-91-2222000", manager: "Ms. Dilrukshi Jayawardena" },
    { name: "Northern Regional Office",      code: "NR", address: "Jaffna",        phone: "+94-21-2222000", manager: "Mr. Krishnan Rajan" },
    { name: "Eastern Regional Office",       code: "ER", address: "Trincomalee",   phone: "+94-26-2222000", manager: "Mr. Mohamed Rashid" },
    { name: "Kurunegala Regional Office",    code: "KG", address: "Kurunegala",    phone: "+94-37-2222000", manager: "Ms. Sandya Rathnayake" },
    { name: "North Central Regional Office", code: "NC", address: "Anuradhapura",  phone: "+94-25-2222000", manager: "Mr. Gamini Herath" },
    { name: "Uva Regional Office",           code: "UV", address: "Badulla",       phone: "+94-55-2222000", manager: "Ms. Priyanka Bandara" },
    { name: "Sabaragamuwa Regional Office",  code: "SB", address: "Ratnapura",     phone: "+94-45-2222000", manager: "Mr. Surendra Wickrama" },
    { name: "Wayamba Regional Office",       code: "WY", address: "Puttalam",      phone: "+94-32-2222000", manager: "Ms. Tharanga Gunawardena" },
    { name: "Dambulla Regional Office",      code: "DB", address: "Dambulla",      phone: "+94-66-2222000", manager: "Mr. Asela Kumara" },
    { name: "Matara Regional Office",        code: "MT", address: "Matara",        phone: "+94-41-2222000", manager: "Ms. Nilushi Fernando" },
    { name: "Negombo Regional Office",       code: "NG", address: "Negombo",       phone: "+94-31-2222000", manager: "Mr. Roshan Wijesinghe" },
    { name: "Kegalle Regional Office",       code: "KE", address: "Kegalle",       phone: "+94-35-2222000", manager: "Ms. Waruni Abeysekara" },
  ];

  const regionalBranches = await db.insert(branches).values(
    regionalData.map(r => ({
      name: r.name,
      code: r.code,
      type: "regional" as const,
      parentId: ho.id,
      address: r.address,
      phone: r.phone,
      managerName: r.manager,
      isActive: true,
    }))
  ).returning();

  // Index regional branches by code for easy reference
  const regionalByCode: Record<string, typeof regionalBranches[0]> = {};
  for (const rb of regionalBranches) regionalByCode[rb.code] = rb;

  // Sub-branches grouped by their regional office key code
  const subBranchData = [
    // Western Regional (WR)
    { name: "Colombo 1 Post Office",       code: "WR-SB01", parentCode: "WR", address: "Colombo 01",    manager: "Mr. Ajith" },
    { name: "Colombo 3 Post Office",       code: "WR-SB02", parentCode: "WR", address: "Colombo 03",    manager: "Ms. Nadeeka" },
    { name: "Colombo 7 Post Office",       code: "WR-SB03", parentCode: "WR", address: "Colombo 07",    manager: "Mr. Suresh" },
    { name: "Nugegoda Post Office",        code: "WR-SB04", parentCode: "WR", address: "Nugegoda",      manager: "Ms. Iroshini" },
    // Central Regional (CR)
    { name: "Kandy Main Post Office",      code: "CR-SB01", parentCode: "CR", address: "Kandy",         manager: "Mr. Sampath" },
    { name: "Peradeniya Post Office",      code: "CR-SB02", parentCode: "CR", address: "Peradeniya",    manager: "Ms. Kumari" },
    { name: "Gampola Post Office",         code: "CR-SB03", parentCode: "CR", address: "Gampola",       manager: "Mr. Ranjith" },
    // Southern Regional (SR)
    { name: "Galle Main Post Office",      code: "SR-SB01", parentCode: "SR", address: "Galle",         manager: "Ms. Chamindi" },
    { name: "Matara Post Office",          code: "SR-SB02", parentCode: "SR", address: "Matara",        manager: "Mr. Prasad" },
    // Kurunegala Regional (KG)
    { name: "Kurunegala Post Office",      code: "KG-SB01", parentCode: "KG", address: "Kurunegala",    manager: "Mr. Bandara" },
    { name: "Kuliyapitiya Post Office",    code: "KG-SB02", parentCode: "KG", address: "Kuliyapitiya",  manager: "Ms. Jayasinghe" },
    { name: "Polgahawela Post Office",     code: "KG-SB03", parentCode: "KG", address: "Polgahawela",   manager: "Mr. Dissanayake" },
    // North Central Regional (NC)
    { name: "Anuradhapura Post Office",    code: "NC-SB01", parentCode: "NC", address: "Anuradhapura",  manager: "Ms. Nanayakkara" },
    { name: "Polonnaruwa Post Office",     code: "NC-SB02", parentCode: "NC", address: "Polonnaruwa",   manager: "Mr. Weerasekara" },
    // Uva Regional (UV)
    { name: "Badulla Post Office",         code: "UV-SB01", parentCode: "UV", address: "Badulla",       manager: "Mr. Siriwardena" },
    { name: "Monaragala Post Office",      code: "UV-SB02", parentCode: "UV", address: "Monaragala",    manager: "Ms. Pathirana" },
    // Northern Regional (NR)
    { name: "Jaffna Main Post Office",     code: "NR-SB01", parentCode: "NR", address: "Jaffna",        manager: "Mr. Balasingham" },
    { name: "Vavuniya Post Office",        code: "NR-SB02", parentCode: "NR", address: "Vavuniya",      manager: "Ms. Tharmalingam" },
    // Eastern Regional (ER)
    { name: "Trincomalee Post Office",     code: "ER-SB01", parentCode: "ER", address: "Trincomalee",   manager: "Mr. Razeek" },
    { name: "Batticaloa Post Office",      code: "ER-SB02", parentCode: "ER", address: "Batticaloa",    manager: "Ms. Muthukumar" },
    // Negombo Regional (NG)
    { name: "Negombo Post Office",         code: "NG-SB01", parentCode: "NG", address: "Negombo",       manager: "Mr. Perera" },
    { name: "Katunayake Post Office",      code: "NG-SB02", parentCode: "NG", address: "Katunayake",    manager: "Ms. Wijeratne" },
    // Kegalle Regional (KE)
    { name: "Kegalle Post Office",         code: "KE-SB01", parentCode: "KE", address: "Kegalle",       manager: "Mr. Alwis" },
    { name: "Mawanella Post Office",       code: "KE-SB02", parentCode: "KE", address: "Mawanella",     manager: "Ms. Karunaratne" },
    // Sabaragamuwa Regional (SB)
    { name: "Ratnapura Post Office",       code: "SB-SB01", parentCode: "SB", address: "Ratnapura",     manager: "Mr. Jayaweera" },
    // Wayamba Regional (WY)
    { name: "Puttalam Post Office",        code: "WY-SB01", parentCode: "WY", address: "Puttalam",      manager: "Ms. Wanigatunga" },
    // Dambulla Regional (DB)
    { name: "Dambulla Post Office",        code: "DB-SB01", parentCode: "DB", address: "Dambulla",      manager: "Mr. Ekanayake" },
    // Matara Regional (MT)
    { name: "Matara Main Post Office",     code: "MT-SB01", parentCode: "MT", address: "Matara",        manager: "Ms. Senanayake" },
    { name: "Weligama Post Office",        code: "MT-SB02", parentCode: "MT", address: "Weligama",      manager: "Mr. Thilakasiri" },
  ];

  const subBranches = await db.insert(branches).values(
    subBranchData.map(s => ({
      name: s.name,
      code: s.code,
      type: "sub_branch" as const,
      parentId: regionalByCode[s.parentCode].id,
      address: s.address,
      managerName: s.manager,
      isActive: true,
    }))
  ).returning();

  // Shifts
  const [shift1, shift2, shift3] = await db.insert(shifts).values([
    { name: "Morning Shift",  type: "normal", startTime1: "08:00", endTime1: "16:30", graceMinutes: 15, overtimeThreshold: 60, isActive: true },
    { name: "Day Shift",      type: "normal", startTime1: "09:00", endTime1: "17:30", graceMinutes: 15, overtimeThreshold: 60, isActive: true },
    { name: "Split Shift A",  type: "split",  startTime1: "08:00", endTime1: "12:00", startTime2: "13:00", endTime2: "17:00", graceMinutes: 10, overtimeThreshold: 60, isActive: true },
    { name: "Counter Shift",  type: "normal", startTime1: "07:30", endTime1: "15:30", graceMinutes: 10, overtimeThreshold: 60, isActive: true },
  ]).returning();

  const firstNames = ["Priya", "Nuwan", "Kasun", "Dilshan", "Tharindu", "Chamara", "Sachith", "Ruwani", "Malsha", "Lasith", "Amaya", "Dineth", "Hiruni", "Supun", "Nadeesha", "Chathura", "Sewwandi", "Asitha", "Thilanka", "Kanchana"];
  const lastNames  = ["Fernando", "Silva", "Perera", "Jayawardena", "Bandara", "Wijesinghe", "Herath", "Gunawardena", "Rathnayake", "Wickramasinghe", "Kumara", "Dissanayake", "Senanayake", "Karunaratne", "Amarasinghe"];
  const designations = ["Postmaster", "Assistant Postmaster", "Postal Officer", "Counter Clerk", "Delivery Agent", "Sorting Officer", "Data Entry Operator", "Driver", "Security Officer", "Supervisor"];
  const departments  = ["Operations", "Counter Services", "Delivery", "Finance", "Administration", "IT", "Security"];

  // Build employee list — IDs use the regional key code as prefix, unique per region
  // Track per-region sequence numbers
  const regionSeq: Record<string, number> = {};

  function nextEmpId(regionCode: string): string {
    regionSeq[regionCode] = (regionSeq[regionCode] || 0) + 1;
    return `${regionCode}${String(regionSeq[regionCode]).padStart(3, "0")}`;
  }

  const empData: any[] = [];
  let nameIdx = 0;

  // Head Office employees — use "HO" prefix
  const hoCount = 12;
  for (let i = 0; i < hoCount; i++) {
    const fn = firstNames[nameIdx % firstNames.length];
    const ln = lastNames[nameIdx % lastNames.length];
    empData.push({
      employeeId: nextEmpId("HO"),
      fullName: `${fn} ${ln}`,
      designation: designations[nameIdx % designations.length],
      department: departments[nameIdx % departments.length],
      branchId: ho.id,
      shiftId: [shift1.id, shift2.id, shift3.id][nameIdx % 3],
      joiningDate: `${2020 + (nameIdx % 5)}-${String((nameIdx % 12) + 1).padStart(2, "0")}-15`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${nameIdx + 1}@slpost.lk`,
      phone: `+94-7${1 + (nameIdx % 7)}-${String(1000000 + nameIdx * 7).slice(0, 7)}`,
      biometricId: `BIO-${String(nameIdx + 1).padStart(4, "0")}`,
      status: "active" as const,
    });
    nameIdx++;
  }

  // Regional office employees
  for (const rb of regionalBranches) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const fn = firstNames[nameIdx % firstNames.length];
      const ln = lastNames[nameIdx % lastNames.length];
      empData.push({
        employeeId: nextEmpId(rb.code),
        fullName: `${fn} ${ln}`,
        designation: designations[nameIdx % designations.length],
        department: departments[nameIdx % departments.length],
        branchId: rb.id,
        shiftId: [shift1.id, shift2.id, shift3.id][nameIdx % 3],
        joiningDate: `${2020 + (nameIdx % 5)}-${String((nameIdx % 12) + 1).padStart(2, "0")}-15`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}${nameIdx + 1}@slpost.lk`,
        phone: `+94-7${1 + (nameIdx % 7)}-${String(1000000 + nameIdx * 7).slice(0, 7)}`,
        biometricId: `BIO-${String(nameIdx + 1).padStart(4, "0")}`,
        status: "active" as const,
      });
      nameIdx++;
    }
  }

  // Sub-branch employees — use their parent regional code as prefix
  const subBranchFull = subBranchData.map((s, idx) => ({ ...s, id: subBranches[idx].id }));
  for (const sb of subBranchFull) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const fn = firstNames[nameIdx % firstNames.length];
      const ln = lastNames[nameIdx % lastNames.length];
      empData.push({
        employeeId: nextEmpId(sb.parentCode),
        fullName: `${fn} ${ln}`,
        designation: designations[nameIdx % designations.length],
        department: departments[nameIdx % departments.length],
        branchId: sb.id,
        shiftId: [shift1.id, shift2.id, shift3.id][nameIdx % 3],
        joiningDate: `${2020 + (nameIdx % 5)}-${String((nameIdx % 12) + 1).padStart(2, "0")}-15`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}${nameIdx + 1}@slpost.lk`,
        phone: `+94-7${1 + (nameIdx % 7)}-${String(1000000 + nameIdx * 7).slice(0, 7)}`,
        biometricId: `BIO-${String(nameIdx + 1).padStart(4, "0")}`,
        status: "active" as const,
      });
      nameIdx++;
    }
  }

  const createdEmployees = await db.insert(employees).values(empData).returning();

  // Attendance for last 30 days
  const today = new Date();
  const statuses: ("present" | "absent" | "late" | "half_day" | "leave")[] = ["present", "present", "present", "present", "present", "present", "present", "late", "absent", "half_day", "leave"];
  const attendanceBatch: any[] = [];

  for (let d = 29; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) continue; // Skip Sunday

    const dateStr = date.toISOString().split("T")[0];
    for (const emp of createdEmployees.slice(0, 80)) {
      const st = statuses[Math.floor(Math.random() * statuses.length)];
      const inHour = st === "late" ? 8 + Math.floor(Math.random() * 2) : 8;
      const inMin  = st === "late" ? 20 + Math.floor(Math.random() * 40) : Math.floor(Math.random() * 10);
      const inTime1 = (st === "present" || st === "late") ? `${String(inHour).padStart(2, "0")}:${String(inMin).padStart(2, "0")}` : null;
      const outMin = 30 + Math.floor(Math.random() * 60);
      const actualOutTime = outMin >= 60 ? `17:${String(outMin - 60).padStart(2, "0")}` : `16:${String(outMin).padStart(2, "0")}`;
      const wh1 = inTime1 ? calcWorkHours(inTime1, actualOutTime) : null;
      const ot  = wh1 && wh1 > 8 ? wh1 - 8 : 0;
      attendanceBatch.push({
        employeeId: emp.id,
        branchId: emp.branchId,
        date: dateStr,
        status: st,
        inTime1,
        outTime1: inTime1 ? actualOutTime : null,
        workHours1: wh1,
        totalHours: wh1,
        overtimeHours: ot > 0 ? ot : null,
        source: "biometric" as const,
      });
    }
  }

  const batchSize = 200;
  for (let i = 0; i < attendanceBatch.length; i += batchSize) {
    await db.insert(attendanceRecords).values(attendanceBatch.slice(i, i + batchSize));
  }

  // System users
  const kgRegional = regionalByCode["KG"];
  const kgSubIds   = subBranches.filter((_, i) => subBranchData[i].parentCode === "KG").map(s => s.id);
  const wrRegional = regionalByCode["WR"];
  const wrSubIds   = subBranches.filter((_, i) => subBranchData[i].parentCode === "WR").map(s => s.id);

  await db.insert(systemUsers).values([
    {
      username: "admin",
      fullName: "Super Administrator",
      email: "admin@slpost.lk",
      passwordHash: hashPassword("admin123"),
      role: "super_admin",
      branchIds: JSON.stringify([]),
      isActive: true,
    },
    {
      username: "western",
      fullName: "Western Regional Admin",
      email: "western@slpost.lk",
      passwordHash: hashPassword("western123"),
      role: "regional_admin",
      branchIds: JSON.stringify([wrRegional.id, ...wrSubIds]),
      isActive: true,
    },
    {
      username: "kurunegala",
      fullName: "Kurunegala Regional Admin",
      email: "kurunegala@slpost.lk",
      passwordHash: hashPassword("kurunegala123"),
      role: "regional_admin",
      branchIds: JSON.stringify([kgRegional.id, ...kgSubIds]),
      isActive: true,
    },
    {
      username: "viewer",
      fullName: "Report Viewer",
      email: "viewer@slpost.lk",
      passwordHash: hashPassword("viewer123"),
      role: "viewer",
      branchIds: JSON.stringify([ho.id]),
      isActive: true,
    },
  ]);

  const totalBranches = 1 + regionalBranches.length + subBranches.length;
  console.log("✅ Seeding complete!");
  console.log(`  ${totalBranches} branches (1 HO + ${regionalBranches.length} Regional + ${subBranches.length} Sub-branches)`);
  console.log(`  ${createdEmployees.length} employees`);
  console.log(`  ${attendanceBatch.length} attendance records`);
  console.log("  Regional Key Codes: WR, CR, SR, NR, ER, KG, NC, UV, SB, WY, DB, MT, NG, KE");
  console.log("  Example IDs: KG001 (Kurunegala Regional), KG009 (Polgahawela branch)");
  console.log("  Logins: admin/admin123, western/western123, kurunegala/kurunegala123, viewer/viewer123");
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
