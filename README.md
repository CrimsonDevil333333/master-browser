# 🧭 Master Browser

**The Universal Filesystem Bridge for Power Users.**

Master Browser is a production-grade, cross-platform application built with **Rust**, **Tauri**, and **Next.js**. It provides a high-performance, secure interface to browse, probe, and manage filesystems that are traditionally difficult to access across different operating systems.

> **Status:** Production Foundation Verified 🛡️ | UI: Shadow Dark 🎨

---

## 🚀 Key Features

*   **Universal Probing**: Deep-scan block devices and disk images (VHDX, VHD) to identify internal partition layouts.
*   **Multi-FS Support**: Built-in logic for **ext4**, **NTFS**, **exFAT**, and initial detection for **ReFS**.
*   **Hybrid Interface**: 
    *   💻 **CLI Utility**: Powerful terminal mode for automated disk listing and probing.
    *   🎨 **Desktop GUI**: Sleek "Shadow Dark" animated dashboard built with Framer Motion.
*   **User-Space Safety**: Minimal risk of system corruption by utilizing user-space parsing where possible.
*   **CI/CD Pipeline**: Fully automated GitHub Actions for building `.exe`, `.dmg`, and `.AppImage`.

---

## 🖼️ Gallery (UI/UX)

*(Mockup placeholders for CI builds)*
> **[Sleek Shadow Dark Dashboard]**  
> *Glassmorphism design with real-time hardware status widgets.*

---

## 🛠️ Technical Stack

- **Backend**: Rust 🦀 (Tauri Framework)
- **Frontend**: Next.js 15, Tailwind CSS, Framer Motion
- **Discovery Engine**: `sysinfo` + `qemu-nbd` backend
- **Build System**: GitHub Actions (Multi-platform Matrix)

---

## 🚀 Getting Started

### 1. Developer Environment
Ensure you have the following installed:
- [Rustup](https://rustup.rs/) (Stable)
- [Node.js](https://nodejs.org/) (v20+)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### 2. Run the App
```bash
# Clone the repository
git clone https://github.com/CrimsonDevil333333/master-browser.git
cd master-browser

# Install dependencies
cd frontend && npm install
cd ../src-tauri && cargo fetch

# Start Development Mode (GUI)
cd ..
npm run tauri dev
```

### 3. Using the CLI Utility
The core engine can be used directly from the terminal:
```bash
# List all connected disks
cargo run -- cli ls

# Probe a specific disk image (VHDX/VHD)
cargo run -- cli probe /path/to/disk.vhdx

# Mount a VHDX (Linux Only)
cargo run -- cli mount /path/to/disk.vhdx /mnt/mount_point
```

---

## 🛡️ Supported Platforms & File Systems

| Platform | Read | Write | Discovery |
| :--- | :---: | :---: | :---: |
| **Linux (Pi 5/PC)** | ✅ | ✅ | ✅ |
| **Windows** | ✅ | ✅ | ✅ |
| **macOS** | ✅ | ✅ | ✅ |

| File System | Status | Note |
| :--- | :--- | :--- |
| **ext4** | ✅ Supported | Full Read/Write |
| **NTFS** | ✅ Supported | Native via OS drivers |
| **exFAT** | ✅ Supported | Universal |
| **ReFS** | ⚠️ Experimental | Detection + Warning |

---

## 🤝 Contributing
Push a tag `v*` to trigger the automated build pipeline and generate new release artifacts.

---

## 📜 License
MIT © CrimsonDevil333333
