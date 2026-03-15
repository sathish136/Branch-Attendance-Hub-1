import { Router } from "express";
import { db } from "@workspace/db";
import { employees, branches, shifts } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

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
    const body = { ...req.body };
    if (body.firstName && body.lastName) {
      body.fullName = `${body.firstName} ${body.lastName}`;
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
    const body = { ...req.body };
    if (body.firstName && body.lastName) {
      body.fullName = `${body.firstName} ${body.lastName}`;
    }
    const [emp] = await db.update(employees).set(body).where(eq(employees.id, Number(req.params.id))).returning();
    const [branch] = await db.select().from(branches).where(eq(branches.id, emp.branchId));
    res.json(mapEmp(emp, branch?.name || "", null));
  } catch (e) { console.error(e); res.status(500).json({ message: "Error", success: false }); }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(employees).where(eq(employees.id, Number(req.params.id)));
    res.json({ message: "Deleted", success: true });
  } catch (e) { res.status(500).json({ message: "Error", success: false }); }
});

router.post("/:id/documents", upload.fields([
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
