# Master Browser 🧭

A full-featured, high-performance file explorer and editor built with **Rust (Tauri)** and **Next.js**. Designed for the *Shadow Dark* aesthetic with smooth Framer Motion transitions and production-grade reliability.

## Features 🚀

- **Drive Dashboard:** Overview of all system drives with real-time usage metrics.
- **Deep File Explorer:** Navigate directories with breadcrumb support and metadata viewing.
- **In-App Editor:** Sleek, dark-themed code editor for on-the-fly modifications.
- **Recent Files:** Persistent history of your recently edited files.
- **Auto-Update Engine:** background update checks with native push notifications.
- **Shadow Dark UI:** A minimalist, premium aesthetic built with Tailwind CSS and Framer Motion.
- **Windows Optimized:** Specialized configuration to prevent terminal window flicker on launch.

## Architecture 🏗️

### Backend (Rust / Tauri)
- `list_disks`: Aggregates system storage information using `sysinfo`.
- `list_directory`: Recursive metadata extraction for file navigation.
- `read_file_content` / `write_file_content`: Safe filesystem I/O.
- `get_recent_files`: Local JSON-based persistence for user history.
- `windows_subsystem`: GUI-only mode for Windows production builds.

### Frontend (Next.js / TypeScript)
- **Framer Motion:** Orchestrates layout transitions between Dashboard, Explorer, and Editor.
- **Lucide React:** Premium iconography set.
- **Tauri APIs:** Direct integration with native notification and updater systems.

## Development 💻

### Prerequisites
- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v20+)
- Webkit2GTK (for Linux builds)

### Setup
```bash
# Clone the repository
git clone https://github.com/CrimsonDevil333333/master-browser.git
cd master-browser

# IMPORTANT: Install all dependencies (Root & Frontend)
# Use this flag to resolve older library peer conflicts
npm install --legacy-peer-deps

# Run in development mode
npm run tauri dev
```

### Build
```bash
# Build production bundle for your current OS
npm run tauri build
```

## Maintenance 🛠️

The automated release workflow is configured in `Cargo.toml` and `package.json`. Updates are served via a seamless background engine.

---
*Built for the OpenClaw Swarm.*
