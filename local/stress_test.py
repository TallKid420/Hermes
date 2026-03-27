#!/usr/bin/env python3
"""Basic load/stress test for Hermes control plane.

Usage examples:
  python local/stress_test.py --requests 20 --concurrency 5
  python local/stress_test.py --requests 50 --concurrency 10 --prompt "what time is it in UTC?"
"""

from __future__ import annotations

import argparse
import json
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib import request


def load_dotenv(path: str = ".env") -> None:
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def post_json(url: str, payload: dict, headers: dict[str, str]) -> dict:
    raw = json.dumps(payload).encode("utf-8")
    req = request.Request(url=url, method="POST", data=raw, headers={"Content-Type": "application/json", **headers})
    with request.urlopen(req, timeout=30) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def get_json(url: str, headers: dict[str, str]) -> dict:
    req = request.Request(url=url, method="GET", headers=headers)
    with request.urlopen(req, timeout=30) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def send_and_wait(server_url: str, headers: dict[str, str], device_id: str, prompt: str, timeout_sec: int) -> tuple[bool, float, str]:
    start = time.time()
    conv_id = f"stress-{uuid.uuid4().hex[:10]}"
    msg = post_json(
        f"{server_url}/api/messages",
        {
            "text": prompt,
            "conversation_id": conv_id,
            "channel": "stress",
            "sender_id": "stress-test",
            "device_id": device_id,
        },
        headers,
    )
    job_id = msg.get("job_id")
    if not job_id:
        return False, 0.0, "no job_id returned"

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        time.sleep(1.0)
        job = get_json(f"{server_url}/api/jobs/{job_id}", headers)
        status = str(job.get("status", ""))
        if status == "completed":
            return True, time.time() - start, ""
        if status == "failed":
            return False, time.time() - start, str(job.get("error_text", "job failed"))
    return False, time.time() - start, "timeout"


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser()
    parser.add_argument("--requests", type=int, default=20)
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--prompt", type=str, default="what time is it in UTC?")
    args = parser.parse_args()

    server_url = os.getenv("HERMES_SERVER_URL", "").rstrip("/")
    user_token = os.getenv("HERMES_USER_TOKEN", "").strip()
    device_id = os.getenv("HERMES_DEVICE_ID", os.getenv("HERMES_DEFAULT_DEVICE_ID", "home-pc")).strip() or "home-pc"

    if not server_url:
        raise SystemExit("HERMES_SERVER_URL is required")

    headers = {}
    if user_token:
        headers["X-User-Token"] = user_token

    print(f"Stress test target: {server_url}")
    print(f"Requests: {args.requests}, Concurrency: {args.concurrency}, Device: {device_id}")

    ok_count = 0
    fail_count = 0
    timings: list[float] = []
    lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
        futures = [
            pool.submit(send_and_wait, server_url, headers, device_id, args.prompt, args.timeout)
            for _ in range(max(1, args.requests))
        ]
        for fut in as_completed(futures):
            ok, secs, err = fut.result()
            with lock:
                timings.append(secs)
                if ok:
                    ok_count += 1
                else:
                    fail_count += 1
                    print(f"FAIL after {secs:.1f}s: {err}")

    if timings:
        avg = sum(timings) / len(timings)
        p95 = sorted(timings)[int(0.95 * (len(timings) - 1))]
        mx = max(timings)
    else:
        avg = p95 = mx = 0.0

    print("\n=== Stress Test Summary ===")
    print(f"Success: {ok_count}")
    print(f"Failed : {fail_count}")
    print(f"Avg sec: {avg:.2f}")
    print(f"P95 sec: {p95:.2f}")
    print(f"Max sec: {mx:.2f}")


if __name__ == "__main__":
    main()
