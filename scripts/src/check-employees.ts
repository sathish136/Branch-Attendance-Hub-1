import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  const { rows } = await client.query(
    `SELECT e.id, e.employee_id, e.biometric_id, e.full_name, b.code as branch_code, b.type as branch_type, pb.code as parent_code
     FROM employees e
     JOIN branches b ON b.id = e.branch_id
     LEFT JOIN branches pb ON pb.id = b.parent_id
     ORDER BY e.id`
  );
  console.log(JSON.stringify(rows, null, 2));
  client.release();
  await pool.end();
}
main().catch(console.error);
