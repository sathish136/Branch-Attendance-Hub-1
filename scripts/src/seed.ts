import { db } from "@workspace/db";
import {
  branches, employees, shifts, attendanceRecords,
  systemUsers, systemSettings, holidays, biometricLogs, biometricDevices
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

  await db.delete(attendanceRecords);
  await db.delete(biometricLogs);
  await db.delete(biometricDevices);
  await db.delete(employees);
  await db.delete(shifts);
  await db.delete(systemUsers);
  await db.delete(holidays);
  await db.delete(branches);
  await db.delete(systemSettings);

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

  await db.insert(holidays).values([
    { name: "New Year",                  date: "2026-01-01", type: "national" },
    { name: "Independence Day",          date: "2026-02-04", type: "national" },
    { name: "Poya Day",                  date: "2026-03-03", type: "religious" },
    { name: "Sinhala & Tamil New Year",  date: "2026-04-13", type: "national" },
    { name: "May Day",                   date: "2026-05-01", type: "national" },
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

  // 14 Official Regional Administrative Offices
  const regionalData = [
    { no: "01", code: "KG", name: "Kurunegala Regional Administrative Office",   address: "Kurunegala",   phone: "+94-37-2222000", manager: "Ms. Sandya Rathnayake" },
    { no: "02", code: "BC", name: "Batticaloa Regional Administrative Office",    address: "Batticaloa",   phone: "+94-65-2222000", manager: "Mr. Mohamed Rashid" },
    { no: "03", code: "JA", name: "Jaffna Regional Administrative Office",        address: "Jaffna",       phone: "+94-21-2222000", manager: "Mr. Krishnan Rajan" },
    { no: "04", code: "AD", name: "Anuradhapura Regional Administrative Office",  address: "Anuradhapura", phone: "+94-25-2222000", manager: "Mr. Gamini Herath" },
    { no: "05", code: "RN", name: "Rathnapura Regional Administrative Office",    address: "Rathnapura",   phone: "+94-45-2222000", manager: "Mr. Surendra Wickrama" },
    { no: "06", code: "MH", name: "Matara Regional Administrative Office",        address: "Matara",       phone: "+94-41-2222000", manager: "Ms. Nilushi Fernando" },
    { no: "07", code: "CW", name: "Puttalam Regional Administrative Office",      address: "Puttalam",     phone: "+94-32-2222000", manager: "Ms. Tharanga Gunawardena" },
    { no: "08", code: "BD", name: "Badulla Regional Administrative Office",       address: "Badulla",      phone: "+94-55-2222000", manager: "Ms. Priyanka Bandara" },
    { no: "09", code: "KE", name: "Kegalle Regional Administrative Office",       address: "Kegalle",      phone: "+94-35-2222000", manager: "Ms. Waruni Abeysekara" },
    { no: "10", code: "GL", name: "Galle Regional Administrative Office",         address: "Galle",        phone: "+94-91-2222000", manager: "Ms. Chamindi Jayawardena" },
    { no: "11", code: "KY", name: "Kandy Regional Administrative Office",         address: "Kandy",        phone: "+94-81-2223000", manager: "Mr. Nimal Perera" },
    { no: "12", code: "GQ", name: "Gampaha Regional Administrative Office",       address: "Gampaha",      phone: "+94-33-2222000", manager: "Mr. Roshan Wijesinghe" },
    { no: "13", code: "CO", name: "Colombo Regional Administrative Office",       address: "Colombo",      phone: "+94-11-2230000", manager: "Ms. Chamari Silva" },
    { no: "14", code: "KT", name: "Kalutara Regional Administrative Office",      address: "Kalutara",     phone: "+94-34-2222000", manager: "Mr. Asela Kumara" },
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

  const regionalByCode: Record<string, typeof regionalBranches[0]> = {};
  for (const rb of regionalBranches) regionalByCode[rb.code] = rb;

  // Official Sub-branches / Post Offices per Regional Administrative Office
  const subBranchData = [
    // KG - Kurunegala
    { name: "Kurunegala Post Office",              code: "KG-01", parentCode: "KG", address: "Kurunegala" },
    { name: "Kuliyapitiya Post Office",            code: "KG-02", parentCode: "KG", address: "Kuliyapitiya" },
    { name: "Polgahawela Post Office",             code: "KG-03", parentCode: "KG", address: "Polgahawela" },
    // BC - Batticaloa
    { name: "Batticaloa Post Office",              code: "BC-01", parentCode: "BC", address: "Batticaloa" },
    { name: "Ampara Post Office",                  code: "BC-02", parentCode: "BC", address: "Ampara" },
    { name: "Kalmunai Post Office",                code: "BC-03", parentCode: "BC", address: "Kalmunai" },
    { name: "Trincomalee Post Office",             code: "BC-04", parentCode: "BC", address: "Trincomalee" },
    // JA - Jaffna
    { name: "Jaffna Post Office",                  code: "JA-01", parentCode: "JA", address: "Jaffna" },
    { name: "Vavuniya Post Office",                code: "JA-02", parentCode: "JA", address: "Vavuniya" },
    { name: "Kilinochchi Post Office",             code: "JA-03", parentCode: "JA", address: "Kilinochchi" },
    { name: "Mannar Post Office",                  code: "JA-04", parentCode: "JA", address: "Mannar" },
    // AD - Anuradhapura
    { name: "Anuradhapura Post Office",            code: "AD-01", parentCode: "AD", address: "Anuradhapura" },
    // RN - Rathnapura
    { name: "Rathnapura Post Office",              code: "RN-01", parentCode: "RN", address: "Rathnapura" },
    { name: "Balangoda Post Office",               code: "RN-02", parentCode: "RN", address: "Balangoda" },
    // MH - Matara
    { name: "Matara Post Office",                  code: "MH-01", parentCode: "MH", address: "Matara" },
    { name: "Tangalle Post Office",                code: "MH-02", parentCode: "MH", address: "Tangalle" },
    { name: "Hambantota Post Office",              code: "MH-03", parentCode: "MH", address: "Hambantota" },
    // CW - Puttalam
    { name: "Puttalam Post Office",                code: "CW-01", parentCode: "CW", address: "Puttalam" },
    { name: "Chilaw Post Office",                  code: "CW-02", parentCode: "CW", address: "Chilaw" },
    // BD - Badulla
    { name: "Bandarawela Post Office",             code: "BD-01", parentCode: "BD", address: "Bandarawela" },
    { name: "Monaragala Post Office",              code: "BD-02", parentCode: "BD", address: "Monaragala" },
    // KE - Kegalle
    { name: "Kegalle Post Office",                 code: "KE-01", parentCode: "KE", address: "Kegalle" },
    // GL - Galle
    { name: "Galle Post Office",                   code: "GL-01", parentCode: "GL", address: "Galle" },
    { name: "Ambalangoda Post Office",             code: "GL-02", parentCode: "GL", address: "Ambalangoda" },
    // KY - Kandy
    { name: "Matale Post Office",                  code: "KY-01", parentCode: "KY", address: "Matale" },
    { name: "Nuwara Eliya Post Office",            code: "KY-02", parentCode: "KY", address: "Nuwara Eliya" },
    { name: "Gampola Post Office",                 code: "KY-03", parentCode: "KY", address: "Gampola" },
    { name: "Peradeniya Post Office",              code: "KY-04", parentCode: "KY", address: "Peradeniya" },
    { name: "Nawalapitiya Post Office",            code: "KY-05", parentCode: "KY", address: "Nawalapitiya" },
    // GQ - Gampaha
    { name: "Gampaha Post Office",                 code: "GQ-01", parentCode: "GQ", address: "Gampaha" },
    { name: "Kelaniya Post Office",                code: "GQ-02", parentCode: "GQ", address: "Kelaniya" },
    { name: "Negombo Post Office",                 code: "GQ-03", parentCode: "GQ", address: "Negombo" },
    { name: "Veyangoda Post Office",               code: "GQ-04", parentCode: "GQ", address: "Veyangoda" },
    { name: "Stamp Bureau Sub Counter (BIA)",      code: "GQ-05", parentCode: "GQ", address: "Bandaranayake International Airport" },
    // CO - Colombo
    { name: "Moratuwa Post Office",                code: "CO-01", parentCode: "CO", address: "Moratuwa" },
    { name: "Borella Post Office",                 code: "CO-02", parentCode: "CO", address: "Borella" },
    { name: "Havelock Town Post Office",           code: "CO-03", parentCode: "CO", address: "Havelock Town" },
    { name: "Mount Lavinia Post Office",           code: "CO-04", parentCode: "CO", address: "Mount Lavinia" },
    { name: "Main Post Office (Pettah)",           code: "CO-05", parentCode: "CO", address: "Pettah, Colombo" },
    { name: "Nugegoda Post Office",                code: "CO-06", parentCode: "CO", address: "Nugegoda" },
    { name: "Cinnamon Garden Post Office",         code: "CO-07", parentCode: "CO", address: "Cinnamon Garden" },
    { name: "Dehiwala Post Office",                code: "CO-08", parentCode: "CO", address: "Dehiwala" },
    { name: "Kotahena Post Office",                code: "CO-09", parentCode: "CO", address: "Kotahena" },
    { name: "Wellawatta Post Office",              code: "CO-10", parentCode: "CO", address: "Wellawatta" },
    { name: "Seethawakapura Post Office",          code: "CO-11", parentCode: "CO", address: "Seethawakapura" },
    { name: "Battaramulla Post Office",            code: "CO-12", parentCode: "CO", address: "Battaramulla" },
    // KT - Kalutara
    { name: "Horana Post Office",                  code: "KT-01", parentCode: "KT", address: "Horana" },
    { name: "Panadura Post Office",                code: "KT-02", parentCode: "KT", address: "Panadura" },
    { name: "Kalutara Post Office",                code: "KT-03", parentCode: "KT", address: "Kalutara" },
  ];

  const subBranches = await db.insert(branches).values(
    subBranchData.map(s => ({
      name: s.name,
      code: s.code,
      type: "sub_branch" as const,
      parentId: regionalByCode[s.parentCode].id,
      address: s.address,
      isActive: true,
    }))
  ).returning();

  // Shifts
  const [shift1, shift2, shift3, shift4] = await db.insert(shifts).values([
    { name: "Morning Shift", type: "normal", startTime1: "08:00", endTime1: "16:30", graceMinutes: 15, overtimeThreshold: 60, isActive: true },
    { name: "Day Shift",     type: "normal", startTime1: "09:00", endTime1: "17:30", graceMinutes: 15, overtimeThreshold: 60, isActive: true },
    { name: "Split Shift A", type: "split",  startTime1: "08:00", endTime1: "12:00", startTime2: "13:00", endTime2: "17:00", graceMinutes: 10, overtimeThreshold: 60, isActive: true },
    { name: "Counter Shift", type: "normal", startTime1: "07:30", endTime1: "15:30", graceMinutes: 10, overtimeThreshold: 60, isActive: true },
  ]).returning();

  const firstNames = ["Priya","Nuwan","Kasun","Dilshan","Tharindu","Chamara","Sachith","Ruwani","Malsha","Lasith","Amaya","Dineth","Hiruni","Supun","Nadeesha","Chathura","Sewwandi","Asitha","Thilanka","Kanchana","Mahesh","Isuru","Saman","Dilini","Sanduni","Gayan","Chamath","Hasini","Ranil","Shehan"];
  const lastNames  = ["Fernando","Silva","Perera","Jayawardena","Bandara","Wijesinghe","Herath","Gunawardena","Rathnayake","Wickramasinghe","Kumara","Dissanayake","Senanayake","Karunaratne","Amarasinghe","Weerasekara","Pathirana","Jayasinghe","Mendis","Siriwardena"];
  const designations = ["Postmaster","Assistant Postmaster","Postal Officer","Counter Clerk","Delivery Agent","Sorting Officer","Data Entry Operator","Driver","Security Officer","Supervisor"];
  const departments  = ["Operations","Counter Services","Delivery","Finance","Administration","IT","Security"];

  const regionSeq: Record<string, number> = {};
  function nextEmpId(regionCode: string): string {
    regionSeq[regionCode] = (regionSeq[regionCode] || 0) + 1;
    return `${regionCode}${String(regionSeq[regionCode]).padStart(3, "0")}`;
  }

  const shifts4 = [shift1.id, shift2.id, shift3.id, shift4.id];
  const empData: any[] = [];
  let nameIdx = 0;

  // Head Office employees
  for (let i = 0; i < 10; i++) {
    const fn = firstNames[nameIdx % firstNames.length];
    const ln = lastNames[nameIdx % lastNames.length];
    empData.push({
      employeeId: nextEmpId("HO"),
      fullName: `${fn} ${ln}`,
      designation: designations[nameIdx % designations.length],
      department: departments[nameIdx % departments.length],
      branchId: ho.id,
      shiftId: shifts4[nameIdx % 4],
      joiningDate: `${2020 + (nameIdx % 5)}-${String((nameIdx % 12) + 1).padStart(2, "0")}-15`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${nameIdx + 1}@slpost.lk`,
      phone: `+94-7${1 + (nameIdx % 7)}-${String(1000000 + nameIdx * 7).slice(0, 7)}`,
      biometricId: `BIO-${String(nameIdx + 1).padStart(4, "0")}`,
      status: "active" as const,
    });
    nameIdx++;
  }

  // Regional office employees (6 per regional office)
  for (const rb of regionalBranches) {
    for (let i = 0; i < 6; i++) {
      const fn = firstNames[nameIdx % firstNames.length];
      const ln = lastNames[nameIdx % lastNames.length];
      empData.push({
        employeeId: nextEmpId(rb.code),
        fullName: `${fn} ${ln}`,
        designation: designations[nameIdx % designations.length],
        department: departments[nameIdx % departments.length],
        branchId: rb.id,
        shiftId: shifts4[nameIdx % 4],
        joiningDate: `${2020 + (nameIdx % 5)}-${String((nameIdx % 12) + 1).padStart(2, "0")}-15`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}${nameIdx + 1}@slpost.lk`,
        phone: `+94-7${1 + (nameIdx % 7)}-${String(1000000 + nameIdx * 7).slice(0, 7)}`,
        biometricId: `BIO-${String(nameIdx + 1).padStart(4, "0")}`,
        status: "active" as const,
      });
      nameIdx++;
    }
  }

  // Sub-branch employees (4 per sub-branch, IDs prefixed with their regional code)
  const subBranchFull = subBranchData.map((s, idx) => ({ ...s, id: subBranches[idx].id }));
  for (const sb of subBranchFull) {
    for (let i = 0; i < 4; i++) {
      const fn = firstNames[nameIdx % firstNames.length];
      const ln = lastNames[nameIdx % lastNames.length];
      empData.push({
        employeeId: nextEmpId(sb.parentCode),
        fullName: `${fn} ${ln}`,
        designation: designations[nameIdx % designations.length],
        department: departments[nameIdx % departments.length],
        branchId: sb.id,
        shiftId: shifts4[nameIdx % 4],
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
  const statuses: ("present" | "absent" | "late" | "half_day" | "leave")[] = [
    "present","present","present","present","present","present","present","late","absent","half_day","leave",
  ];
  const attendanceBatch: any[] = [];

  for (let d = 29; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    if (date.getDay() === 0) continue;

    const dateStr = date.toISOString().split("T")[0];
    for (const emp of createdEmployees.slice(0, 100)) {
      const st = statuses[Math.floor(Math.random() * statuses.length)];
      const inHour = st === "late" ? 8 + Math.floor(Math.random() * 2) : 8;
      const inMin  = st === "late" ? 20 + Math.floor(Math.random() * 40) : Math.floor(Math.random() * 10);
      const inTime1 = (st === "present" || st === "late") ? `${String(inHour).padStart(2,"0")}:${String(inMin).padStart(2,"0")}` : null;
      const outMin = 30 + Math.floor(Math.random() * 60);
      const actualOutTime = outMin >= 60 ? `17:${String(outMin-60).padStart(2,"0")}` : `16:${String(outMin).padStart(2,"0")}`;
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

  // System users — one regional admin per major region
  const coRegional = regionalByCode["CO"];
  const coSubIds   = subBranches.filter((_, i) => subBranchData[i].parentCode === "CO").map(s => s.id);
  const kgRegional = regionalByCode["KG"];
  const kgSubIds   = subBranches.filter((_, i) => subBranchData[i].parentCode === "KG").map(s => s.id);
  const kyRegional = regionalByCode["KY"];
  const kySubIds   = subBranches.filter((_, i) => subBranchData[i].parentCode === "KY").map(s => s.id);

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
      username: "colombo",
      fullName: "Colombo Regional Admin",
      email: "colombo@slpost.lk",
      passwordHash: hashPassword("colombo123"),
      role: "regional_admin",
      branchIds: JSON.stringify([coRegional.id, ...coSubIds]),
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
      username: "kandy",
      fullName: "Kandy Regional Admin",
      email: "kandy@slpost.lk",
      passwordHash: hashPassword("kandy123"),
      role: "regional_admin",
      branchIds: JSON.stringify([kyRegional.id, ...kySubIds]),
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
  console.log("Seeding complete!");
  console.log(`  ${totalBranches} branches (1 HO + ${regionalBranches.length} Regional + ${subBranches.length} Sub-branches)`);
  console.log(`  ${createdEmployees.length} employees`);
  console.log(`  ${attendanceBatch.length} attendance records`);
  console.log("  Regional Key Codes: KG, BC, JA, AD, RN, MH, CW, BD, KE, GL, KY, GQ, CO, KT");
  console.log("  Employee ID format: KG001, BC001, CO001... (regional code + 3-digit sequence)");
  console.log("  Logins: admin/admin123, colombo/colombo123, kurunegala/kurunegala123, kandy/kandy123, viewer/viewer123");
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
