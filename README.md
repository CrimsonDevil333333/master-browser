<div align="center">
  <img src="src-tauri/icons/icon.png" width="160" height="160" alt="Master Browser Logo" />
  <h1>🧭 Master Browser</h1>
  <p><b>The Universal User-Space Filesystem Bridge</b></p>
  <p><i>Bridge the gap between Windows, macOS, and Linux without kernel drivers.</i></p>
</div>

---

**Master Browser** is a high-performance filesystem explorer built with **Rust + Tauri**. It allows direct, sector-level access to filesystems like **Ext4, NTFS, Btrfs, XFS, and exFAT**, even on platforms where they aren't natively supported.

## 📸 Screenshots
| Dashboard | Explorer | Raw Probe |
| :---: | :---: | :---: |
| ![Dashboard](docs/images/dashboard.png) | ![Explorer](docs/images/explorer.png) | ![Raw Probe](docs/images/raw_probe.png) |

## 🚀 Key Features
- **Universal Bridge**: Read/Write Ext4, XFS, Btrfs, NTFS, and FAT (12/16/32) / exFAT partitions natively.
- **User-Space Drivers**: Bypasses the OS kernel to "see" unmounted partitions (Windows disks on Mac, Linux disks on Windows, etc) via direct sector-level probing.
- **60 FPS Performance**: Virtualized file lists handle thousands of files with zero lag.
- **Shadow Dark Interface**: Modern, sleek UI with fluid Framer Motion transitions.
- **Specialized Viewers**: Deep inspection for CSV, JSON, and Code files.
- **Neural Audio Player**: Integrated high-fidelity audio playback.

## 🛠️ Tech Stack
- **Backend**: Rust, Tauri, `sysinfo`, `ext4`, `ntfs`, `fatfs`
- **Frontend**: Next.js, React, Tailwind CSS, Framer Motion, `react-window`

## 🏗️ Getting Started

### 1. Prerequisites
- **Rust**: [rustup.rs](https://rustup.rs/)
- **Node.js**: v18 or later
- **Linux Deps**: `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `librsvg2-dev`

### 2. Installation
```bash
# Clone the repo
git clone https://github.com/CrimsonDevil333333/master-browser.git
cd master-browser

# Install dependencies
npm install
cd frontend && npm install
```

### 3. Development
Run the app in development mode with hot-reloading:
```bash
# Start the Tauri dev environment
npm run tauri dev
```

### 4. Production Build
Generate a standalone executable for your platform:
```bash
# Build the production binaries
npm run tauri build
```

## 🛡️ Usage Notes (Windows)
To access raw physical disks (unmounted ext4/NTFS drives), you **must** run the application with **Administrator Privileges**. Right-click the executable and select **"Run as Administrator"**.

---
*Developed by the OpenClaw Swarm for Satyaa.*
