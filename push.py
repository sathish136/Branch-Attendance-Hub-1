#!/usr/bin/env python3
"""
ZKTeco PUSH Server
==================
Listens on port 3333 for ZKTeco device connections.
Stores data in push.db (SQLite) as a local buffer,
then forwards device/user/attlog data to the API server via HTTP.

Usage:
    python push.py

Set API server URL via environment variable:
    API_BASE_URL   (default: http://localhost:8080)
"""

from __future__ import annotations

import os
import re
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional

import requests
from flask import Flask, request, Response, jsonify

# ============================================================================
# CONFIG
# ============================================================================

APP_HOST = "0.0.0.0"
APP_PORT = int(os.environ.get("ADMS_PORT", 3333))
DB_PATH  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "push.db")

_REPLIT_DEV_DOMAIN = os.environ.get("REPLIT_DEV_DOMAIN", "")
_API_PORT          = os.environ.get("API_PORT", "8080")

if _REPLIT_DEV_DOMAIN:
    PUBLIC_BASE_URL = f"https://{APP_PORT}-{_REPLIT_DEV_DOMAIN}"
    _default_api    = f"https://{_REPLIT_DEV_DOMAIN}"
else:
    PUBLIC_BASE_URL = f"http://localhost:{APP_PORT}"
    _default_api    = f"http://localhost:{_API_PORT}"

API_BASE_URL = os.environ.get("API_BASE_URL", _default_api).rstrip("/")

app = Flask(__name__)

# ============================================================================
# SQLITE (local buffer)
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
        received_at_utc TEXT,
        synced INTEGER NOT NULL DEFAULT 0
    );
    """)
    conn.commit()
    conn.close()
    print(f"[DB] SQLite ready: {DB_PATH}")

# ============================================================================
# API CLIENT
# ============================================================================

def api_post(path: str, payload: dict) -> Optional[dict]:
    url = f"{API_BASE_URL}{path}"
    try:
        r = requests.post(url, json=payload, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[API] POST {path} failed: {e}")
        return None


def push_device_to_api(sn: str, ip: str, pushver: str = "") -> None:
    result = api_post("/api/biometric/push-device", {
        "serialNumber": sn,
        "ipAddress": ip,
        "pushver": pushver,
    })
    if result:
        print(f"[API] Device {sn} synced: {result.get('action', '?')}")


def push_logs_to_api(sn: str, records: List[dict]) -> None:
    if not records:
        return
    result = api_post("/api/biometric/push-logs", {"sn": sn, "records": records})
    if result:
        inserted = result.get("inserted", 0)
        if inserted:
            print(f"[API] Pushed {inserted} logs for device {sn}")


def push_users_to_api(users: List[dict]) -> None:
    if not users:
        return
    result = api_post("/api/biometric/sync-users", {"users": users})
    if result:
        updated = result.get("updated", 0)
        if updated:
            print(f"[API] Synced {updated} employee names")

# ============================================================================
# SQLITE HELPERS
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

    threading.Thread(target=push_device_to_api, args=(sn, ip, pushver), daemon=True).start()


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

    if name:
        threading.Thread(
            target=push_users_to_api,
            args=([{"sn": sn, "pin": pin, "name": name}],),
            daemon=True,
        ).start()


def insert_attlog(sn: str, rec: Dict[str, str], raw_line: str) -> None:
    conn = db()
    conn.execute("""
        INSERT INTO attlog
          (sn, pin, time, status, verify, workcode, raw_line, received_at_utc, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    """, (sn, rec.get("pin",""), rec.get("time",""), rec.get("status",""),
          rec.get("verify",""), rec.get("workcode",""), raw_line, utc_now_iso()))
    conn.commit()
    conn.close()

    threading.Thread(
        target=push_logs_to_api,
        args=(sn, [{
            "pin":      rec.get("pin", ""),
            "time":     rec.get("time", ""),
            "status":   rec.get("status", "0"),
            "verify":   rec.get("verify", ""),
            "workcode": rec.get("workcode", ""),
        }]),
        daemon=True,
    ).start()

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
# STARTUP SYNC (unsynced SQLite records → API)
# ============================================================================

def sync_pending_to_api() -> None:
    conn  = db()
    rows  = conn.execute(
        "SELECT sn, pin, time, status, verify, workcode FROM attlog WHERE synced=0 ORDER BY id"
    ).fetchall()
    conn.close()
    if not rows:
        return

    by_sn: Dict[str, list] = {}
    for r in rows:
        by_sn.setdefault(r["sn"], []).append({
            "pin":      r["pin"],
            "time":     r["time"],
            "status":   r["status"],
            "verify":   r["verify"],
            "workcode": r["workcode"],
        })

    for sn, records in by_sn.items():
        print(f"[SYNC] Syncing {len(records)} pending records for device {sn}...")
        push_device_to_api(sn, "")
        push_logs_to_api(sn, records)

    print(f"[SYNC] Startup sync complete.")

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
        f"<div class='card'>"
        f"<b>ADMS Server URL:</b> <code>{PUBLIC_BASE_URL}/iclock/cdata</code><br>"
        f"<small style='color:#666'>API forwarding to: {API_BASE_URL}</small>"
        f"</div>"
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
    init_db()
    sync_pending_to_api()
    print(f"[ZKTeco Push] Listening on {APP_HOST}:{APP_PORT}")
    print(f"[ZKTeco Push] Public URL: {PUBLIC_BASE_URL}/iclock/cdata")
    print(f"[ZKTeco Push] Forwarding to API: {API_BASE_URL}")
    app.run(host=APP_HOST, port=APP_PORT, debug=False, use_reloader=False)
