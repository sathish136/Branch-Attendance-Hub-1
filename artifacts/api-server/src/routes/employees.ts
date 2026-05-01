import { Router } from "express";
import { db } from "@workspace/db";
import { employees, branches, shifts, attendanceRecords, payrollRecords, biometricLogs } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

const NULLABLE_DATE_FIELDS = ["dateOfBirth"];
const INT_FIELDS = ["branchId", "shiftId", "reportingManagerId"];

function sanitizeEmployeeBody(body: Record<string, any>) {
  const out = { ...body };
  // joiningDate is NOT NULL — default to today if missing
  if (!out.joiningDate || out.joiningDate === "") {
    out.joiningDate = new Date().toISOString().slice(0, 10);
  }
  // other date fields are nullable
  for (const f of NULLABLE_DATE_FIELDS) {
    if (out[f] === "" || out[f] === undefined) out[f] = null;
  }
  for (const f of INT_FIELDS) {
    if (out[f] === "" || out[f] === undefined) out[f] = null;
    else if (out[f] !== null) out[f] = Number(out[f]);
  }
  return out;
}

async function getRegionalInfo(branchId: number): Promise<{ regionalCode: string; regionalId: number; regionalName: string } | null> {
  const [branch] = await db.select().from(branches).where(eq(branches.id, branchId));
  if (!branch) return null;
  if (branch.type === "regional") {
    return { regionalCode: branch.code, regionalId: branch.id, regionalName: branch.name };
  }
  if (branch.type === "sub_branch" && branch.parentId) {
    const [parent] = await db.select().from(branches).where(eq(branches.id, branch.parentId));
    if (parent && parent.type === "regional") {
      return { regionalCode: parent.code, regionalId: parent.id, regionalName: parent.name };
    }
  }
  return null;
}

async function getBranchIdsInRegion(regionalId: number): Promise<number[]> {
  const allBranches = await db.select({ id: branches.id, parentId: branches.parentId, type: branches.type })
    .from(branches);
  const ids: number[] = [regionalId];
  for (const b of allBranches) {
    if (b.parentId === regionalId) ids.push(b.id);
  }
  return ids;
}

async function validateEmployeeId(
  employeeId: string,
  branchId: number,
  excludeEmpDbId?: number
): Promise<{ valid: boolean; message?: string }> {
  const regional = await getRegionalInfo(branchId);
  if (!regional) return { valid: true };

  const prefix = regional.regionalCode.toUpperCase();
  const empIdUpper = employeeId.toUpperCase();

  if (!empIdUpper.startsWith(prefix)) {
    return {
      valid: false,
      message: `Employee ID must start with regional code "${prefix}" (e.g. ${prefix}001). This branch belongs to the ${regional.regionalName} Regional Office.`,
    };
  }

  const branchIds = await getBranchIdsInRegion(regional.regionalId);
  const existing = await db.select({ id: employees.id, employeeId: employees.employeeId })
    .from(employees)
    .where(inArray(employees.branchId, branchIds));

  const duplicate = existing.find(
    e => e.employeeId.toUpperCase() === empIdUpper && e.id !== excludeEmpDbId
  );
  if (duplicate) {
    return {
      valid: false,
      message: `Employee ID "${employeeId}" is already used in the ${regional.regionalName} Regional Office. IDs must be unique across all its branches.`,
    };
  }

  return { valid: true };
}

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function mapEmp(emp: any, branchName: string, shiftName: string | null) {
  return {
    ...emp,
    branchName,
    shiftName: shiftName || null,
    fullName: emp.firstName && emp.lastName
      ? `${emp.firstName} ${emp.lastName}`
      : emp.fullName,
    createdAt: emp.createdAt?.toISOString?.() ?? emp.createdAt,
  };
}

router.get("/next-id", async (req, res) => {
  try {
    const branchId = Number(req.query.branchId);
    if (!branchId) { res.status(400).json({ message: "branchId required", success: false }); return; }
    const regional = await getRegionalInfo(branchId);
    if (!regional) {
      res.json({ prefix: "", nextId: "", regionalName: "", noRegional: true });
      return;
    }
    const prefix = regional.regionalCode.toUpperCase();
    const branchIds = await getBranchIdsInRegion(regional.regionalId);
    const existing = await db.select({ employeeId: employees.employeeId })
      .from(employees)
      .where(inArray(employees.branchId, branchIds));

    let maxNum = 0;
    for (const e of existing) {
      const id = e.employeeId.toUpperCase();
      if (id.startsWith(prefix)) {
        const numPart = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
      }
    }
    const nextNum = maxNum + 1;
    const nextId = `${prefix}${String(nextNum).padStart(3, "0")}`;
    res.json({ prefix, nextId, regionalName: regional.regionalName, regionalId: regional.regionalId });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

// POST /api/employees/sync-names
// Called by push.py or any external script to sync employee names from the device.
// Body: { users: [{ biometricId: string, name: string }] }
// or:   { biometricId: string, name: string }  (single user)
router.post("/sync-names", async (req, res) => {
  try {
    const body = req.body;
    const users: { biometricId: string; name: string }[] = Array.isArray(body.users)
      ? body.users
      : [{ biometricId: body.biometricId, name: body.name }];

    let updated = 0;
    for (const u of users) {
      if (!u.biometricId || !u.name) continue;
      const [emp] = await db.select().from(employees).where(eq(employees.biometricId, String(u.biometricId)));
      if (!emp) continue;
      await db.update(employees)
        .set({ fullName: u.name })
        .where(eq(employees.biometricId, String(u.biometricId)));
      updated++;
    }
    res.json({ success: true, updated });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.get("/", async (req, res) => {
  try {
    const { branchId, status, department, employeeType, search, page = "1", limit = "50" } = req.query;

    const all = await db.select({
      emp: employees,
      branchName: branches.name,
      shiftName: shifts.name,
    })
      .from(employees)
      .leftJoin(branches, eq(employees.branchId, branches.id))
      .leftJoin(shifts, eq(employees.shiftId, shifts.id));

    let filtered = all;
    if (branchId) filtered = filtered.filter(r => r.emp.branchId === Number(branchId));
    if (status) filtered = filtered.filter(r => r.emp.status === status);
    if (department) filtered = filtered.filter(r => r.emp.department === department);
    if (employeeType) filtered = filtered.filter(r => r.emp.employeeType === employeeType);
    if (search) {
      const s = (search as string).toLowerCase();
      filtered = filtered.filter(r =>
        r.emp.fullName.toLowerCase().includes(s) ||
        r.emp.employeeId.toLowerCase().includes(s) ||
        r.emp.designation.toLowerCase().includes(s) ||
        (r.emp.nicNumber || "").toLowerCase().includes(s) ||
        (r.emp.aadharNumber || "").toLowerCase().includes(s) ||
        (r.emp.panNumber || "").toLowerCase().includes(s) ||
        (r.emp.email || "").toLowerCase().includes(s)
      );
    }

    const total = filtered.length;
    const p = Number(page);
    const l = Number(limit);
    const paginated = filtered.slice((p - 1) * l, p * l);

    res.json({
      employees: paginated.map(r => mapEmp(r.emp, r.branchName || "", r.shiftName)),
      total,
      page: p,
      limit: l,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.post("/", async (req, res) => {
  try {
    const body = sanitizeEmployeeBody(req.body);
    if (body.firstName && body.lastName) {
      body.fullName = `${body.firstName} ${body.lastName}`;
    }
    const check = await validateEmployeeId(body.employeeId, Number(body.branchId));
    if (!check.valid) {
      res.status(422).json({ message: check.message, success: false, code: "INVALID_EMPLOYEE_ID" });
      return;
    }
    const [emp] = await db.insert(employees).values(body).returning();
    const [branch] = await db.select().from(branches).where(eq(branches.id, emp.branchId));
    res.status(201).json(mapEmp(emp, branch?.name || "", null));
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.get("/:id", async (req, res) => {
  try {
    const [row] = await db.select({
      emp: employees,
      branchName: branches.name,
      shiftName: shifts.name,
    }).from(employees)
      .leftJoin(branches, eq(employees.branchId, branches.id))
      .leftJoin(shifts, eq(employees.shiftId, shifts.id))
      .where(eq(employees.id, Number(req.params.id)));
    if (!row) { res.status(404).json({ message: "Not found", success: false }); return; }
    res.json(mapEmp(row.emp, row.branchName || "", row.shiftName));
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.put("/:id", async (req, res) => {
  try {
    const dbId = Number(req.params.id);
    const body = sanitizeEmployeeBody(req.body);
    if (body.firstName && body.lastName) {
      body.fullName = `${body.firstName} ${body.lastName}`;
    }
    if (body.employeeId && body.branchId) {
      const check = await validateEmployeeId(body.employeeId, Number(body.branchId), dbId);
      if (!check.valid) {
        res.status(422).json({ message: check.message, success: false, code: "INVALID_EMPLOYEE_ID" });
        return;
      }
    }
    const [emp] = await db.update(employees).set(body).where(eq(employees.id, dbId)).returning();
    const [branch] = await db.select().from(branches).where(eq(branches.id, emp.branchId));
    res.json(mapEmp(emp, branch?.name || "", null));
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const empId = Number(req.params.id);
    await db.delete(attendanceRecords).where(eq(attendanceRecords.employeeId, empId));
    await db.delete(payrollRecords).where(eq(payrollRecords.employeeId, empId));
    await db.update(biometricLogs).set({ employeeId: null }).where(eq(biometricLogs.employeeId, empId));
    await db.delete(employees).where(eq(employees.id, empId));
    res.json({ message: "Deleted", success: true });
  } catch (e: any) {
    console.error("Delete employee error:", e?.message || e);
    res.status(500).json({ message: e?.message || "Error deleting employee", success: false });
  }
});

router.post("/:id/documents", upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "aadharDoc", maxCount: 1 },
  { name: "panDoc", maxCount: 1 },
  { name: "certificatesDoc", maxCount: 1 },
  { name: "resumeDoc", maxCount: 1 },
]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const files = req.files as Record<string, Express.Multer.File[]>;
    const BASE = process.env.BASE_URL || "";

    const update: Record<string, string> = {};
    if (files?.photo?.[0])           update.photoUrl           = `${BASE}/api/employees/uploads/${files.photo[0].filename}`;
    if (files?.aadharDoc?.[0])       update.aadharDocUrl       = `${BASE}/api/employees/uploads/${files.aadharDoc[0].filename}`;
    if (files?.panDoc?.[0])          update.panDocUrl          = `${BASE}/api/employees/uploads/${files.panDoc[0].filename}`;
    if (files?.certificatesDoc?.[0]) update.certificatesDocUrl = `${BASE}/api/employees/uploads/${files.certificatesDoc[0].filename}`;
    if (files?.resumeDoc?.[0])       update.resumeDocUrl       = `${BASE}/api/employees/uploads/${files.resumeDoc[0].filename}`;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ message: "No files uploaded", success: false });
      return;
    }

    const [emp] = await db.update(employees).set(update).where(eq(employees.id, id)).returning();
    res.json({ success: true, employee: emp });
  } catch (e) { console.error(e); res.status(500).json({ message: "Error uploading documents", success: false }); }
});

router.get("/uploads/:filename", (req, res) => {
  const file = path.join(UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(file)) { res.status(404).json({ message: "File not found" }); return; }
  res.sendFile(file);
});

export default router;
