#!/usr/bin/env python3
"""
ZKTeco PUSH Server
==================
Listens on port 3333 for ZKTeco device connections.
Stores data in push.db (SQLite) and syncs to Postgres
(biometric_devices + biometric_logs tables).

Usage:
    python push.py

Set Postgres credentials via environment variables:
    PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD
"""

from __future__ import annotations

import os
import re
import sys
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import psycopg2
from flask import Flask, request, Response, jsonify

# ============================================================================
# CONFIG
# ============================================================================

APP_HOST = "0.0.0.0"
APP_PORT = 3333
DB_PATH  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "push.db")

PG_DATABASE_URL: Optional[str] = None
pg_conn = None


def ensure_db_settings() -> None:
    global PG_DATABASE_URL
    host     = os.environ.get("PG_HOST",     "localhost")
    port     = os.environ.get("PG_PORT",     "5432")
    database = os.environ.get("PG_DATABASE", "postal")
    user     = os.environ.get("PG_USER",     "postgres")
    password = os.environ.get("PG_PASSWORD", "")
    PG_DATABASE_URL = f"postgresql://{user}:{password}@{host}:{port}/{database}"


def pg() -> Optional[psycopg2.extensions.connection]:
    global pg_conn
    if not PG_DATABASE_URL:
        return None
    try:
        if pg_conn is None or pg_conn.closed:
            pg_conn = psycopg2.connect(PG_DATABASE_URL)
            pg_conn.autocommit = True
        return pg_conn
    except Exception as e:
        print(f"[PG] Connection error: {e}")
        pg_conn = None
        return None


app = Flask(__name__)

# ============================================================================
# SQLITE
# ============================================================================

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS devices (
        sn TEXT PRIMARY KEY,
        last_seen_utc TEXT,
        last_ip TEXT,
        pushver TEXT,
        info TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sn TEXT NOT NULL,
        pin TEXT NOT NULL,
        name TEXT,
        card TEXT,
        updated_at_utc TEXT,
        UNIQUE(sn, pin)
    );
    CREATE TABLE IF NOT EXISTS attlog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sn TEXT NOT NULL,
        pin TEXT NOT NULL,
        time TEXT,
        status TEXT,
        verify TEXT,
        workcode TEXT,
        raw_line TEXT,
        received_at_utc TEXT
    );
    """)
    conn.commit()
    conn.close()
    print(f"[DB] SQLite ready: {DB_PATH}")

# ============================================================================
# PARSING
# ============================================================================

def parse_kv_line(line: str) -> Dict[str, str]:
    joined = " ".join(line.strip().split())
    kv: Dict[str, str] = {}
    for m in re.finditer(r"(\w+)=([^=]*?)(?=\s+\w+=|$)", joined):
        kv[m.group(1).strip()] = m.group(2).strip()
    return kv


def parse_attlog_record(line: str) -> Optional[Dict[str, str]]:
    cols = re.split(r"[\t ]+", line.strip())
    if len(cols) < 3:
        return None
    pin = cols[0]
    if re.match(r"\d{4}-\d{2}-\d{2}$", cols[1]) and len(cols) > 2 and re.match(r"\d{2}:\d{2}:\d{2}", cols[2]):
        time_str = f"{cols[1]} {cols[2]}"
        idx = 3
    else:
        time_str = cols[1]
        idx = 2
    status   = cols[idx]   if len(cols) > idx   else "0"
    verify   = cols[idx+1] if len(cols) > idx+1 else ""
    workcode = cols[idx+2] if len(cols) > idx+2 else ""
    return {"pin": pin, "time": time_str, "status": status,
            "verify": verify, "workcode": workcode}

# ============================================================================
# DEVICE / USER / ATTLOG
# ============================================================================

def upsert_device(sn: str, ip: str, pushver: str = "", info: str = "") -> None:
    conn = db()
    conn.execute("""
        INSERT INTO devices (sn, last_seen_utc, last_ip, pushver, info)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(sn) DO UPDATE SET
          last_seen_utc = excluded.last_seen_utc,
          last_ip       = excluded.last_ip,
          pushver       = excluded.pushver,
          info = CASE WHEN excluded.info != '' THEN excluded.info ELSE devices.info END
    """, (sn, utc_now_iso(), ip, pushver, info))
    conn.commit()
    conn.close()

    pgc = pg()
    if pgc is None:
        return
    try:
        with pgc.cursor() as cur:
            cur.execute("""
                INSERT INTO biometric_devices
                  (name, serial_number, model, ip_address, port, push_method, status, last_sync, is_active, created_at)
                VALUES (%s, %s, 'ZKTeco', %s, 3333, 'zkpush', 'online', NOW(), true, NOW())
                ON CONFLICT (serial_number) DO UPDATE SET
                  status     = 'online',
                  last_sync  = NOW(),
                  ip_address = CASE WHEN EXCLUDED.ip_address != ''
                                    THEN EXCLUDED.ip_address
                                    ELSE biometric_devices.ip_address END
            """, (f"Device {sn}", sn, ip or ""))
    except Exception as e:
        print(f"[PG] biometric_devices upsert failed SN={sn}: {e}")


def upsert_user(sn: str, kv: Dict[str, str], raw_line: str) -> None:
    pin  = kv.get("PIN") or kv.get("Pin") or ""
    if not pin:
        return
    name = kv.get("Name", "").strip()

    conn = db()
    conn.execute("""
        INSERT INTO users (sn, pin, name, card, updated_at_utc)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(sn, pin) DO UPDATE SET
          name = excluded.name, card = excluded.card,
          updated_at_utc = excluded.updated_at_utc
    """, (sn, pin, name, kv.get("Card", ""), utc_now_iso()))
    conn.commit()
    conn.close()

    if not name:
        return
    pgc = pg()
    if pgc is None:
        return
    try:
        parts = name.split(" ", 1)
        first = parts[0]
        last  = parts[1] if len(parts) > 1 else None
        with pgc.cursor() as cur:
            cur.execute("""
                UPDATE employees
                SET full_name = %s, first_name = %s, last_name = %s
                WHERE biometric_id = %s
            """, (name, first, last, pin))
            if cur.rowcount > 0:
                print(f"[PG] Employee name updated biometric_id={pin}: {name}")
    except Exception as e:
        print(f"[PG] Employee name sync failed PIN={pin}: {e}")


def insert_attlog(sn: str, rec: Dict[str, str], raw_line: str) -> None:
    conn = db()
    conn.execute("""
        INSERT INTO attlog
          (sn, pin, time, status, verify, workcode, raw_line, received_at_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (sn, rec.get("pin",""), rec.get("time",""), rec.get("status",""),
          rec.get("verify",""), rec.get("workcode",""), raw_line, utc_now_iso()))
    conn.commit()
    conn.close()
    insert_biometric_log_postgres(sn, rec)


def insert_biometric_log_postgres(sn: str, rec: Dict[str, str]) -> None:
    pgc = pg()
    if pgc is None:
        return

    pin            = rec.get("pin") or ""
    punch_time_str = rec.get("time") or ""
    status_code    = rec.get("status") or "0"
    if not pin or not sn or not punch_time_str:
        return

    # Device sends Sri Lanka time (IST UTC+5:30) — convert to UTC for storage
    punch_value: object = punch_time_str
    try:
        local_dt    = datetime.strptime(punch_time_str, "%Y-%m-%d %H:%M:%S")
        ist_dt      = local_dt.replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
        punch_value = ist_dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        pass

    punch_type = "in" if status_code == "0" else "out" if status_code == "1" else "unknown"

    try:
        with pgc.cursor() as cur:
            cur.execute("SELECT id FROM biometric_devices WHERE serial_number = %s LIMIT 1", (sn,))
            row = cur.fetchone()
            if not row:
                return
            device_id = row[0]

            cur.execute("SELECT id FROM employees WHERE biometric_id = %s LIMIT 1", (pin,))
            emp        = cur.fetchone()
            employee_id = emp[0] if emp else None

            cur.execute("""
                SELECT 1 FROM biometric_logs
                WHERE device_id = %s AND biometric_id = %s AND punch_time = %s LIMIT 1
            """, (device_id, pin, punch_value))
            if cur.fetchone():
                return

            cur.execute("""
                INSERT INTO biometric_logs
                  (device_id, employee_id, biometric_id, punch_time, punch_type, processed, created_at)
                VALUES (%s, %s, %s, %s, %s, false, NOW())
            """, (device_id, employee_id, pin, punch_value, punch_type))
    except Exception as e:
        print(f"[PG] biometric_log insert failed PIN={pin} SN={sn}: {e}")

# ============================================================================
# STARTUP SYNC
# ============================================================================

def sync_attlogs_to_postgres() -> None:
    if pg() is None:
        print("[SYNC] Postgres unavailable, skipping attlog sync.")
        return
    conn  = db()
    total = conn.execute("SELECT COUNT(*) AS c FROM attlog").fetchone()["c"]
    if not total:
        conn.close()
        return
    print(f"[SYNC] Syncing {total} attlog records to Postgres...")
    rows = conn.execute(
        "SELECT sn, pin, time, status, verify, workcode FROM attlog ORDER BY id"
    ).fetchall()
    conn.close()
    done = 0
    for r in rows:
        insert_biometric_log_postgres(r["sn"], dict(r))
        done += 1
        if done % 1000 == 0:
            print(f"[SYNC] {done}/{total}")
    print(f"[SYNC] Attlog sync complete: {done} records.")


def sync_users_to_postgres() -> None:
    pgc = pg()
    if pgc is None:
        return
    conn = db()
    rows = conn.execute(
        "SELECT DISTINCT pin, name FROM users WHERE name IS NOT NULL AND TRIM(name) != ''"
    ).fetchall()
    conn.close()
    updated = 0
    for r in rows:
        pin  = r["pin"]
        name = (r["name"] or "").strip()
        if not name:
            continue
        parts = name.split(" ", 1)
        first = parts[0]
        last  = parts[1] if len(parts) > 1 else None
        try:
            with pgc.cursor() as cur:
                cur.execute("""
                    UPDATE employees SET full_name=%s, first_name=%s, last_name=%s
                    WHERE biometric_id=%s
                """, (name, first, last, pin))
                if cur.rowcount > 0:
                    updated += 1
        except Exception as e:
            print(f"[SYNC] User sync failed PIN={pin}: {e}")
    if updated:
        print(f"[SYNC] Updated {updated} employee names.")

# ============================================================================
# ZKTECO PROTOCOL ROUTES
# ============================================================================

@app.route("/iclock/cdata", methods=["GET", "POST"])
@app.route("/iclock/cdata.aspx", methods=["GET", "POST"])
def iclock_cdata():
    sn = request.args.get("SN", "").strip()
    if not sn:
        return Response("Missing SN", status=400, mimetype="text/plain")
    ip      = request.headers.get("X-Forwarded-For", request.remote_addr or "")
    pushver = request.args.get("pushver", "")

    if request.method == "GET":
        upsert_device(sn, ip, pushver=pushver)
        if request.args.get("options") == "all":
            body = (
                f"GET OPTION FROM: {sn}\n"
                f"ATTLOGStamp=0\nOPERLOGStamp=0\nBIODATAStamp=0\n"
                f"ATTPHOTOStamp=0\nUSERStamp=0\nErrorDelay=30\nDelay=3\n"
                f"TransTimes=\nTransInterval=1\n"
                f"TransFlag=TransData AttLog\tOpLog\tEnrollUser\tChgUser\n"
                f"TimeZone=330\nRealtime=0\nEncrypt=None\n"
                f"ServerVer=2.2.14\nPushProtVer={pushver or '2.2.14'}\n"
            )
            print(f"[INIT] Device {sn} ({ip}) connected")
            return Response(body, status=200, mimetype="text/plain")
        return Response("OK", status=200, mimetype="text/plain")

    upsert_device(sn, ip, pushver=pushver)
    table = request.args.get("table", "").strip().upper()
    text  = (request.get_data() or b"").decode("utf-8", errors="ignore").strip()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    count = 0

    if table in ["USER", "ENROLLUSER", "CHGUSER", "OPERLOG"]:
        for ln in lines:
            stripped = ln.replace("USER", "", 1).strip() if ln.upper().startswith("USER") else ln
            if "PIN" in ln.upper() or "=" in ln:
                kv = parse_kv_line(stripped)
                if "PIN" in kv or "Pin" in kv:
                    upsert_user(sn, kv, raw_line=ln)
                    count += 1
        if count:
            print(f"[USER] Device {sn}: {count} users received")
        return Response(f"OK: {count}", status=200, mimetype="text/plain")

    if table == "ATTLOG":
        for ln in lines:
            rec = parse_attlog_record(ln)
            if rec:
                insert_attlog(sn, rec, raw_line=ln)
                count += 1
        if count:
            conn  = db()
            total = conn.execute("SELECT COUNT(*) c FROM attlog WHERE sn=?", (sn,)).fetchone()["c"]
            conn.close()
            print(f"[ATTLOG] Device {sn}: +{count} punches (db total: {total})")
        return Response(f"OK: {count}", status=200, mimetype="text/plain")

    return Response(f"OK: {len(lines)}", status=200, mimetype="text/plain")


@app.route("/iclock/getrequest", methods=["GET"])
@app.route("/iclock/getrequest.aspx", methods=["GET"])
def iclock_getrequest():
    sn = request.args.get("SN", "").strip()
    if sn:
        ip   = request.headers.get("X-Forwarded-For", request.remote_addr or "")
        info = request.args.get("INFO", "")
        upsert_device(sn, ip, info=info)
        conn = db()
        n    = conn.execute("SELECT COUNT(*) c FROM users WHERE sn=?", (sn,)).fetchone()["c"]
        conn.close()
        if n == 0:
            return Response("C:Download\ntable:USER\nStamp=0\n", mimetype="text/plain")
    return Response("OK", mimetype="text/plain")


@app.route("/iclock/ping",      methods=["GET", "POST"])
@app.route("/iclock/devicecmd", methods=["POST"])
def iclock_misc():
    return Response("OK", mimetype="text/plain")

# ============================================================================
# MONITORING DASHBOARD
# ============================================================================

_BASE = """<!doctype html><html><head><meta charset="utf-8"><title>ZKTeco Push</title>
<style>body{{font-family:Arial,sans-serif;margin:20px;background:#f5f5f5}}
.wrap{{max-width:1100px;margin:0 auto}}
.card{{background:#fff;border:1px solid #ddd;border-radius:8px;padding:15px;margin:10px 0}}
.num{{font-size:36px;font-weight:bold;color:#007bff}}
table{{border-collapse:collapse;width:100%}}
th,td{{border-bottom:1px solid #eee;padding:8px 10px;text-align:left}}
th{{background:#f9f9f9;font-weight:bold}}
nav a{{margin-right:14px;color:#007bff;text-decoration:none;font-size:14px}}
nav{{margin-bottom:16px}}</style></head>
<body><div class="wrap"><nav>
<a href="/"><b>Dashboard</b></a>
<a href="/devices">Devices</a>
<a href="/users">Users</a>
<a href="/attendance">Attendance</a>
</nav><hr>{body}</div></body></html>"""


@app.route("/")
def home():
    conn = db()
    d = conn.execute("SELECT COUNT(*) c FROM devices").fetchone()["c"]
    u = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    a = conn.execute("SELECT COUNT(*) c FROM attlog").fetchone()["c"]
    rows = conn.execute(
        "SELECT a.pin, u.name, a.time, a.status FROM attlog a "
        "LEFT JOIN users u ON u.sn=a.sn AND u.pin=a.pin ORDER BY a.id DESC LIMIT 20"
    ).fetchall()
    conn.close()
    trs = "".join(
        f"<tr><td>{r['pin']}</td><td>{r['name'] or '-'}</td>"
        f"<td>{r['time']}</td><td><b>{r['status']}</b></td></tr>"
        for r in rows
    ) or "<tr><td colspan=4 style='color:#999;text-align:center'>No records yet</td></tr>"
    body = (
        f"<h2>ZKTeco Push Server</h2>"
        f"<div style='display:grid;grid-template-columns:repeat(3,1fr);gap:12px'>"
        f"<div class='card' style='text-align:center'><div class='num'>{d}</div>Devices</div>"
        f"<div class='card' style='text-align:center'><div class='num' style='color:#28a745'>{u}</div>Users</div>"
        f"<div class='card' style='text-align:center'><div class='num' style='color:#dc3545'>{a}</div>Punches</div>"
        f"</div><div class='card'><h3>Latest Punches</h3>"
        f"<table><tr><th>PIN</th><th>Name</th><th>Time</th><th>Status</th></tr>{trs}</table></div>"
        f"<div class='card'><b>ADMS:</b> <code>http://&lt;server&gt;:{APP_PORT}/iclock/cdata</code></div>"
    )
    return _BASE.format(body=body)


@app.route("/devices")
def devices():
    conn = db()
    rows = conn.execute("SELECT * FROM devices ORDER BY last_seen_utc DESC").fetchall()
    conn.close()
    items = "".join(
        f"<div class='card'><b>{r['sn']}</b> &nbsp;IP: {r['last_ip'] or '-'} "
        f"&nbsp;Last: {(r['last_seen_utc'] or '')[:19].replace('T',' ')}</div>"
        for r in rows
    ) or "<p style='color:#999'>No devices yet</p>"
    return _BASE.format(body=f"<h2>Devices ({len(rows)})</h2>{items}")


@app.route("/users")
def users():
    q   = request.args.get("q", "").strip()
    sn  = request.args.get("sn", "").strip()
    conn = db()
    params: List = []
    where: List[str] = []
    if sn: where.append("sn=?"); params.append(sn)
    if q:  where.append("(pin LIKE ? OR name LIKE ?)"); params.extend([f"%{q}%", f"%{q}%"])
    w    = ("WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"SELECT sn, pin, name, card, updated_at_utc FROM users {w} "
        f"ORDER BY sn, CAST(pin AS INTEGER) LIMIT 5000", params
    ).fetchall()
    conn.close()
    trs = "".join(
        f"<tr><td>{r['sn']}</td><td>{r['pin']}</td><td>{r['name'] or '-'}</td>"
        f"<td>{r['card'] or '-'}</td><td style='color:#666;font-size:12px'>{(r['updated_at_utc'] or '')[:19]}</td></tr>"
        for r in rows
    ) or "<tr><td colspan=5 style='color:#999;text-align:center'>No users yet</td></tr>"
    body = (
        f"<h2>Users ({len(rows)})</h2>"
        f"<form method='get' style='margin:10px 0'>"
        f"<input name='sn' value='{sn}' placeholder='Device SN'> "
        f"<input name='q' value='{q}' placeholder='Search PIN / Name'> "
        f"<button type='submit'>Search</button></form>"
        f"<div class='card'><table><tr><th>Device</th><th>PIN</th><th>Name</th>"
        f"<th>Card</th><th>Updated</th></tr>{trs}</table></div>"
    )
    return _BASE.format(body=body)


@app.route("/attendance")
def attendance():
    sn  = request.args.get("sn",  "").strip()
    pin = request.args.get("pin", "").strip()
    conn = db()
    params: List = []
    where: List[str] = []
    if sn:  where.append("a.sn=?");  params.append(sn)
    if pin: where.append("a.pin=?"); params.append(pin)
    w    = ("WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"SELECT a.sn, a.pin, u.name, a.time, a.status FROM attlog a "
        f"LEFT JOIN users u ON u.sn=a.sn AND u.pin=a.pin {w} ORDER BY a.id DESC LIMIT 5000",
        params
    ).fetchall()
    conn.close()
    trs = "".join(
        f"<tr><td>{r['sn']}</td><td>{r['pin']}</td><td>{r['name'] or '-'}</td>"
        f"<td>{r['time']}</td><td><b>{r['status']}</b></td></tr>"
        for r in rows
    ) or "<tr><td colspan=5 style='color:#999;text-align:center'>No records yet</td></tr>"
    body = (
        f"<h2>Attendance ({len(rows)})</h2>"
        f"<form method='get' style='margin:10px 0'>"
        f"<input name='sn' value='{sn}' placeholder='Device SN'> "
        f"<input name='pin' value='{pin}' placeholder='PIN'> "
        f"<button type='submit'>Filter</button></form>"
        f"<div class='card'><table><tr><th>Device</th><th>PIN</th><th>Name</th>"
        f"<th>Time</th><th>Status</th></tr>{trs}</table></div>"
    )
    return _BASE.format(body=body)


@app.route("/api/stats")
def api_stats():
    conn = db()
    d = conn.execute("SELECT COUNT(*) c FROM devices").fetchone()["c"]
    u = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    a = conn.execute("SELECT COUNT(*) c FROM attlog").fetchone()["c"]
    ds = conn.execute(
        "SELECT d.sn, d.last_seen_utc,"
        " (SELECT COUNT(*) FROM users  WHERE sn=d.sn) uc,"
        " (SELECT COUNT(*) FROM attlog WHERE sn=d.sn) ac"
        " FROM devices d ORDER BY d.last_seen_utc DESC"
    ).fetchall()
    conn.close()
    return jsonify({
        "devices": d, "users": u, "punches": a,
        "device_list": [{"sn": r["sn"], "last_seen": r["last_seen_utc"],
                         "users": r["uc"], "punches": r["ac"]} for r in ds],
    })

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    ensure_db_settings()
    init_db()
    sync_attlogs_to_postgres()
    sync_users_to_postgres()
    print(f"[ZKTeco Push] Listening on port {APP_PORT}  |  DB: {DB_PATH}")
    app.run(host=APP_HOST, port=APP_PORT, debug=False, use_reloader=False)
