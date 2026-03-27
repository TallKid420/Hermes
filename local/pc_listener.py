#!/usr/bin/env python3
"""Local PC listener that polls the Render control plane and executes jobs."""

from __future__ import annotations

import os
import sys

_here = os.path.dirname(os.path.abspath(__file__))
if sys.path and os.path.abspath(sys.path[0]) == _here:
    sys.path.pop(0)
    sys.path.append(_here)

import json
import subprocess
import time
from pathlib import Path
from urllib import request


def _load_dotenv(path: str = ".env") -> None:
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _http_json(url: str, payload: dict, headers: dict[str, str] | None = None) -> dict:
    raw = json.dumps(payload).encode("utf-8")
    req = request.Request(url=url, method="POST", data=raw, headers={"Content-Type": "application/json", **(headers or {})})
    with request.urlopen(req, timeout=30) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _format_output(text: str) -> str:
    lines = []
    for line in text.splitlines():
        if line.startswith("[Usage]") or line.startswith("[Step ") or line.startswith("[Operator]"):
            continue
        if line.startswith("  ") and "->" in line:
            continue
        if line.startswith("Operator ready") or line.startswith("Compound routing model"):
            continue
        if line.startswith("Type a task and press Enter"):
            continue
        if line and set(line) == {"-"}:
            continue
        if line.startswith("Hermes: "):
            lines.append(line[len("Hermes: "):])
        else:
            lines.append(line)
    return "\n".join(line for line in lines if line.strip()).strip()


def _execute_job(task: str) -> tuple[bool, str, str]:
    script_dir = Path(__file__).parent
    python_exe = os.getenv("HERMES_OPERATOR_PYTHON", sys.executable)
    operator_script = os.getenv("HERMES_OPERATOR_SCRIPT", str(script_dir / "hermes_operator.py"))
    timeout = max(30, int(os.getenv("HERMES_OPERATOR_TIMEOUT", "1800")))
    try:
        child_env = dict(os.environ)
        child_env["PYTHONIOENCODING"] = "utf-8"
        result = subprocess.run(
            [python_exe, operator_script, task],
            cwd=script_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            env=child_env,
        )
    except subprocess.TimeoutExpired:
        return False, "", f"Timed out after {timeout} seconds"
    except Exception as exc:
        return False, "", str(exc)

    stdout = _format_output(result.stdout or "")
    stderr = (result.stderr or "").strip()
    if result.returncode != 0:
        return False, stdout, stderr or f"hermes_operator.py exited with code {result.returncode}"
    return True, stdout or "(No response)", stderr


def main() -> None:
    _load_dotenv()

    server_url = os.getenv("HERMES_SERVER_URL", "").rstrip("/")
    device_id = os.getenv("HERMES_DEVICE_ID", os.getenv("HERMES_DEFAULT_DEVICE_ID", "home-pc")).strip() or "home-pc"
    device_key = os.getenv("HERMES_DEVICE_KEY", "").strip()
    poll_interval = max(1, int(os.getenv("HERMES_POLL_INTERVAL", "2")))

    if not server_url:
        raise SystemExit("HERMES_SERVER_URL is required")
    if not device_key:
        raise SystemExit("HERMES_DEVICE_KEY is required")

    headers = {"X-Device-Key": device_key}
    print(f"Hermes PC listener running for device '{device_id}' against {server_url}")

    while True:
        try:
            payload = _http_json(f"{server_url}/api/device/poll", {"device_id": device_id}, headers=headers)
            job = payload.get("job")
            if not job:
                time.sleep(poll_interval)
                continue

            job_id = str(job.get("id", ""))
            request_text = str(job.get("request_text", ""))
            print(f"[Job] {job_id} -> {request_text}")
            success, output, error_text = _execute_job(request_text)
            _http_json(
                f"{server_url}/api/device/jobs/{job_id}/complete",
                {"success": success, "output": output, "error": error_text},
                headers=headers,
            )
        except KeyboardInterrupt:
            print("\nStopping listener.")
            break
        except Exception as exc:
            print(f"[Listener] Error: {exc}")
            time.sleep(max(poll_interval, 5))


if __name__ == "__main__":
    main()