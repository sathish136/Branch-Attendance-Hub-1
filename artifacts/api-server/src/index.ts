import http from "http";
import app from "./app";
import admsApp from "./adms-server";
import { pool } from "@workspace/db";

const port = Number(process.env["PORT"]) || 3000;
const admsPort = 3333;

async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS biometric_devices (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        serial_number TEXT NOT NULL UNIQUE,
        model TEXT NOT NULL DEFAULT 'ZKTeco',
        ip_address TEXT NOT NULL DEFAULT '',
        port INTEGER NOT NULL DEFAULT 4370,
        branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
        push_method TEXT NOT NULL DEFAULT 'zkpush',
        api_key TEXT,
        status TEXT NOT NULL DEFAULT 'offline',
        last_sync TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS biometric_logs (
        id SERIAL PRIMARY KEY,
        device_id INTEGER NOT NULL REFERENCES biometric_devices(id) ON DELETE CASCADE,
        employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        biometric_id TEXT NOT NULL,
        punch_time TIMESTAMP NOT NULL,
        punch_type TEXT NOT NULL DEFAULT 'unknown',
        processed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Ensure composite unique index: same PIN allowed across different branches
    await client.query(`DROP INDEX IF EXISTS employees_biometric_id_unique;`);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS employees_biometric_branch_unique
      ON employees (biometric_id, branch_id)
      WHERE biometric_id IS NOT NULL;
    `);

    // Ensure unique attendance record per employee per day
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_emp_date_unique
      ON attendance_records (employee_id, date);
    `);

    console.log("[DB] Biometric tables ensured.");
  } catch (err) {
    console.error("[DB] Could not ensure biometric tables:", err);
  } finally {
    client.release();
  }
}

async function start() {
  await ensureTables();

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  const admsServer = http.createServer(admsApp);
  admsServer.listen(admsPort, () => {
    console.log(`ADMS (ZKTeco Push) server listening on port ${admsPort}`);
  });
}

start();
