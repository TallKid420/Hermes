# Hermes Remote Control

Hermes is a split control-plane setup:

- Render hosts the public server and web UI.
- Your Windows PC runs a local listener that polls the server and executes tasks locally through `operator.py` and `executor.py`.
- You can send tasks from the web UI, the remote terminal client, Telegram, or WhatsApp.

## Files

- `server.py`: Render-facing control plane and web server
- `pc_listener.py`: local Windows listener that executes queued jobs
- `remote_terminal.py`: remote CLI client
- `operator.py`: local reasoning and tool orchestration
- `executor.py`: local tool implementations
- `web/`: hosted web UI
- `render.yaml`: Render deployment manifest

## GitHub Setup

1. Copy `.env.example` to `.env` locally and fill in real secrets.
2. Do not commit `.env`; it is ignored by `.gitignore`.
3. Initialize a git repository if needed:

```powershell
git init -b main
git add .
git commit -m "Initial Hermes remote control setup"
```

4. Create a new empty GitHub repository.
5. Add the remote and push:

```powershell
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

## Render Setup

Deploy the repository to Render as a Python web service. `render.yaml` already defines the service.

Set these Render environment variables:

- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GROQ_RPM_LIMIT`
- `HERMES_DEVICE_KEY`
- `HERMES_DEFAULT_DEVICE_ID`
- `HERMES_USER_TOKEN`
- `TELEGRAM_BOT_TOKEN` if using Telegram
- `TELEGRAM_SECRET_TOKEN` if using Telegram webhook verification
- `TWILIO_ACCOUNT_SID` if using WhatsApp through Twilio
- `TWILIO_AUTH_TOKEN` if using WhatsApp through Twilio
- `TWILIO_WHATSAPP_FROM` if using WhatsApp through Twilio
- `SYSTEM_PROMPT`

Render start command:

```text
gunicorn server:app
```

## Local PC Setup

Create a local `.env` on your PC with at least:

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

Run the local listener:

```powershell
python pc_listener.py
```

## Remote Terminal

From another machine:

```powershell
python remote_terminal.py "what time is it in UTC?"
```

Or run interactive mode:

```powershell
python remote_terminal.py
```

## Web UI

Once deployed, open your Render URL. The UI served from `web/` lets you:

- set API base URL
- set user token
- choose a target device
- send tasks and poll job results

## Telegram and WhatsApp

Telegram webhook:

- point Telegram to `/webhooks/telegram`
- set `TELEGRAM_SECRET_TOKEN`

WhatsApp webhook:

- point Twilio to `/webhooks/whatsapp`

## Security Notes

- Use a long random value for `HERMES_DEVICE_KEY`.
- Use a separate long random value for `HERMES_USER_TOKEN`.
- Rotate any secret that was ever committed or pasted into a public place.
- Keep the local listener running only on machines you trust.
