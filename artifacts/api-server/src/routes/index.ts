import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import branchesRouter from "./branches.js";
import employeesRouter from "./employees.js";
import shiftsRouter from "./shifts.js";
import attendanceRouter from "./attendance.js";
import reportsRouter from "./reports.js";
import biometricRouter from "./biometric.js";
import usersRouter from "./users.js";
import settingsRouter from "./settings.js";
import holidaysRouter from "./holidays.js";
import departmentsRouter from "./departments.js";
import designationsRouter from "./designations.js";
import mockDataRouter from "./mock-data.js";
import payrollRouter from "./payroll.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/branches", branchesRouter);
router.use("/employees", employeesRouter);
router.use("/shifts", shiftsRouter);
router.use("/attendance", attendanceRouter);
router.use("/reports", reportsRouter);
router.use("/biometric", biometricRouter);
router.use("/users", usersRouter);
router.use("/settings", settingsRouter);
router.use("/holidays", holidaysRouter);
router.use("/departments", departmentsRouter);
router.use("/designations", designationsRouter);
router.use("/mock-data", mockDataRouter);
router.use("/payroll", payrollRouter);

export default router;
