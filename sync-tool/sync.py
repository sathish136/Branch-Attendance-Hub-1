#!/usr/bin/env python3
"""
ZKTeco SQLite -> Node.js Attendance App Sync Tool
==================================================
Reads from the Python ADMS server's push.db (SQLite) and forwards
device registrations and attendance logs to the Node.js app via ADMS protocol.

Run this alongside the Python ADMS server on the same machine.

Usage:
    python sync.py

Config via environment variables:
    PUSH_DB        Path to push.db        (default: ./push.db)
    API_URL        Node.js app API URL    (default: http://localhost:3000)
    SYNC_INTERVAL  Seconds between syncs  (default: 30)
"""

import sqlite3
import sys
import os
import time
from datetime import datetime

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package not found. Run: pip install requests")
    sys.exit(1)

# ── Configuration ──────────────────────────────────────────────────────────────
PUSH_DB       = os.environ.get("PUSH_DB",        "push.db")
API_URL       = os.environ.get("API_URL",         "http://localhost:3000").rstrip("/")
SYNC_INTERVAL = int(os.environ.get("SYNC_INTERVAL", "30"))
ADMS_URL      = f"{API_URL}/iclock/cdata"

# Track which attlog IDs have already been synced this session
_synced_ids: set = set()

# ── Helpers ────────────────────────────────────────────────────────────────────

def open_db() -> sqlite3.Connection:
    conn = sqlite3.connect(PUSH_DB, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


# ── Sync devices ───────────────────────────────────────────────────────────────

def sync_devices() -> None:
    conn = open_db()
    rows = conn.execute("SELECT sn, last_ip FROM devices").fetchall()
    conn.close()

    for row in rows:
        sn = row["sn"]
        ip = row["last_ip"] or ""
        try:
            r = requests.get(
                ADMS_URL,
                params={"SN": sn, "options": "all"},
                headers={"X-Forwarded-For": ip},
                timeout=5,
            )
            if r.status_code == 200:
                print(f"  [device] {sn} ({ip}) -> registered OK")
            else:
                print(f"  [device] {sn} -> HTTP {r.status_code}")
        except Exception as e:
            print(f"  [device] {sn} -> ERROR: {e}")


# ── Sync attendance logs ───────────────────────────────────────────────────────

def sync_attlogs() -> None:
    conn = open_db()

    if _synced_ids:
        placeholders = ",".join("?" * len(_synced_ids))
        rows = conn.execute(
            f"SELECT * FROM attlog WHERE id NOT IN ({placeholders}) ORDER BY sn, id",
            list(_synced_ids),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM attlog ORDER BY sn, id").fetchall()

    conn.close()

    if not rows:
        return

    # Group by device serial number
    by_sn: dict = {}
    for row in rows:
        sn = row["sn"]
        by_sn.setdefault(sn, []).append(row)

    for sn, records in by_sn.items():
        # Build ATTLOG body in ZKTeco format:  PIN\tDATETIME\tSTATUS
        lines = []
        ids = []
        for r in records:
            pin      = str(r["pin"] or "").strip()
            time_str = str(r["time"] or "").strip()
            status   = str(r["status"] or "0").strip()
            if not pin or not time_str:
                continue
            lines.append(f"{pin}\t{time_str}\t{status}")
            ids.append(r["id"])

        if not lines:
            continue

        body = "\n".join(lines)
        try:
            resp = requests.post(
                ADMS_URL,
                params={"SN": sn, "table": "ATTLOG"},
                data=body.encode("utf-8"),
                headers={"Content-Type": "text/plain"},
                timeout=15,
            )
            result = resp.text.strip()
            print(f"  [attlog] {sn} -> {result}  ({len(lines)} lines sent)")
            # Mark as synced
            _synced_ids.update(ids)
        except Exception as e:
            print(f"  [attlog] {sn} -> ERROR: {e}")


# ── Main loop ──────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("  ZKTeco SQLite -> Node.js Sync Tool")
    print("=" * 60)
    print(f"  push.db  : {os.path.abspath(PUSH_DB)}")
    print(f"  API URL  : {ADMS_URL}")
    print(f"  Interval : {SYNC_INTERVAL}s")
    print("=" * 60)
    print()

    if not os.path.exists(PUSH_DB):
        print(f"ERROR: '{PUSH_DB}' not found.")
        print("Make sure the Python ADMS server has run at least once")
        print("and that PUSH_DB points to the correct path.")
        print()
        print("Example:")
        print(f'  PUSH_DB="C:\\path\\to\\push.db" python sync.py')
        sys.exit(1)

    run = 0
    while True:
        run += 1
        print(f"[{ts()}] Sync #{run} ...")
        try:
            sync_devices()
            sync_attlogs()
        except Exception as e:
            print(f"  ERROR during sync: {e}")
        print(f"[{ts()}] Done. Next sync in {SYNC_INTERVAL}s\n")
        time.sleep(SYNC_INTERVAL)


if __name__ == "__main__":
    main()
