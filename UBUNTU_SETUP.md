# Hermes 2.0 - Ubuntu/Linux Setup Guide

This guide helps you run Hermes 2.0 on Ubuntu, Raspberry Pi, or other ARM-based Linux devices like the EVO-T1.

## System Requirements

- **OS**: Ubuntu 20.04 LTS or later (or any Debian-based Linux distro)
- **Python**: 3.9 or later
- **Architecture**: x86_64, ARM64, or ARM32 (ARMv7)
- **RAM**: 1GB minimum (2GB+ recommended)
- **Storage**: 1GB free space
- **Network**: Internet connection for API calls

## Installation Steps

### 1. Download/Clone Hermes

```bash
cd ~
git clone https://github.com/TallKid420/Hermes.git
cd Hermes
```

Or if you already have the project:
```bash
cd /path/to/Hermes
```

### 2. Install Python Dependencies

```bash
# Update package manager
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install --upgrade pip setuptools wheel
pip install -r server/requirements.txt
pip install -r local/requirements.txt
```

**Note**: On ARM devices (like Raspberry Pi or EVO-T1), some packages may take a few minutes to compile. This is normal.

### 3. Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings
nano .env
```

Essential variables to set:
```bash
HERMES_SERVER_URL=https://hermes-eg8n.onrender.com  # Your Render cloud URL
HERMES_USER_TOKEN=your_token_here                    # Your auth token
HERMES_DEFAULT_DEVICE_ID=home-server                # Unique device name
HERMES_DEVICE_KEY=your_device_key_here              # Device auth key
HERMES_POLL_INTERVAL=2                              # Poll frequency (seconds)
GROQ_API_KEY=your_groq_key                          # LLM API key
```

### 4. Run the PC Listener (Headless)

The PC listener connects to the remote Render server and executes jobs:

```bash
source venv/bin/activate
python local/pc_listener.py
```

You should see:
```
Hermes PC listener running for device 'home-server' against https://hermes-eg8n.onrender.com
```

### 5. Auto-Start on Boot (Optional)

To automatically start the listener when the system boots:

```bash
chmod +x local/install_autostart.sh
./local/install_autostart.sh
```

This creates a systemd user service. Check status with:
```bash
systemctl --user status hermes-pc-listener
```

View logs:
```bash
journalctl --user -u hermes-pc-listener -f
```

## Running on Different Platforms

### Desktop PC (with GUI)

If you want the desktop app with a GUI window:

```bash
# Install additional dependencies
sudo apt-get install -y libglib2.0-0 libwebkit2gtk-4.0-0

# Run the desktop app
python local/desktop_app.py
```

### Headless Server (EVO-T1, Raspberry Pi, Docker)

For headless operation (no GUI), just run the listener:

```bash
python local/pc_listener.py
```

### Docker Container

Create a Dockerfile:

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY . /app

RUN apt-get update && apt-get install -y \
    git curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install -U pip setuptools wheel && \
    pip install -r server/requirements.txt && \
    pip install -r local/requirements.txt

COPY .env .env

CMD ["python", "local/pc_listener.py"]
```

Build and run:
```bash
docker build -t hermes-listener .
docker run -d --name hermes --env-file .env hermes-listener
```

### With systemd Service (Recommended for Always-On)

```bash
# File: /etc/systemd/system/hermes-listener.service

[Unit]
Description=Hermes PC Listener
After=network-online.target

[Service]
Type=simple
User=hermes
WorkingDirectory=/home/hermes/Hermes
ExecStart=/home/hermes/Hermes/venv/bin/python /home/hermes/Hermes/local/pc_listener.py
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable hermes-listener
sudo systemctl start hermes-listener
systemctl status hermes-listener
```

## Troubleshooting

### Connection Fails

```bash
# Check if server is reachable
curl -s https://hermes-eg8n.onrender.com/api/health | python -m json.tool

# Test your credentials
python -c "from urllib import request, parse; import os; 
headers = {'X-Device-Key': os.getenv('HERMES_DEVICE_KEY')}
url = os.getenv('HERMES_SERVER_URL')
print(f'Testing {url}...')
"
```

### Module Not Found Errors

```bash
# Activate virtual environment
source venv/bin/activate

# Reinstall dependencies
pip install -r local/requirements.txt
```

### Permission Denied Errors

```bash
# Check script permissions
ls -la local/pc_listener.py

# Make executable if needed
chmod +x local/pc_listener.py

# On systemd, ensure correct permissions
ls -la /etc/systemd/system/hermes-listener.service
```

### Slow on ARM Boards

If running on Raspberry Pi or similar ARM device:

```bash
# Pre-compile packages to speed things up
pip install --only-binary=:all: -r local/requirements.txt
```

Or use pre-compiled wheels:
```bash
# For RPi/ARM, use appropriate Python versions
python3 -m pip install cython numpy scipy --compile --no-cache-dir
```

## Testing the Setup

Once running, send a test request from the web UI or terminal:

```bash
# Terminal client
python local/remote_terminal.py "list_directory('/home')"
```

Or use the web interface at `https://hermes-eg8n.onrender.com`

## Monitoring

Check if listener is actively polling:

```bash
# Watch logs in real-time
journalctl --user -u hermes-pc-listener -f

# Or monitor process
watch -n 1 'ps aux | grep pc_listener'
```

## Uninstall

```bash
# Remove systemd service
systemctl --user stop hermes-pc-listener
systemctl --user disable hermes-pc-listener
rm ~/.config/systemd/user/hermes-pc-listener.service
systemctl --user daemon-reload

# Remove virtual environment
rm -rf venv

# Optional: remove code
rm -rf Hermes
```

## Cross-Platform Notes

### Compatibility Changes Made

The Hermes codebase has been updated for cross-platform compatibility:

- ✅ Shell commands: Auto-detect bash (Linux) vs PowerShell (Windows)
- ✅ Process management: Use `ps`/`kill` on Linux, `tasklist`/`taskkill` on Windows
- ✅ File operations: Path separators handled automatically
- ✅ Protected paths: System-specific critical paths protected
- ✅ Desktop app: pywebview works on Linux/Windows/macOS
- ✅ Auto-start: Systemd on Linux, Task Scheduler on Windows

### Known Limitations

- Voice input may require additional audio libraries on headless systems
- Some system info functions may return different formats on different OS
- Desktop GUI (pywebview) requires graphical environment on Linux

## Next Steps

1. Test the connection works: `curl https://hermes-eg8n.onrender.com/api/health`
2. Enable auto-start: `./local/install_autostart.sh`
3. Send your first job via the web UI or terminal client
4. Monitor logs: `journalctl --user -u hermes-pc-listener -f`

## Support

For issues or questions:
1. Check logs: `journalctl --user -u hermes-pc-listener -f`
2. Verify .env configuration
3. Ensure network connectivity
4. Check Python version: `python3 --version` (should be 3.9+)
