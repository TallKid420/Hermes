#!/usr/bin/env python3
"""Hermes control plane for Render.

This server accepts messages from web, terminal, Telegram, and WhatsApp,
queues them as jobs, and returns results produced by a local PC listener.
"""

from __future__ import annotations

import os
import sys

_here = os.path.dirname(os.path.abspath(__file__))
if sys.path and os.path.abspath(sys.path[0]) == _here:
    sys.path.pop(0)
    sys.path.append(_here)

import json
import sqlite3
import threading
import uuid
from pathlib import Path
from urllib import parse, request

from flask import Flask, Response, jsonify, request as flask_request, send_from_directory


def _load_dotenv(path: str = ".env") -> None:
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

APP_ROOT = Path(__file__).parent
WEB_DIR = APP_ROOT / "web"
DB_PATH = APP_ROOT / os.getenv("HERMES_CLOUD_DB", "hermes_cloud.db")
PORT = int(os.getenv("PORT", os.getenv("HERMES_PORT", "10000")))
DEFAULT_DEVICE_ID = os.getenv("HERMES_DEFAULT_DEVICE_ID", "home-pc")
JOB_STALE_SECONDS = max(30, int(os.getenv("HERMES_JOB_STALE_SECONDS", "600")))

_db_lock = threading.Lock()
app = Flask(__name__, static_folder=None)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                channel TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT 'New Conversation',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                channel TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                channel TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                reply_target TEXT NOT NULL DEFAULT '',
                request_text TEXT NOT NULL,
                status TEXT NOT NULL,
                result_text TEXT NOT NULL DEFAULT '',
                error_text TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                claimed_at TEXT,
                finished_at TEXT
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_jobs_status_device ON jobs (status, device_id, created_at)"
        )
        conn.commit()


_init_db()


def _new_id() -> str:
    return uuid.uuid4().hex


def _json_body() -> dict:
    return flask_request.get_json(force=True, silent=True) or {}


def _require_user_token() -> Response | tuple[Response, int] | None:
    expected = os.getenv("HERMES_USER_TOKEN", "").strip()
    if not expected:
        return None
    actual = flask_request.headers.get("X-User-Token", "").strip()
    if actual == expected:
        return None
    return jsonify({"error": "Unauthorized"}), 401


def _require_device_key() -> Response | tuple[Response, int] | None:
    expected = os.getenv("HERMES_DEVICE_KEY", "").strip()
    if not expected:
        return jsonify({"error": "HERMES_DEVICE_KEY not configured on server"}), 503
    actual = flask_request.headers.get("X-Device-Key", "").strip()
    if actual == expected:
        return None
    return jsonify({"error": "Unauthorized device"}), 401


def _ensure_conversation(conversation_id: str, channel: str, sender_id: str) -> None:
    with _db_lock, _connect() as conn:
        row = conn.execute("SELECT id FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
        if row:
            conn.execute(
                "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (conversation_id,),
            )
        else:
            conn.execute(
                "INSERT INTO conversations (id, channel, sender_id) VALUES (?, ?, ?)",
                (conversation_id, channel, sender_id),
            )
        conn.commit()


def _append_message(conversation_id: str, role: str, content: str, channel: str) -> None:
    with _db_lock, _connect() as conn:
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, channel) VALUES (?, ?, ?, ?, ?)",
            (_new_id(), conversation_id, role, content, channel),
        )
        if role == "user":
            title = content.strip().splitlines()[0][:80] or "New Conversation"
            conn.execute(
                "UPDATE conversations SET title = COALESCE(NULLIF(title, 'New Conversation'), ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (title, conversation_id),
            )
        else:
            conn.execute(
                "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (conversation_id,),
            )
        conn.commit()


def _create_job(
    conversation_id: str,
    device_id: str,
    channel: str,
    sender_id: str,
    reply_target: str,
    text: str,
) -> str:
    job_id = _new_id()
    with _db_lock, _connect() as conn:
        conn.execute(
            """
            INSERT INTO jobs (
                id, conversation_id, device_id, channel, sender_id, reply_target, request_text, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')
            """,
            (job_id, conversation_id, device_id, channel, sender_id, reply_target, text),
        )
        conn.commit()
    return job_id


def _job_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "device_id": row["device_id"],
        "channel": row["channel"],
        "sender_id": row["sender_id"],
        "status": row["status"],
        "request_text": row["request_text"],
        "result_text": row["result_text"],
        "error_text": row["error_text"],
        "created_at": row["created_at"],
        "claimed_at": row["claimed_at"],
        "finished_at": row["finished_at"],
    }


def _telegram_send(chat_id: str, text: str) -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token or not chat_id:
        return
    payload = json.dumps({"chat_id": chat_id, "text": text[:4000]}).encode("utf-8")
    req = request.Request(
        url=f"https://api.telegram.org/bot{token}/sendMessage",
        method="POST",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with request.urlopen(req, timeout=20):  # noqa: S310
        pass


def _twilio_whatsapp_send(number: str, text: str) -> None:
    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    sender = os.getenv("TWILIO_WHATSAPP_FROM", "").strip()
    if not sid or not auth or not sender or not number:
        return
    form = parse.urlencode({"From": sender, "To": number, "Body": text[:1500]}).encode("utf-8")
    req = request.Request(
        url=f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        method="POST",
        data=form,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    import base64  # noqa: PLC0415

    req.add_header(
        "Authorization",
        "Basic " + base64.b64encode(f"{sid}:{auth}".encode("utf-8")).decode("ascii"),
    )
    with request.urlopen(req, timeout=20):  # noqa: S310
        pass


def _notify_completion(job_row: sqlite3.Row) -> None:
    text = job_row["result_text"] or job_row["error_text"] or "(No response)"
    try:
        if job_row["channel"] == "telegram":
            _telegram_send(job_row["reply_target"], text)
        elif job_row["channel"] == "whatsapp":
            _twilio_whatsapp_send(job_row["reply_target"], text)
    except Exception:
        pass


@app.after_request
def _add_cors(resp: Response) -> Response:
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-User-Token, X-Device-Key"
    return resp


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static(path: str):
    if path.startswith("api/") or path.startswith("webhooks/"):
        return Response("Not found", 404)
    if not path or path == "index.html":
        return send_from_directory(WEB_DIR, "index.html")
    target = (WEB_DIR / path).resolve()
    if not str(target).startswith(str(WEB_DIR.resolve())):
        return Response("Forbidden", 403)
    if target.exists() and target.is_file():
        return send_from_directory(WEB_DIR, path)
    return send_from_directory(WEB_DIR, "index.html")


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "healthy",
            "default_device_id": DEFAULT_DEVICE_ID,
            "db": str(DB_PATH.name),
        }
    )


@app.route("/api/conversations", methods=["GET", "OPTIONS"])
def list_conversations():
    if flask_request.method == "OPTIONS":
        return Response("", 200)
    auth = _require_user_token()
    if auth:
        return auth
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, title, channel, sender_id, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 50"
        ).fetchall()
    return jsonify({"conversations": [dict(row) for row in rows]})


@app.route("/api/conversations/<conversation_id>", methods=["GET", "OPTIONS"])
def get_conversation(conversation_id: str):
    if flask_request.method == "OPTIONS":
        return Response("", 200)
    auth = _require_user_token()
    if auth:
        return auth
    with _connect() as conn:
        messages = conn.execute(
            "SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
            (conversation_id,),
        ).fetchall()
        jobs = conn.execute(
            "SELECT id, status, request_text, result_text, error_text, created_at, finished_at FROM jobs WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 20",
            (conversation_id,),
        ).fetchall()
    return jsonify(
        {
            "conversation_id": conversation_id,
            "messages": [dict(row) for row in messages],
            "jobs": [dict(row) for row in jobs],
        }
    )


@app.route("/api/messages", methods=["POST", "OPTIONS"])
def create_message():
    if flask_request.method == "OPTIONS":
        return Response("", 200)
    auth = _require_user_token()
    if auth:
        return auth
    data = _json_body()
    text = str(data.get("text", "")).strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    channel = str(data.get("channel", "web")).strip() or "web"
    sender_id = str(data.get("sender_id", channel)).strip() or channel
    device_id = str(data.get("device_id", DEFAULT_DEVICE_ID)).strip() or DEFAULT_DEVICE_ID
    conversation_id = str(data.get("conversation_id", "")).strip() or _new_id()
    reply_target = str(data.get("reply_target", "")).strip()

    _ensure_conversation(conversation_id, channel, sender_id)
    _append_message(conversation_id, "user", text, channel)
    job_id = _create_job(conversation_id, device_id, channel, sender_id, reply_target, text)
    return jsonify({"job_id": job_id, "conversation_id": conversation_id, "status": "queued"})


@app.route("/api/jobs/<job_id>", methods=["GET", "OPTIONS"])
def get_job(job_id: str):
    if flask_request.method == "OPTIONS":
        return Response("", 200)
    auth = _require_user_token()
    if auth:
        return auth
    with _connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        return jsonify({"error": "job not found"}), 404
    return jsonify(_job_to_dict(row))


@app.route("/api/device/poll", methods=["POST"])
def device_poll():
    auth = _require_device_key()
    if auth:
        return auth
    data = _json_body()
    device_id = str(data.get("device_id", DEFAULT_DEVICE_ID)).strip() or DEFAULT_DEVICE_ID
    with _db_lock, _connect() as conn:
        row = conn.execute(
            """
            SELECT *
            FROM jobs
            WHERE device_id = ?
              AND (
                status = 'queued'
                OR (
                  status = 'running'
                  AND claimed_at IS NOT NULL
                  AND unixepoch('now') - unixepoch(claimed_at) > ?
                )
              )
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (device_id, JOB_STALE_SECONDS),
        ).fetchone()
        if not row:
            return jsonify({"job": None})

        conn.execute(
            "UPDATE jobs SET status = 'running', claimed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (row["id"],),
        )
        conn.commit()
        fresh = conn.execute("SELECT * FROM jobs WHERE id = ?", (row["id"],)).fetchone()
    return jsonify({"job": _job_to_dict(fresh)})


@app.route("/api/device/jobs/<job_id>/complete", methods=["POST"])
def device_complete(job_id: str):
    auth = _require_device_key()
    if auth:
        return auth
    data = _json_body()
    success = bool(data.get("success", True))
    output = str(data.get("output", "")).strip()
    error_text = str(data.get("error", "")).strip()

    with _db_lock, _connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            return jsonify({"error": "job not found"}), 404
        conn.execute(
            "UPDATE jobs SET status = ?, result_text = ?, error_text = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
            ("completed" if success else "failed", output, error_text, job_id),
        )
        final = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        assistant_text = output or error_text or "(No response)"
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, channel) VALUES (?, ?, 'assistant', ?, ?)",
            (_new_id(), row["conversation_id"], assistant_text, row["channel"]),
        )
        conn.execute(
            "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (row["conversation_id"],),
        )
        conn.commit()

    _notify_completion(final)
    return jsonify({"status": final["status"]})


@app.route("/webhooks/telegram", methods=["POST"])
def telegram_webhook():
    secret = os.getenv("TELEGRAM_SECRET_TOKEN", "").strip()
    if secret and flask_request.headers.get("X-Telegram-Bot-Api-Secret-Token", "") != secret:
        return jsonify({"error": "Unauthorized"}), 401

    data = _json_body()
    message = data.get("message") or {}
    text = str(message.get("text", "")).strip()
    chat = message.get("chat") or {}
    chat_id = str(chat.get("id", "")).strip()
    if not text or not chat_id:
        return jsonify({"ok": True})

    conversation_id = f"telegram:{chat_id}"
    _ensure_conversation(conversation_id, "telegram", chat_id)
    _append_message(conversation_id, "user", text, "telegram")
    _create_job(conversation_id, DEFAULT_DEVICE_ID, "telegram", chat_id, chat_id, text)
    return jsonify({"ok": True})


@app.route("/webhooks/whatsapp", methods=["POST"])
def whatsapp_webhook():
    text = str(flask_request.form.get("Body", "")).strip()
    sender = str(flask_request.form.get("From", "")).strip()
    if not text or not sender:
        return Response("<Response></Response>", mimetype="application/xml")

    conversation_id = f"whatsapp:{sender}"
    _ensure_conversation(conversation_id, "whatsapp", sender)
    _append_message(conversation_id, "user", text, "whatsapp")
    _create_job(conversation_id, DEFAULT_DEVICE_ID, "whatsapp", sender, sender, text)
    return Response("<Response></Response>", mimetype="application/xml")


if __name__ == "__main__":
    print(f"Hermes control plane listening on http://127.0.0.1:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
