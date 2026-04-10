# Hermes 2.0 Quick Start - Ubuntu / EVO-T1

**TL;DR**: Get Hermes running on Ubuntu/EVO-T1 in 5 minutes.

## Prerequisites

- Ubuntu 20.04+ or any Linux distro
- Python 3.9+
- Internet connection
- A router device ID and API key (from your Render setup)

## Installation (5 minutes)

```bash
# 1. Clone the project
git clone https://github.com/TallKid420/Hermes.git
cd Hermes

# 2. Install Python & dependencies
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r local/requirements.txt

# 3. Setup config
cp .env.example .env
nano .env
# Set these minimum:
# HERMES_SERVER_URL=https://hermes-eg8n.onrender.com
# HERMES_DEVICE_KEY=your-key-here
# HERMES_DEFAULT_DEVICE_ID=mydevice

# 4. Test connection
curl -s https://hermes-eg8n.onrender.com/api/health | python -m json.tool

# 5. Start the listener
python local/pc_listener.py
```

Expected output:
```
Hermes PC listener running for device 'mydevice' against https://hermes-eg8n.onrender.com
```

Press `Ctrl+C` to stop.

## Auto-Start on Boot

```bash
chmod +x local/install_autostart.sh
./local/install_autostart.sh

# Check status
systemctl --user status hermes-pc-listener

# View logs
journalctl --user -u hermes-pc-listener -f

# Stop service
systemctl --user stop hermes-pc-listener
```

## Send a Test Command

```bash
# In another terminal
source venv/bin/activate
python local/remote_terminal.py "get_system_info"
```

## For EVO-T1 or Raspberry Pi

Same steps! The code auto-detects ARM architecture.

**Note**: First install may take 10-20 minutes on ARM (wheels compile). Subsequent starts are instant.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "ModuleNotFoundError" | `pip install -r local/requirements.txt` |
| Connection refused | Check `.env` HERMES_SERVER_URL is correct |
| Permission denied | `chmod +x local/pc_listener.py` |
| Port already in use | That's OK, listener doesn't use ports |

## What's Running?

- **pc_listener.py** - Polls your Render server every 2 seconds for jobs
- **Executes jobs** - Uses hermes_operator.py with local AI
- **Returns results** - Posts back to server

## Next Steps

1. Send jobs via web UI: https://hermes-eg8n.onrender.com
2. Or use terminal: `python local/remote_terminal.py "your command"`
3. Monitor: `journalctl --user -u hermes-pc-listener -f`

See [UBUNTU_SETUP.md](UBUNTU_SETUP.md) for detailed guide.
