#!/usr/bin/env python3
"""Terminal client that sends remote jobs to the Hermes control plane."""

from __future__ import annotations

import os
import sys

_here = os.path.dirname(os.path.abspath(__file__))
if sys.path and os.path.abspath(sys.path[0]) == _here:
    sys.path.pop(0)
    sys.path.append(_here)

import json
import time
import uuid
from pathlib import Path
from urllib import parse, request


def _load_dotenv(path: str = ".env") -> None:
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _post_json(url: str, payload: dict, headers: dict[str, str] | None = None) -> dict:
    req = request.Request(
        url=url,
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    with request.urlopen(req, timeout=30) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _get_json(url: str, headers: dict[str, str] | None = None) -> dict:
    req = request.Request(url=url, method="GET", headers=headers or {})
    with request.urlopen(req, timeout=30) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _send_and_wait(server_url: str, headers: dict[str, str], conversation_id: str, text: str) -> str:
    payload = _post_json(
        f"{server_url}/api/messages",
        {
            "text": text,
            "conversation_id": conversation_id,
            "channel": "terminal",
            "sender_id": "remote-terminal",
        },
        headers=headers,
    )
    job_id = payload["job_id"]

    while True:
        time.sleep(2)
        job = _get_json(f"{server_url}/api/jobs/{parse.quote(job_id)}", headers=headers)
        status = str(job.get("status", ""))
        if status == "completed":
            return str(job.get("result_text", "")).strip() or "(No response)"
        if status == "failed":
            error_text = str(job.get("error_text", "")).strip() or "Unknown remote failure"
            return f"ERROR: {error_text}"


def main() -> None:
    _load_dotenv()
    server_url = os.getenv("HERMES_SERVER_URL", "").rstrip("/")
    user_token = os.getenv("HERMES_USER_TOKEN", "").strip()
    if not server_url:
        raise SystemExit("HERMES_SERVER_URL is required")

    headers = {}
    if user_token:
        headers["X-User-Token"] = user_token

    conversation_id = os.getenv("HERMES_REMOTE_CONVERSATION_ID", f"terminal-{uuid.uuid4().hex[:8]}")
    if len(sys.argv) > 1:
        print(_send_and_wait(server_url, headers, conversation_id, " ".join(sys.argv[1:])))
        return

    print(f"Hermes remote terminal connected to {server_url}")
    print("Type /exit to quit.\n")
    while True:
        try:
            text = input("Remote> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not text:
            continue
        if text.lower() in {"/exit", "exit", "quit"}:
            break
        print(_send_and_wait(server_url, headers, conversation_id, text))
        print()


if __name__ == "__main__":
    main()