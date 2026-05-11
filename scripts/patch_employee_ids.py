# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
Patch employee IDs to match the format: {REGIONAL_CODE}{BIOMETRIC_ID}
e.g. biometric 25 at Ja-ela regional -> JA25

Reads DB connection from .env in the same directory or parent directories.
Usage:
    python scripts/patch_employee_ids.py
    python scripts/patch_employee_ids.py --fix-pending   # also reset no-biometric IDs to JA-PENDING
"""

import re
import sys
import os
from pathlib import Path

# -- Load .env ----------------------------------------------------------------

def load_env(start):
    for directory in [start] + list(start.parents):
        env_file = directory / ".env"
        if env_file.exists():
            print("  Loaded .env from: " + str(env_file))
            pairs = {}
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                pairs[key.strip()] = val.strip()
            return pairs
    return {}

env = load_env(Path(__file__).resolve().parent)
os.environ.update({k: v for k, v in env.items() if k not in os.environ})

# -- DB connection ------------------------------------------------------------

DEFAULT_DB_URL = "postgresql://colombo_user:wtt%40adm123@localhost:5432/colombo"

conn_str = (
    os.environ.get("COLOMBO_DB_URL") or
    os.environ.get("DATABASE_URL") or
    DEFAULT_DB_URL
)

print("  Using DB: " + conn_str.split("@")[-1])  # print host/db only, hide password

try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 not installed.")
    print("Run:  pip install psycopg2-binary")
    sys.exit(1)

# -- Helpers ------------------------------------------------------------------

def get_regional_code(branch_id, branch_map):
    branch = branch_map.get(branch_id)
    if not branch:
        return "HO"
    if branch["type"] == "head_office":
        return "HO"
    if branch["type"] == "regional":
        return branch["code"]
    if branch["type"] == "sub_branch" and branch["parent_id"]:
        parent = branch_map.get(branch["parent_id"])
        if parent:
            return parent["code"]
    return branch["code"] or "HO"

# -- Main ---------------------------------------------------------------------

fix_pending = "--fix-pending" in sys.argv

print("\nConnecting to DB...")
try:
    conn = psycopg2.connect(conn_str)
except Exception as e:
    print("ERROR: Could not connect: " + str(e))
    sys.exit(1)

print("Connected.\n")
cur = conn.cursor()

cur.execute("SELECT id, code, type, parent_id FROM branches")
branch_map = {
    row[0]: {"id": row[0], "code": row[1], "type": row[2], "parent_id": row[3]}
    for row in cur.fetchall()
}
print("Loaded " + str(len(branch_map)) + " branches.")

cur.execute("SELECT id, employee_id, biometric_id, branch_id FROM employees ORDER BY id ASC")
employees = [
    {"id": r[0], "employee_id": r[1], "biometric_id": r[2] or "", "branch_id": r[3]}
    for r in cur.fetchall()
]
print("Loaded " + str(len(employees)) + " employees.\n")

updates = []
no_bio  = []

for emp in employees:
    raw_bio = emp["biometric_id"].strip()
    match   = re.search(r"(\d+)$", raw_bio)
    numeric = match.group(1) if match else None

    if not numeric:
        no_bio.append(emp)
        print("  SKIP  #" + str(emp["id"]) + "  (no biometric ID)  current: " + str(emp["employee_id"]))
        continue

    prefix = get_regional_code(emp["branch_id"], branch_map).upper()
    new_id = prefix + numeric

    if emp["employee_id"] != new_id:
        updates.append({"id": emp["id"], "old_id": emp["employee_id"], "new_id": new_id})

print("")
print("-" * 55)
print("  To update  : " + str(len(updates)) + " employees")
print("  No bio ID  : " + str(len(no_bio)) + " employees")
print("-" * 55 + "\n")

if not updates and not (fix_pending and no_bio):
    print("Nothing to do -- all IDs are already correct.")
    conn.close()
    sys.exit(0)

try:
    conn.autocommit = False

    if updates:
        print("Pass 1/2: Setting temporary IDs to avoid unique conflicts...")
        for u in updates:
            cur.execute(
                "UPDATE employees SET employee_id = %s WHERE id = %s",
                ["__TEMP__" + str(u["id"]), u["id"]]
            )

        print("Pass 2/2: Setting final correct IDs...")
        for u in updates:
            cur.execute(
                "UPDATE employees SET employee_id = %s WHERE id = %s",
                [u["new_id"], u["id"]]
            )
            print("  #" + str(u["id"]) + "  " + str(u["old_id"]) + "  ->  " + u["new_id"])

    if fix_pending and no_bio:
        print("\nResetting " + str(len(no_bio)) + " employees with no biometric ID to JA-PENDING...")
        for emp in no_bio:
            cur.execute(
                "UPDATE employees SET employee_id = %s WHERE id = %s",
                ["JA-PENDING", emp["id"]]
            )
            print("  #" + str(emp["id"]) + "  " + str(emp["employee_id"]) + "  ->  JA-PENDING")

    conn.commit()
    print("\nDone! " + str(len(updates)) + " ID(s) patched successfully.")
    if no_bio and not fix_pending:
        print("\nTip: " + str(len(no_bio)) + " employee(s) have no biometric ID.")
        print("     Run with --fix-pending to reset them to JA-PENDING.")

except Exception as e:
    conn.rollback()
    print("\nERROR -- rolled back: " + str(e))
    sys.exit(1)
finally:
    cur.close()
    conn.close()
