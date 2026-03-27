# Hermes Remote Control

Hermes is split into two runtime folders:

- `server/` : Render-hosted control plane and web UI
- `local/` : Windows PC execution stack (listener + operator + tools)

This keeps cloud and local responsibilities separate.

## Folder Layout

- `server/server.py`: Render-facing API and webhook server
- `server/web/`: hosted web UI assets
- `server/requirements.txt`: dependencies for Render service
- `local/pc_listener.py`: local job listener that executes requests
- `local/hermes_operator.py`: local reasoning/orchestration loop
- `local/executor.py`: local tool implementations
- `local/remote_terminal.py`: remote CLI client
- `local/stress_test.py`: concurrent stress/load test client

## Render Setup

Deploy as a Python **Web Service**.

If using `render.yaml`, it is preconfigured with `rootDir: server`.
If setting manually in dashboard:

- Root Directory: `server`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python server.py`

Required environment variables:

- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GROQ_RPM_LIMIT`
- `HERMES_DEVICE_KEY`
- `HERMES_DEFAULT_DEVICE_ID`
- `HERMES_USER_TOKEN`
- `SYSTEM_PROMPT`

Optional environment variables:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_SECRET_TOKEN`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`

## Local PC Setup

Install local dependencies:

```powershell
pip install -r local/requirements.txt
```

Create local `.env` (in repo root) with at least:

```text
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b
GROQ_RPM_LIMIT=20
HERMES_SERVER_URL=https://your-render-app.onrender.com
HERMES_DEVICE_KEY=the_same_device_key_as_render
HERMES_DEVICE_ID=home-pc
HERMES_DEFAULT_DEVICE_ID=home-pc
HERMES_USER_TOKEN=your_user_token
```

Run your listener on the PC you want to control:

```powershell
python local/pc_listener.py
```

## How To Use It

Web:

- Open your Render URL in a browser.
- Send a message/task from the UI.
- Your PC listener receives and executes it locally.

Terminal from another machine:

```powershell
python local/remote_terminal.py "what time is it in UTC?"
```

Interactive terminal mode:

```powershell
python local/remote_terminal.py
```

## Stress Testing

Before stress testing, ensure `local/pc_listener.py` is running.

Run 20 requests at concurrency 5:

```powershell
python local/stress_test.py --requests 20 --concurrency 5
```

Heavier run (50 requests, concurrency 10):

```powershell
python local/stress_test.py --requests 50 --concurrency 10 --prompt "what time is it in UTC?"
```

The script reports success count, failure count, average latency, p95 latency, and max latency.

## Security Notes

- Use a long random value for `HERMES_DEVICE_KEY`.
- Use a separate long random value for `HERMES_USER_TOKEN`.
- Rotate any secret that was ever committed or pasted in logs/screenshots.
- Keep the local listener running only on trusted machines.
