#!/usr/bin/env python3
"""
Hermes Desktop App
Opens the Hermes web UI in a native desktop window (uses Windows Edge WebView2).
Reads .env automatically so you don't need to enter settings in the sidebar.

Automatically starts:
  - server/server.py  (Flask control plane)
  - local/pc_listener.py  (job executor)

Run:
    python local/desktop_app.py
"""

from __future__ import annotations

import atexit
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError

_here = Path(__file__).parent
_project_root = (_here / "..").resolve()

_procs: list[subprocess.Popen] = []


def _load_dotenv() -> None:
    for candidate in [_project_root / ".env", _here / ".env"]:
        p = candidate.resolve()
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, value = line.partition("=")
                    os.environ.setdefault(
                        key.strip(), value.strip().strip('"').strip("'")
                    )
            break


def _kill_procs() -> None:
    for p in _procs:
        try:
            p.terminate()
        except Exception:
            pass


def _start_background(script: Path, label: str) -> None:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.Popen(
        [sys.executable, str(script)],
        cwd=str(script.parent),
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW,  # hide console window on Windows
    )
    _procs.append(proc)
    print(f"[desktop_app] Started {label} (pid {proc.pid})")


def _wait_for_server(url: str, timeout: int = 15) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urlopen(f"{url}/health", timeout=2)
            return True
        except (URLError, Exception):
            time.sleep(0.5)
    return False


_load_dotenv()

try:
    import webview  # type: ignore
except ImportError:
    print("pywebview is not installed.")
    print("Run:  pip install pywebview")
    sys.exit(1)

PORT = int(os.getenv("HERMES_PORT", "10000"))
SERVER_URL = os.getenv("HERMES_SERVER_URL", "").rstrip("/")
USER_TOKEN = os.getenv("HERMES_USER_TOKEN", "")
DEVICE_ID = os.getenv("HERMES_DEFAULT_DEVICE_ID", "home-pc")

# If the URL points to Render (or any external host) we still start the listener
# but open the remote URL.  If it's localhost / empty we run the server locally.
_local_url = f"http://localhost:{PORT}"
_use_local_server = (not SERVER_URL) or ("localhost" in SERVER_URL) or ("127.0.0.1" in SERVER_URL)

if _use_local_server:
    SERVER_URL = _local_url


def _start_services() -> None:
    atexit.register(_kill_procs)

    if _use_local_server:
        server_script = _project_root / "server" / "server.py"
        if server_script.exists():
            _start_background(server_script, "server.py")
            print(f"[desktop_app] Waiting for server on {SERVER_URL} ...")
            if not _wait_for_server(SERVER_URL, timeout=20):
                print("[desktop_app] WARNING: server did not respond in time, opening anyway.")
        else:
            print(f"[desktop_app] WARNING: server.py not found at {server_script}")

    listener_script = _here / "pc_listener.py"
    if listener_script.exists():
        _start_background(listener_script, "pc_listener.py")
    else:
        print(f"[desktop_app] WARNING: pc_listener.py not found at {listener_script}")


def _inject_settings(window: "webview.Window") -> None:
    """Pre-fill localStorage with credentials so the sidebar is pre-configured."""
    settings = json.dumps(
        {"apiBase": SERVER_URL, "userToken": USER_TOKEN, "deviceId": DEVICE_ID}
    )
    window.evaluate_js(f"""
        (function() {{
            if (!localStorage.getItem('hermesSettings')) {{
                localStorage.setItem('hermesSettings', {json.dumps(settings)});
                location.reload();
            }}
        }})();
    """)


def main() -> None:
    _start_services()

    window = webview.create_window(
        title="Hermes",
        url=SERVER_URL,
        width=1080,
        height=720,
        min_size=(600, 450),
    )
    window.events.loaded += lambda: _inject_settings(window)
    webview.start(debug=False)

    # When the window closes, terminate background processes
    _kill_procs()


if __name__ == "__main__":
    main()
