#!/usr/bin/env python3
"""
ZKTeco PUSH Server - Attendance Management System
==================================================
Listens on port 3333 for ZKTeco device connections.
Stores data locally in push.db (SQLite) AND syncs directly to the
attendance app's Postgres database (biometric_devices + biometric_logs).

Usage:
    python push.py            (starts server)

Configure Postgres connection in ensure_db_settings() below.
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
# CONFIGURATION
# ============================================================================

APP_HOST = "0.0.0.0"
APP_PORT = 3333


def _app_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


DB_PATH = os.path.join(_app_dir(), "push.db")

# Postgres connection URL — edit these values to match your database
PG_DATABASE_URL: Optional[str] = None
pg_conn = None


def ensure_db_settings() -> None:
    """Configure Postgres connection. Edit the values below."""
    global PG_DATABASE_URL
    host     = os.environ.get("PG_HOST",     "localhost")
    port     = os.environ.get("PG_PORT",     "5432")
    database = os.environ.get("PG_DATABASE", "postal")
    user     = os.environ.get("PG_USER",     "postgres")
    password = os.environ.get("PG_PASSWORD", "556656")
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
# SQLITE HELPERS
# ============================================================================

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = db()
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS devices (
        sn TEXT PRIMARY KEY,
        last_seen_utc TEXT,
        last_ip TEXT,
        pushver TEXT,
        language TEXT,
        info TEXT
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sn TEXT NOT NULL,
        pin TEXT NOT NULL,
        name TEXT,
        card TEXT,
        grp TEXT,
        tz TEXT,
        pri TEXT,
        verify TEXT,
        raw_line TEXT,
        updated_at_utc TEXT,
        UNIQUE(sn, pin)
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS attlog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sn TEXT NOT NULL,
        pin TEXT NOT NULL,
        time TEXT,
        status TEXT,
        verify TEXT,
        workcode TEXT,
        maskflag TEXT,
        temperature TEXT,
        convtemperature TEXT,
        timeoffset TEXT,
        raw_line TEXT,
        received_at_utc TEXT
    )""")
    conn.commit()
    conn.close()
    print(f"[DB] SQLite initialized: {DB_PATH}")

# ============================================================================
# PARSING HELPERS
# ============================================================================

def parse_kv_line(line: str) -> Dict[str, str]:
    """Parse KEY=VALUE format (handles tabs and spaces)."""
    parts = re.split(r"[\t\r\n]+", line.strip())
    joined = " ".join(p.strip() for p in parts if p.strip())
    kv: Dict[str, str] = {}
    for m in re.finditer(r"(\w+)=([^=]*?)(?=\s+\w+=|$)", joined):
        kv[m.group(1).strip()] = m.group(2).strip()
    return kv


def parse_attlog_record(line: str) -> Optional[Dict[str, str]]:
    """Parse ZKTeco attendance record line."""
    raw = line.strip()
    if not raw:
        return None
    cols = re.split(r"[\t ]+", raw)
    if len(cols) < 4:
        return None
    pin = cols[0]
    if len(cols) >= 3 and re.match(r"\d{4}-\d{2}-\d{2}", cols[1]) and re.match(r"\d{2}:\d{2}:\d{2}", cols[2]):
        time_str = f"{cols[1]} {cols[2]}"
        idx = 3
    else:
        time_str = cols[1]
        idx = 2

    def get(i: int) -> str:
        return cols[i] if i < len(cols) else ""

    status = get(idx); idx += 1
    verify = get(idx); idx += 1
    workcode = get(idx); idx += 1
    maskflag = temperature = convtemperature = timeoffset = ""
    if len(cols) >= 4:
        tail = cols[-4:]
        if len(tail) == 4:
            maskflag, temperature, convtemperature, timeoffset = tail
    return {
        "pin": pin, "time": time_str, "status": status,
        "verify": verify, "workcode": workcode, "maskflag": maskflag,
        "temperature": temperature, "convtemperature": convtemperature,
        "timeoffset": timeoffset,
    }

# ============================================================================
# DEVICE / USER / ATTLOG STORAGE
# ============================================================================

def upsert_device(sn: str, ip: str, pushver: str = "", language: str = "", info: str = "") -> None:
    """Save device in SQLite and register it in Postgres biometric_devices."""
    conn = db()
    conn.execute("""
    INSERT INTO devices (sn, last_seen_utc, last_ip, pushver, language, info)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(sn) DO UPDATE SET
      last_seen_utc=excluded.last_seen_utc,
      last_ip=excluded.last_ip,
      pushver=excluded.pushver,
      language=excluded.language,
      info=CASE WHEN excluded.info != '' THEN excluded.info ELSE devices.info END
    """, (sn, utc_now_iso(), ip, pushver, language, info))
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
                  status    = 'online',
                  last_sync = NOW(),
                  ip_address = CASE WHEN EXCLUDED.ip_address != ''
                                    THEN EXCLUDED.ip_address
                                    ELSE biometric_devices.ip_address END
            """, (f"Device {sn}", sn, ip or ""))
    except Exception as e:
        print(f"[PG] biometric_devices upsert failed SN={sn}: {e}")


def upsert_user(sn: str, kv: Dict[str, str], raw_line: str) -> None:
    """
    Save employee/user from device in SQLite.
    Syncs PIN (biometric_id) and name to the matching Postgres employee record.
    """
    pin = kv.get("PIN") or kv.get("Pin") or ""
    if not pin:
        return
    name = kv.get("Name", "").strip()

    # Save to SQLite
    conn = db()
    conn.execute("""
    INSERT INTO users (sn, pin, name, card, grp, tz, pri, verify, raw_line, updated_at_utc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sn, pin) DO UPDATE SET
      name=excluded.name, card=excluded.card, grp=excluded.grp,
      tz=excluded.tz, pri=excluded.pri, verify=excluded.verify,
      raw_line=excluded.raw_line, updated_at_utc=excluded.updated_at_utc
    """, (sn, pin, name, kv.get("Card", ""), kv.get("Grp", ""),
          kv.get("TZ", ""), kv.get("Pri", ""), kv.get("Verify", ""),
          raw_line, utc_now_iso()))
    conn.commit()
    conn.close()

    # Sync biometric_id and name to Postgres employee
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
                print(f"[PG] Updated employee name for biometric_id={pin}: {name}")
    except Exception as e:
        print(f"[PG] Employee name sync failed PIN={pin}: {e}")


def insert_attlog(sn: str, rec: Dict[str, str], raw_line: str) -> None:
    """Save attendance record to SQLite and Postgres biometric_logs."""
    conn = db()
    conn.execute("""
    INSERT INTO attlog (
      sn, pin, time, status, verify, workcode,
      maskflag, temperature, convtemperature, timeoffset,
      raw_line, received_at_utc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        sn, rec.get("pin", ""), rec.get("time", ""), rec.get("status", ""),
        rec.get("verify", ""), rec.get("workcode", ""), rec.get("maskflag", ""),
        rec.get("temperature", ""), rec.get("convtemperature", ""),
        rec.get("timeoffset", ""), raw_line, utc_now_iso(),
    ))
    conn.commit()
    conn.close()
    insert_biometric_log_postgres(sn, rec, raw_line)


def insert_biometric_log_postgres(sn: str, rec: Dict[str, str], raw_line: str) -> None:
    """
    Insert a punch into Postgres biometric_logs.
    Device time (Sri Lanka IST, UTC+5:30) is converted to UTC before saving.
    """
    pgc = pg()
    if pgc is None:
        return

    pin           = rec.get("pin") or ""
    punch_time_str = rec.get("time") or ""
    status_code   = rec.get("status") or "0"

    if not pin or not sn or not punch_time_str:
        return

    # Convert IST → UTC
    punch_value: object = punch_time_str
    try:
        local_dt  = datetime.strptime(punch_time_str, "%Y-%m-%d %H:%M:%S")
        ist_dt    = local_dt.replace(tzinfo=timezone(timedelta(hours=5, minutes=30)))
        punch_value = ist_dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        punch_value = punch_time_str

    punch_type = "in" if status_code == "0" else "out" if status_code == "1" else "unknown"

    try:
        with pgc.cursor() as cur:
            cur.execute(
                "SELECT id FROM biometric_devices WHERE serial_number = %s LIMIT 1", (sn,))
            row = cur.fetchone()
            if not row:
                print(f"[PG] Device SN={sn} not in biometric_devices, skipping log")
                return
            device_id = row[0]

            cur.execute(
                "SELECT id FROM employees WHERE biometric_id = %s LIMIT 1", (pin,))
            emp_row    = cur.fetchone()
            employee_id = emp_row[0] if emp_row else None

            # Skip duplicates
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
# STARTUP SYNC — SQLite → Postgres
# ============================================================================

def sync_attlogs_to_postgres() -> None:
    """Sync all existing SQLite attendance records to Postgres biometric_logs on startup."""
    if pg() is None:
        print("[SYNC] Postgres unavailable, skipping attlog sync.")
        return
    conn = db()
    total = conn.execute("SELECT COUNT(*) AS c FROM attlog").fetchone()["c"]
    if not total:
        conn.close()
        print("[SYNC] No attlog records in SQLite to sync.")
        return
    print(f"[SYNC] Syncing {total} attlog records to Postgres biometric_logs...")
    rows = conn.execute(
        "SELECT sn, pin, time, status, verify, workcode, maskflag, temperature, "
        "convtemperature, timeoffset, raw_line FROM attlog ORDER BY id"
    ).fetchall()
    conn.close()
    processed = 0
    for row in rows:
        rec = {k: row[k] or "" for k in ("pin","time","status","verify","workcode",
                                           "maskflag","temperature","convtemperature","timeoffset")}
        insert_biometric_log_postgres(row["sn"], rec, row["raw_line"] or "")
        processed += 1
        if processed % 1000 == 0:
            print(f"[SYNC] ...{processed}/{total} done")
    print(f"[SYNC] Attlog sync complete: {processed} records.")


def sync_users_to_postgres() -> None:
    """
    Sync all user names from SQLite to Postgres employees.
    Updates full_name, first_name, last_name for every employee whose
    biometric_id matches a PIN in the device's user table.
    """
    pgc = pg()
    if pgc is None:
        print("[SYNC] Postgres unavailable, skipping user sync.")
        return
    conn = db()
    rows = conn.execute(
        "SELECT DISTINCT pin, name FROM users "
        "WHERE name IS NOT NULL AND TRIM(name) != '' ORDER BY pin"
    ).fetchall()
    conn.close()
    if not rows:
        print("[SYNC] No users in SQLite to sync.")
        return
    print(f"[SYNC] Syncing {len(rows)} user names to Postgres employees...")
    updated = 0
    for row in rows:
        pin  = row["pin"]
        name = (row["name"] or "").strip()
        if not name:
            continue
        parts = name.split(" ", 1)
        first = parts[0]
        last  = parts[1] if len(parts) > 1 else None
        try:
            with pgc.cursor() as cur:
                cur.execute("""
                    UPDATE employees
                    SET full_name = %s, first_name = %s, last_name = %s
                    WHERE biometric_id = %s
                """, (name, first, last, pin))
                if cur.rowcount > 0:
                    updated += 1
        except Exception as e:
            print(f"[SYNC] User name sync failed PIN={pin}: {e}")
    print(f"[SYNC] User sync complete: {updated} employees updated.")

# ============================================================================
# ZKTECO PROTOCOL ENDPOINTS
# ============================================================================

@app.route("/iclock/cdata", methods=["GET", "POST"])
@app.route("/iclock/cdata.aspx", methods=["GET", "POST"])
def iclock_cdata():
    sn = request.args.get("SN", "").strip()
    if not sn:
        return Response("Missing SN", status=400, mimetype="text/plain")
    ip      = request.headers.get("X-Forwarded-For", request.remote_addr or "")
    pushver = request.args.get("pushver", "")
    language = request.args.get("language", "")

    if request.method == "GET":
        upsert_device(sn, ip, pushver=pushver, language=language)
        options = request.args.get("options", "")
        if options == "all":
            body = (
                f"GET OPTION FROM: {sn}\n"
                f"ATTLOGStamp=0\n"
                f"OPERLOGStamp=0\n"
                f"BIODATAStamp=0\n"
                f"ATTPHOTOStamp=0\n"
                f"USERStamp=0\n"
                f"ErrorDelay=30\n"
                f"Delay=3\n"
                f"TransTimes=\n"
                f"TransInterval=1\n"
                f"TransFlag=TransData AttLog\tOpLog\tEnrollUser\tChgUser\n"
                f"TimeZone=330\n"
                f"Realtime=0\n"
                f"Encrypt=None\n"
                f"ServerVer=2.2.14\n"
                f"PushProtVer={pushver or '2.2.14'}\n"
            )
            print(f"[INIT] Device {sn} ({ip}) connected — requesting full sync")
            return Response(body, status=200, mimetype="text/plain")
        return Response("OK", status=200, mimetype="text/plain")

    # POST: device uploads data
    upsert_device(sn, ip, pushver=pushver, language=language)
    table    = request.args.get("table", "").strip().upper()
    raw_bytes = request.get_data() or b""
    text     = raw_bytes.decode("utf-8", errors="ignore").strip()
    lines    = [ln.strip() for ln in text.splitlines() if ln.strip()]
    processed = 0

    if table in ["USER", "ENROLLUSER", "CHGUSER", "OPERLOG"]:
        for ln in lines:
            ln_stripped = ln.replace("USER", "", 1).strip() if ln.upper().startswith("USER") else ln
            if "PIN" in ln.upper() or "=" in ln:
                kv = parse_kv_line(ln_stripped)
                if "PIN" in kv or "Pin" in kv:
                    upsert_user(sn, kv, raw_line=ln)
                    processed += 1
        if processed > 0:
            print(f"[USER] Device {sn}: {processed} user records received")
        return Response(f"OK: {processed}", status=200, mimetype="text/plain")

    if table == "ATTLOG":
        for ln in lines:
            rec = parse_attlog_record(ln)
            if rec:
                insert_attlog(sn, rec, raw_line=ln)
                processed += 1
        if processed > 0:
            conn = db()
            total = conn.execute("SELECT COUNT(*) c FROM attlog WHERE sn=?", (sn,)).fetchone()["c"]
            conn.close()
            print(f"[ATTLOG] Device {sn}: +{processed} punches (total in db: {total})")
        return Response(f"OK: {processed}", status=200, mimetype="text/plain")

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
        user_count = conn.execute("SELECT COUNT(*) c FROM users WHERE sn=?", (sn,)).fetchone()["c"]
        conn.close()
        if user_count == 0:
            return Response("C:Download\ntable:USER\nStamp=0\n", status=200, mimetype="text/plain")
    return Response("OK", status=200, mimetype="text/plain")


@app.route("/iclock/ping", methods=["GET", "POST"])
def iclock_ping():
    return Response("OK", status=200, mimetype="text/plain")


@app.route("/iclock/devicecmd", methods=["POST"])
def iclock_devicecmd():
    return Response("OK", status=200, mimetype="text/plain")

# ============================================================================
# ADMIN / API ENDPOINTS
# ============================================================================

@app.route("/admin/force-sync/<sn>")
def admin_force_sync(sn: str):
    conn = db()
    device = conn.execute("SELECT * FROM devices WHERE sn=?", (sn,)).fetchone()
    conn.close()
    if not device:
        return {"error": "Device not found"}, 404
    print(f"[ADMIN] Force-sync triggered for device {sn}")
    return Response(
        "C:Download\ntable:USER\nStamp=0\n---\nC:Download\ntable:ATTLOG\nStamp=0\n",
        status=200, mimetype="text/plain"
    )


@app.route("/api/stats")
def api_stats():
    conn = db()
    devices_cnt = conn.execute("SELECT COUNT(*) c FROM devices").fetchone()["c"]
    users_cnt   = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    attlog_cnt  = conn.execute("SELECT COUNT(*) c FROM attlog").fetchone()["c"]
    device_stats = conn.execute("""
        SELECT d.sn, d.last_seen_utc,
               (SELECT COUNT(*) FROM users  WHERE sn=d.sn) as user_count,
               (SELECT COUNT(*) FROM attlog WHERE sn=d.sn) as att_count
        FROM devices d ORDER BY d.last_seen_utc DESC
    """).fetchall()
    conn.close()
    return jsonify({
        "total_devices": devices_cnt,
        "total_users":   users_cnt,
        "total_attendance_records": attlog_cnt,
        "devices": [{"sn": d["sn"], "last_seen": d["last_seen_utc"],
                     "employees": d["user_count"], "attendance_records": d["att_count"]}
                    for d in device_stats],
        "server_time": utc_now_iso(),
    })

# ============================================================================
# SIMPLE WEB DASHBOARD
# ============================================================================

_BASE = """<!doctype html><html><head><meta charset="utf-8">
<title>ZKTeco Push Server</title>
<style>body{{font-family:Arial,sans-serif;margin:20px;background:#f5f5f5}}
.container{{max-width:1200px;margin:0 auto}}
.card{{border:1px solid #ddd;border-radius:8px;padding:15px;margin:10px 0;background:white}}
.stat-number{{font-size:36px;font-weight:bold;color:#007bff}}
table{{border-collapse:collapse;width:100%}}
th,td{{border-bottom:1px solid #eee;padding:10px;text-align:left}}
th{{background:#f9f9f9;font-weight:bold}}
.muted{{color:#666;font-size:12px}}
nav a{{margin-right:15px;color:#007bff;text-decoration:none}}
nav{{margin-bottom:20px}}
</style></head><body><div class="container">
<nav><a href="/"><b>Dashboard</b></a><a href="/devices">Devices</a>
<a href="/users">Users</a><a href="/attendance">Attendance</a></nav><hr>{body}
</div></body></html>"""


@app.route("/")
def home():
    conn = db()
    d = conn.execute("SELECT COUNT(*) c FROM devices").fetchone()["c"]
    u = conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    a = conn.execute("SELECT COUNT(*) c FROM attlog").fetchone()["c"]
    latest = conn.execute(
        "SELECT a.pin, u.name, a.time, a.status FROM attlog a "
        "LEFT JOIN users u ON u.sn=a.sn AND u.pin=a.pin ORDER BY a.id DESC LIMIT 20"
    ).fetchall()
    conn.close()
    rows = "".join(
        f"<tr><td>{r['pin']}</td><td>{r['name'] or '-'}</td>"
        f"<td>{r['time']}</td><td><b>{r['status']}</b></td></tr>"
        for r in latest
    ) or "<tr><td colspan=4 style='text-align:center;color:#999'>No records yet</td></tr>"
    body = (
        f"<h2>ZKTeco Push Server</h2>"
        f"<div style='display:grid;grid-template-columns:repeat(3,1fr);gap:15px'>"
        f"<div class='card' style='text-align:center'><div class='stat-number'>{d}</div>Devices</div>"
        f"<div class='card' style='text-align:center'><div class='stat-number' style='color:#28a745'>{u}</div>Users</div>"
        f"<div class='card' style='text-align:center'><div class='stat-number' style='color:#dc3545'>{a}</div>Punch Records</div>"
        f"</div>"
        f"<div class='card'><h3>Latest Attendance</h3>"
        f"<table><tr><th>PIN</th><th>Name</th><th>Time</th><th>Status</th></tr>{rows}</table></div>"
        f"<div class='card'><p>ADMS endpoint: <code>http://&lt;this-server&gt;:{APP_PORT}/iclock/cdata</code></p></div>"
    )
    return _BASE.format(body=body)


@app.route("/devices")
def devices():
    conn = db()
    rows = conn.execute("SELECT * FROM devices ORDER BY last_seen_utc DESC").fetchall()
    conn.close()
    items = "".join(
        f"<div class='card'><b>{r['sn']}</b> — IP: {r['last_ip'] or '-'} "
        f"| Last seen: <span class='muted'>{r['last_seen_utc']}</span> "
        f"| Ver: {r['pushver'] or '-'}</div>"
        for r in rows
    ) or "<p style='color:#999'>No devices connected yet</p>"
    return _BASE.format(body=f"<h2>Devices ({len(rows)})</h2>{items}")


@app.route("/users")
def users():
    sn = request.args.get("sn", "").strip()
    q  = request.args.get("q",  "").strip()
    conn = db()
    params: List = []
    where: List[str] = []
    if sn:
        where.append("sn=?"); params.append(sn)
    if q:
        where.append("(pin LIKE ? OR name LIKE ?)"); params.extend([f"%{q}%", f"%{q}%"])
    w = ("WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"SELECT sn, pin, name, card, updated_at_utc FROM users {w} "
        f"ORDER BY sn, CAST(pin AS INTEGER) LIMIT 5000", params
    ).fetchall()
    conn.close()
    trs = "".join(
        f"<tr><td>{r['sn']}</td><td>{r['pin']}</td><td>{r['name'] or '-'}</td>"
        f"<td>{r['card'] or '-'}</td><td class='muted'>{r['updated_at_utc']}</td></tr>"
        for r in rows
    ) or "<tr><td colspan=5 style='text-align:center;color:#999'>No users yet</td></tr>"
    body = (
        f"<h2>Users ({len(rows)})</h2>"
        f"<form method='get'><input name='sn' value='{sn}' placeholder='Filter by device SN'> "
        f"<input name='q' value='{q}' placeholder='Search PIN/Name'> "
        f"<button type='submit'>Search</button></form>"
        f"<table><tr><th>Device</th><th>PIN</th><th>Name</th><th>Card</th><th>Updated</th></tr>"
        f"{trs}</table>"
    )
    return _BASE.format(body=body)


@app.route("/attendance")
def attendance():
    sn  = request.args.get("sn",  "").strip()
    pin = request.args.get("pin", "").strip()
    conn = db()
    params: List = []
    where: List[str] = []
    if sn:
        where.append("a.sn=?"); params.append(sn)
    if pin:
        where.append("a.pin=?"); params.append(pin)
    w = ("WHERE " + " AND ".join(where)) if where else ""
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
    ) or "<tr><td colspan=5 style='text-align:center;color:#999'>No records yet</td></tr>"
    body = (
        f"<h2>Attendance ({len(rows)})</h2>"
        f"<form method='get'><input name='sn' value='{sn}' placeholder='Device SN'> "
        f"<input name='pin' value='{pin}' placeholder='PIN'> "
        f"<button type='submit'>Filter</button></form>"
        f"<table><tr><th>Device</th><th>PIN</th><th>Name</th><th>Time</th><th>Status</th></tr>"
        f"{trs}</table>"
    )
    return _BASE.format(body=body)

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    ensure_db_settings()
    init_db()
    sync_attlogs_to_postgres()
    sync_users_to_postgres()
    print(f"""
╔══════════════════════════════════════════════════════╗
║  ZKTeco PUSH Server                                  ║
║  Port    : {APP_PORT}                                       ║
║  Database: {DB_PATH:<42}║
║  Dashboard: http://localhost:{APP_PORT}/                   ║
║  Waiting for device connections...                   ║
╚══════════════════════════════════════════════════════╝
    """)
    app.run(host=APP_HOST, port=APP_PORT, debug=False, use_reloader=False)
