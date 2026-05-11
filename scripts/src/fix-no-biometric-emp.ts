import { pool } from "@workspace/db";

async function main() {
  console.log("Connecting to DB...");
  let client: Awaited<ReturnType<typeof pool.connect>>;
  try {
    client = await pool.connect();
    console.log("Connected.");
  } catch (err) {
    console.error("DB connection failed:", err);
    process.exit(1);
  }

  try {
    const { rows } = await client.query(
      `SELECT id, employee_id, biometric_id, full_name FROM employees WHERE biometric_id IS NULL OR biometric_id = ''`
    );
    console.log(`Employees without biometric ID: ${rows.length} found`);

    if (rows.length === 0) {
      console.log("Nothing to fix — all employees have a biometric ID set.");
      return;
    }

    console.log(JSON.stringify(rows, null, 2));

    await client.query("BEGIN");
    for (const emp of rows) {
      const tempId = `JA-PENDING`;
      await client.query(`UPDATE employees SET employee_id = $1 WHERE id = $2`, [tempId, emp.id]);
      console.log(`  #${emp.id} "${emp.full_name}": ${emp.employee_id} → ${tempId}`);
    }
    await client.query("COMMIT");
    console.log("\nDone. Open each employee in the UI and set their Biometric ID to auto-generate the correct Employee ID.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
