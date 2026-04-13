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

    // Remove duplicate biometric_id employees — keep oldest (lowest id), reassign references first
    await client.query(`
      DO $$
      DECLARE
        dup RECORD;
        keeper_id INTEGER;
      BEGIN
        FOR dup IN
          SELECT biometric_id, MIN(id) AS keep_id
          FROM employees
          WHERE biometric_id IS NOT NULL
          GROUP BY biometric_id
          HAVING COUNT(*) > 1
        LOOP
          keeper_id := dup.keep_id;

          -- Reassign attendance records from duplicates to keeper
          UPDATE attendance_records
          SET employee_id = keeper_id
          WHERE employee_id IN (
            SELECT id FROM employees
            WHERE biometric_id = dup.biometric_id AND id <> keeper_id
          );

          -- Reassign payroll records from duplicates to keeper
          UPDATE payroll_records
          SET employee_id = keeper_id
          WHERE employee_id IN (
            SELECT id FROM employees
            WHERE biometric_id = dup.biometric_id AND id <> keeper_id
          );

          -- Relink biometric logs from duplicates to keeper
          UPDATE biometric_logs
          SET employee_id = keeper_id
          WHERE employee_id IN (
            SELECT id FROM employees
            WHERE biometric_id = dup.biometric_id AND id <> keeper_id
          );

          -- Delete the duplicate employees
          DELETE FROM employees
          WHERE biometric_id = dup.biometric_id AND id <> keeper_id;

        END LOOP;
      END $$;
    `);

    // Add unique partial index on biometric_id (prevents race-condition duplicates)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS employees_biometric_id_unique
      ON employees (biometric_id)
      WHERE biometric_id IS NOT NULL;
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
