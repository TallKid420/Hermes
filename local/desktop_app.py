#!/usr/bin/env python3
"""
Hermes Desktop App
Opens the Hermes web UI in a native desktop window (uses Windows Edge WebView2).
Reads .env automatically so you don't need to enter settings in the sidebar.

Run:
    python local/desktop_app.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_here = Path(__file__).parent


def _load_dotenv() -> None:
    for candidate in [_here / ".." / ".env", _here / ".env"]:
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


_load_dotenv()

try:
    import webview  # type: ignore
except ImportError:
    print("pywebview is not installed.")
    print("Run:  pip install pywebview")
    sys.exit(1)

SERVER_URL = os.getenv("HERMES_SERVER_URL", "").rstrip("/")
USER_TOKEN = os.getenv("HERMES_USER_TOKEN", "")
DEVICE_ID = os.getenv("HERMES_DEFAULT_DEVICE_ID", "home-pc")

if not SERVER_URL:
    print("HERMES_SERVER_URL is not set in .env")
    sys.exit(1)


def _inject_settings(window: "webview.Window") -> None:
    """Pre-fill localStorage with credentials so the sidebar is pre-configured."""
    settings = json.dumps(
        {"apiBase": SERVER_URL, "userToken": USER_TOKEN, "deviceId": DEVICE_ID}
    )
    # Only write if not already set, then reload once
    window.evaluate_js(f"""
        (function() {{
            if (!localStorage.getItem('hermesSettings')) {{
                localStorage.setItem('hermesSettings', {json.dumps(settings)});
                location.reload();
            }}
        }})();
    """)


def main() -> None:
    window = webview.create_window(
        title="Hermes",
        url=SERVER_URL,
        width=1080,
        height=720,
        min_size=(600, 450),
    )
    window.events.loaded += lambda: _inject_settings(window)
    webview.start(debug=False)


if __name__ == "__main__":
    main()
