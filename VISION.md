# 🧭 Master Browser: The Universal Filesystem Bridge

**Codename:** `master-browser`  
**Vision:** A high-performance, modern, and cross-platform desktop application to bridge the gap between Windows, Mac, and Linux filesystems (ext4, NTFS, exFAT).

---

## 🚀 Core Objectives
1.  **Cross-Platform Unity**: Run natively on Windows, Linux, and macOS using **Rust + Tauri**.
2.  **User-Space Reliability**: Read and write to filesystems without needing kernel-level drivers, minimizing system instability.
3.  **Modern Aesthetic**: A sleek, dark-mode UI with smooth animations (Next.js + Framer Motion).
4.  **Zero-Risk Operation**: Built-in verification to prevent data corruption during write operations.

---

## 🏗️ Technical Architecture (Proposed)

### 1. Backend (Rust 🦀)
- **`disks-rs`**: Low-level disk/block device discovery and access.
- **`ext4-parser`**: Implementation of the ext4 disk layout in user-space.
- **Tauri Bridge**: Secure IPC between the frontend and the low-level system calls.

### 2. Frontend (Next.js + Tailwind 🎨)
- **State Management**: Zustand or Jotai for fast, reactive file tree navigation.
- **Animations**: Framer Motion for a "premium" feel.
- **Theming**: "Shadow Dark" — high contrast, glowing accents.

---

## 🛠️ Phase 1: Discovery & Read-Only (Current Sprint)
- [x] Implement block device listing (detecting plugged-in drives).
- [x] Basic superblock parsing for ext4 partitions.
- [x] File tree visualization in the UI.

---

## ⚠️ Warning: Volatile Workspace
**Note:** This project is currently residing in `/mnt/ramdisk/master_browser`.  
**DANGER:** If the Pi reboots, all progress in this directory will be lost. We should move this to `/home/pi/.openclaw/workspace/projects/master-browser` for persistence once the structure is stabilized.
