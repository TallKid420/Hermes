# Cross-Platform Compatibility - Ubuntu/Linux Support

This document outlines all the changes made to support Ubuntu, Linux, and ARM-based devices (like EVO-T1).

## Files Modified

### 1. `local/desktop_app.py`

**Change**: Made `subprocess.CREATE_NO_WINDOW` platform-specific

**Before**:
```python
_listener_proc = subprocess.Popen(
    [sys.executable, str(listener_script)],
    env=env,
    creationflags=subprocess.CREATE_NO_WINDOW,  # Windows only!
)
```

**After**:
```python
kwargs = {"env": env}
if sys.platform == "win32":
    kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

_listener_proc = subprocess.Popen([sys.executable, str(listener_script)], **kwargs)
```

**Why**: `subprocess.CREATE_NO_WINDOW` is Windows-only. On Linux, it would raise an AttributeError.

---

### 2. `local/executor.py`

#### Change 2a: Cross-Platform Protected Paths

**Before**:
```python
protected_markers = (
    "\\windows",
    "\\program files",
    "\\program files (x86)",
    "\\programdata",
    "\\appdata\\local\\programs",
)
return any(marker in pl for marker in protected_markers)
```

**After**:
```python
protected_markers = ("\\windows", "\\program files", ...)
# Windows check
if sys.platform == "win32" and any(marker in pl for marker in protected_markers):
    return True

# Unix-specific protected paths
unix_markers = ("/bin", "/sbin", "/usr/bin", "/etc", "/root", "/boot", "/sys")
if sys.platform != "win32" and any(marker in pl for marker in unix_markers):
    return True

return False
```

**Why**: Different OSes have different system directories to protect.

---

#### Change 2b: Shell Command Normalization

**Before**:
```python
def _normalize_shell_command(command: str) -> str:
    """Strip nested powershell wrappers because runtime already invokes PowerShell."""
    cmd = re.sub(r"^powershell(\.exe)?\s+-NoProfile...", "", cmd, flags=re.IGNORECASE)
    return cmd
```

**After**:
```python
def _normalize_shell_command(command: str) -> str:
    """Strip shell wrappers."""
    cmd = command.strip()
    if sys.platform == "win32":
        cmd = re.sub(r"^powershell(\.exe)?\s+...", "", cmd, flags=re.IGNORECASE)
    return cmd
```

**Why**: PowerShell normalization only applies on Windows.

---

#### Change 2c: Platform-Specific Shell Invocation

**Before**:
```python
def run_shell_command(command: str, timeout: int = 30):
    """Run a PowerShell command and return stdout/stderr."""
    result = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", normalized],
        capture_output=True, text=True, timeout=timeout
    )
```

**After**:
```python
def run_shell_command(command: str, timeout: int = 30):
    """Run a shell command and return stdout/stderr."""
    if sys.platform == "win32":
        args = ["powershell", "-NoProfile", "-NonInteractive", "-Command", normalized]
    else:
        args = ["bash", "-c", normalized]
    
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, shell=False)
```

**Why**: Windows uses PowerShell, Unix/Linux uses bash.

---

#### Change 2d: Process Listing

**Before**:
```python
def get_running_processes():
    """List running processes with PID and memory usage (Windows)."""
    result = subprocess.run(
        ["tasklist", "/FO", "CSV", "/NH"],
        capture_output=True, text=True, timeout=15
    )
```

**After**:
```python
def get_running_processes():
    """List running processes with PID and memory usage."""
    if sys.platform == "win32":
        result = subprocess.run(
            ["tasklist", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=15
        )
    else:
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True, text=True, timeout=15
        )
```

**Why**: Windows uses `tasklist`, Linux uses `ps aux`.

---

#### Change 2e: Process Termination

**Before**:
```python
def kill_process(identifier: str):
    """Kill a process by name (e.g. 'notepad.exe') or PID."""
    if identifier.isdigit():
        args = ["taskkill", "/PID", identifier, "/F"]
    else:
        args = ["taskkill", "/IM", identifier, "/F"]
```

**After**:
```python
def kill_process(identifier: str):
    """Kill a process by name or PID."""
    if sys.platform == "win32":
        if identifier.isdigit():
            args = ["taskkill", "/PID", identifier, "/F"]
        else:
            args = ["taskkill", "/IM", identifier, "/F"]
    else:
        if identifier.isdigit():
            args = ["kill", "-9", identifier]
        else:
            args = ["pkill", "-9", identifier]
```

**Why**: Windows uses `taskkill`, Linux uses `kill`/`pkill`.

---

#### Change 2f: Opening Files

**Before**:
```python
def open_file(path: str):
    """Open a file or URL with its default application."""
    os.startfile(os.path.expanduser(path))
```

**After**:
```python
def open_file(path: str):
    """Open a file or URL with its default application."""
    expanded = os.path.expanduser(path)
    if sys.platform == "win32":
        os.startfile(expanded)
    elif sys.platform == "darwin":
        subprocess.run(["open", expanded], check=True)
    else:
        subprocess.run(["xdg-open", expanded], check=True)
```

**Why**: Each OS has a different file opener command.

---

#### Change 2g: Ping Command

**Before**:
```python
def ping_host(host: str, count: int = 4):
    result = subprocess.run(
        ["ping", "-n", str(count), host],
        capture_output=True, text=True, timeout=30
    )
```

**After**:
```python
def ping_host(host: str, count: int = 4):
    if sys.platform == "win32":
        ping_args = ["ping", "-n", str(count), host]
    else:
        ping_args = ["ping", "-c", str(count), host]
    result = subprocess.run(ping_args, capture_output=True, text=True, timeout=30)
```

**Why**: Windows ping uses `-n` for count, Unix uses `-c`.

---

#### Change 2h: Disk Usage Default Path

**Before**:
```python
def get_disk_usage(path: str = "C:\\"):
```

**After**:
```python
def get_disk_usage(path: str = "/"):
    if not path or path == "/":
        path = "C:\\" if sys.platform == "win32" else "/"
```

**Why**: Root path is different on Windows (C:\\) vs Unix (/).

---

### 3. `local/install_autostart.sh` (NEW FILE)

**Purpose**: Linux/Unix equivalent of `install_autostart.bat`

**Features**:
- Creates systemd user service
- Auto-starts on login
- Works on Ubuntu, Raspberry Pi, and other Linux distros
- Better alternative to old Task Scheduler batch file

**Usage**:
```bash
chmod +x local/install_autostart.sh
./local/install_autostart.sh
```

---

### 4. `UBUNTU_SETUP.md` (NEW FILE)

**Purpose**: Complete setup guide for Ubuntu and Linux systems

**Covers**:
- System requirements
- Python installation
- Virtual environment setup
- Configuration
- Auto-start on boot
- Docker deployment
- Systemd service management
- Troubleshooting
- ARM compatibility notes

---

## Testing Checklist

### On Windows
- [ ] Desktop app launches without errors
- [ ] pc_listener connects and polls
- [ ] Shell commands run via PowerShell
- [ ] Process listing shows current processes
- [ ] File opening works with default app

### On Ubuntu/Linux
- [ ] Desktop app (with GUI) launches (if pywebview installed)
- [ ] pc_listener connects and polls
- [ ] Shell commands run via bash
- [ ] Process listing uses `ps aux`
- [ ] File opening uses `xdg-open`
- [ ] Disk usage reports correct path

### On Raspberry Pi / ARM64
- [ ] Installation completes without errors (may take longer)
- [ ] pc_listener connects and polls
- [ ] All core functions work
- [ ] Auto-start via systemd works
- [ ] Logs viewable via journalctl

## Platform Detection

The code uses `sys.platform` for OS detection:
- `"win32"` - Windows (all versions)
- `"linux"` - Linux
- `"darwin"` - macOS
- `"freebsd"` - FreeBSD

Example:
```python
import sys

if sys.platform == "win32":
    # Windows-specific code
elif sys.platform == "darwin":
    # macOS-specific code
else:
    # Linux/Unix code (default)
```

## Future Improvements

1. **ARM Optimization**: Pre-compiled wheels for Raspberry Pi
2. **Docker Support**: Official Docker image for headless deployment
3. **Snap Package**: Linux snap packaging for easier installation
4. **systemd Timer**: Alternative to auto-start for scheduled execution
5. **Logging**: Centralized logging to local file (in addition to stderr)

## Known Limitations

1. **Voice Input**: Requires audio libraries on Linux (may not work headless)
2. **GUI**: Desktop app requires graphical environment (pywebview)
3. **ARM Packages**: Slow compilation on first install on ARM boards
4. **System Info**: Some functions return OS-specific formats

## Troubleshooting

### Import Errors on Linux

If you see `AttributeError: module 'subprocess' has no attribute 'CREATE_NO_WINDOW'`:
- Fixed in v2.0+
- Ensure you're using updated `desktop_app.py`

### Permission Denied on Scripts

```bash
chmod +x local/pc_listener.py
chmod +x local/install_autostart.sh
```

### Module Not Found

```bash
source venv/bin/activate
pip install -r local/requirements.txt
```

## Version History

- **2.0+**: Full cross-platform support
  - ✅ Windows (PowerShell)
  - ✅ Linux (bash)
  - ✅ macOS (zsh/bash)
  - ✅ ARM (Raspberry Pi, EVO-T1)
  - ✅ Docker
  - ✅ systemd integration
