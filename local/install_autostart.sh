#!/bin/bash
# ============================================================
# Hermes PC Listener — Auto-start installer for Linux/Ubuntu
# Registers pc_listener.py as a systemd service so it
# starts automatically at system boot or user session start.
#
# Run once:
#   bash install_autostart.sh
# Or:
#   chmod +x install_autostart.sh
#   ./install_autostart.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON_EXE="${HERMES_OPERATOR_PYTHON:-python3}"
LISTENER="$SCRIPT_DIR/pc_listener.py"
SERVICE_NAME="hermes-pc-listener"

# Check if Python 3 is available
if ! command -v "$PYTHON_EXE" &> /dev/null; then
    echo "Error: Python 3 not found. Please install Python 3 and try again."
    exit 1
fi

# Check if listener script exists
if [ ! -f "$LISTENER" ]; then
    echo "Error: pc_listener.py not found at $LISTENER"
    exit 1
fi

echo ""
echo "[1/2] Creating systemd user service..."

# Create user service directory if it doesn't exist
SERVICE_DIR="$HOME/.config/systemd/user"
mkdir -p "$SERVICE_DIR"

# Create systemd service file for user-level auto-start
SERVICE_FILE="$SERVICE_DIR/${SERVICE_NAME}.service"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Hermes PC Listener - Remote job executor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$PYTHON_EXE $LISTENER
WorkingDirectory=$PROJECT_DIR
StandardOutput=journal
StandardError=journal
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

echo "    Created: $SERVICE_FILE"

echo ""
echo "[2/2] Enabling systemd service to auto-start at login..."

# Reload systemd user instance
systemctl --user daemon-reload

# Enable the service
systemctl --user enable "$SERVICE_NAME.service"
echo "    Enabled: $SERVICE_NAME"

echo ""
echo "============================================================"
echo "  SUCCESS"
echo "  Service '$SERVICE_NAME' created and enabled."
echo "  pc_listener.py will auto-start at login."
echo ""
echo "  To start it now without logging out/in:"
echo "    systemctl --user start $SERVICE_NAME"
echo ""
echo "  To check status:"
echo "    systemctl --user status $SERVICE_NAME"
echo ""
echo "  To view logs:"
echo "    journalctl --user -u $SERVICE_NAME -f"
echo ""
echo "  To disable auto-start later:"
echo "    systemctl --user disable $SERVICE_NAME"
echo ""
echo "  To stop the service:"
echo "    systemctl --user stop $SERVICE_NAME"
echo "============================================================"
echo ""
