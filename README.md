# 🧭 Master Browser: The Universal Filesystem Bridge

![Master Browser Banner](src-tauri/icons/icon.png)

**Master Browser** is a high-performance, user-space filesystem explorer built with **Rust + Tauri**. It bridges the gap between Windows, macOS, and Linux by allowing direct access to filesystems without requiring kernel-level mounting.

## 📸 Screenshots
| Dashboard | Explorer | Raw Probe |
| :---: | :---: | :---: |
| ![Dashboard](docs/images/dashboard.png) | ![Explorer](docs/images/explorer.png) | ![Raw Probe](docs/images/raw_probe.png) |

## 🚀 Key Features
- **Universal Bridge**: Read/Write Ext4, NTFS, and FAT (12/16/32) partitions natively.
- **User-Space Drivers**: Bypasses the OS kernel to "see" unmounted partitions via direct sector-level probing.
- **60 FPS Performance**: Virtualized file lists handle thousands of files with zero lag.
- **Shadow Dark Interface**: Modern, sleek UI with fluid Framer Motion transitions.
- **Specialized Viewers**: Deep inspection for CSV, JSON, and Code files.
- **Neural Audio Player**: Integrated high-fidelity audio playback.

## 🛠️ Tech Stack
- **Backend**: Rust, Tauri, `sysinfo`, `ext4`, `ntfs`, `fatfs`
- **Frontend**: Next.js, React, Tailwind CSS, Framer Motion, `react-window`

## 🏗️ Getting Started
### Prerequisites
- Rust (latest stable)
- Node.js (v18+)
- WebKitGTK 4.1 (Linux)

### Build
```bash
# Frontend
cd frontend && npm install && npm run build

# Backend
cd src-tauri && cargo build
```

---
*Developed by the OpenClaw Swarm for Satyaa.*
