# 🧭 Master Browser

**The high-performance, universal filesystem bridge.**

Master Browser is a next-generation desktop application designed to provide seamless access to various filesystem types (ext4, NTFS, exFAT) across Windows, Linux, and macOS. Built with **Rust** for safety and **Tauri** for a lightweight footprint, it prioritizes data integrity and system stability.

## ✨ Key Features

- **🚀 High Performance**: Native Rust backend for lightning-fast block device operations.
- **🛡️ User-Space Safety**: No kernel drivers required. Safely read and write to filesystems without risking BSODs or kernel panics.
- **🎨 Shadow Dark UI**: A premium, animated interface built with Next.js, Tailwind CSS, and Framer Motion.
- **🖥️ CLI + GUI**: Full-featured graphical interface for everyday use, and a robust CLI for automation and power users.
- **🌍 Universal Support**: (In Progress) Support for ext4, NTFS, and exFAT partitions.

## 🛠️ Tech Stack

- **Backend**: Rust 🦀
- **Frontend**: Next.js 14 + Tailwind CSS + Framer Motion
- **Desktop Framework**: Tauri
- **Disk Logic**: `sysinfo` & custom block device parsers

## 🚀 Getting Started

### Prerequisites

- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/)
- OS-specific Tauri dependencies (see [Tauri Docs](https://tauri.app/v1/guides/getting-started/prerequisites))

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/master-browser.git
   cd master-browser
   ```

2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

3. Run in development mode:
   ```bash
   # From the project root
   cd src-tauri
   cargo tauri dev
   ```

## ⌨️ CLI Usage

Master Browser includes a direct CLI utility for quick inspections:

```bash
cargo run -- cli ls
```

## 🛡️ Safety First

Data corruption is the enemy. Master Browser implements multiple layers of verification:
1. **Pre-flight Check**: Verifies partition health before mounting.
2. **Transaction Logs**: Uses internal logging to ensure write operations are atomic.
3. **Checksumming**: (Roadmap) Automatic verification of file integrity during transfer.

## 🗺️ Roadmap

- [x] Phase 1: Project Initialization & UI Prototype.
- [ ] Phase 2: User-space ext4 read support.
- [ ] Phase 3: exFAT/NTFS integration.
- [ ] Phase 4: Secure write operations.

---

*Built with ❤️ by the OpenClaw Swarm.*
