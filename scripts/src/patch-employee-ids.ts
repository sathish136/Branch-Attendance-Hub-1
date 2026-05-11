import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    console.log("Fetching all branches...");
    const { rows: allBranches } = await client.query(
      `SELECT id, code, type, parent_id FROM branches`
    );

    const branchMap: Record<number, any> = {};
    for (const b of allBranches) branchMap[b.id] = b;

    function getRegionalCode(branchId: number): string {
      const branch = branchMap[branchId];
      if (!branch) return "HO";
      if (branch.type === "head_office") return "HO";
      if (branch.type === "regional") return branch.code;
      if (branch.type === "sub_branch" && branch.parent_id) {
        const parent = branchMap[branch.parent_id];
        if (parent) return parent.code;
      }
      return branch.code;
    }

    console.log("Fetching all employees ordered by id...");
    const { rows: allEmployees } = await client.query(
      `SELECT id, employee_id, biometric_id, branch_id FROM employees ORDER BY id ASC`
    );

    console.log(`Found ${allEmployees.length} employees. Computing new IDs...`);

    const updates: Array<{ id: number; oldId: string; newId: string }> = [];

    for (const emp of allEmployees) {
      const prefix = getRegionalCode(emp.branch_id).toUpperCase();

      let rawBioId = (emp.biometric_id || "").trim();
      // Strip non-numeric prefix like "BIO-" to extract the number
      const numericMatch = rawBioId.match(/(\d+)$/);
      const numericBioId = numericMatch ? numericMatch[1] : null;

      if (!numericBioId) {
        console.log(`  #${emp.id}: Skipped (no numeric biometric ID) — current: ${emp.employee_id}`);
        continue;
      }

      const newId = `${prefix}${numericBioId}`;

      if (emp.employee_id !== newId) {
        updates.push({ id: emp.id, oldId: emp.employee_id, newId });
      }
    }

    if (updates.length === 0) {
      console.log("All employee IDs are already up to date.");
      return;
    }

    console.log(`\nUpdating ${updates.length} employee IDs...\n`);

    await client.query("BEGIN");

    // Pass 1: set temp IDs to avoid unique constraint conflicts
    for (const u of updates) {
      await client.query(
        `UPDATE employees SET employee_id = $1 WHERE id = $2`,
        [`__TEMP__${u.id}`, u.id]
      );
    }

    // Pass 2: set final correct IDs
    for (const u of updates) {
      await client.query(
        `UPDATE employees SET employee_id = $1 WHERE id = $2`,
        [u.newId, u.id]
      );
      console.log(`  #${u.id}: ${u.oldId} → ${u.newId}`);
    }

    await client.query("COMMIT");
    console.log(`\nDone! Updated ${updates.length} employee IDs.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Patch failed:", err);
  process.exit(1);
});
