import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    // Find employees with no biometric ID — their emp IDs were set by old sequential patch
    const { rows } = await client.query(
      `SELECT id, employee_id, biometric_id, full_name FROM employees WHERE biometric_id IS NULL OR biometric_id = ''`
    );
    console.log("Employees without biometric ID:", JSON.stringify(rows, null, 2));

    if (rows.length === 0) {
      console.log("None found.");
      return;
    }

    // Reset their employee IDs to a placeholder so they must be manually set
    await client.query("BEGIN");
    for (const emp of rows) {
      // Use TEMP prefix so the user can update via the UI
      const tempId = `NOID-${emp.id}`;
      await client.query(`UPDATE employees SET employee_id = $1 WHERE id = $2`, [tempId, emp.id]);
      console.log(`  #${emp.id} "${emp.full_name}": ${emp.employee_id} → ${tempId}`);
    }
    await client.query("COMMIT");
    console.log("\nDone. These employees need their Employee ID and Biometric ID set manually.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
