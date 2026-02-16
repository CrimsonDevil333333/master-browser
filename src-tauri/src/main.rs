#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Serialize, Deserialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use sysinfo::{DiskExt, System, SystemExt};
use tauri::api::path::app_data_dir;
use tauri::Config;

#[derive(Debug, Serialize, Deserialize)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub fs_type: String,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileMetadata {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub last_modified: u64,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub timestamp: u64,
}

fn get_disks_internal() -> Vec<DiskInfo> {
    let mut disks = Vec::new();
    let mut sys = System::new_all();
    sys.refresh_disks();

    for disk in sys.disks() {
        disks.push(DiskInfo {
            name: disk.name().to_string_lossy().into_owned(),
            mount_point: disk.mount_point().to_string_lossy().into_owned(),
            fs_type: String::from_utf8_lossy(disk.file_system()).into_owned(),
            total_space: disk.total_space(),
            available_space: disk.available_space(),
            is_removable: disk.is_removable(),
        });
    }
    disks
}

#[tauri::command]
fn list_disks() -> Vec<DiskInfo> {
    get_disks_internal()
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileMetadata>, String> {
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut metadata_list = Vec::new();

    for entry in entries {
        if let Ok(entry) = entry {
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            let last_modified = meta.modified()
                .unwrap_or(UNIX_EPOCH)
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            metadata_list.push(FileMetadata {
                name: entry.file_name().to_string_lossy().into_owned(),
                size: meta.len(),
                is_dir: meta.is_dir(),
                last_modified,
                path: entry.path().to_string_lossy().into_owned(),
            });
        }
    }

    metadata_list.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(metadata_list)
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())?;
    track_recent_file_internal(path)?;
    Ok(())
}

#[tauri::command]
fn copy_file(src: String, dest: String) -> Result<(), String> {
    fs::copy(src, dest).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_file(src: String, dest: String) -> Result<(), String> {
    fs::rename(src, dest).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

fn get_recent_files_store_path() -> PathBuf {
    let config = Config::default();
    let mut path = app_data_dir(&config).unwrap_or_else(|| PathBuf::from("."));
    fs::create_dir_all(&path).ok();
    path.push("recent_files.json");
    path
}

#[tauri::command]
fn track_recent_file(path: String) -> Result<(), String> {
    track_recent_file_internal(path)
}

fn track_recent_file_internal(path: String) -> Result<(), String> {
    let store_path = get_recent_files_store_path();
    let mut recent_files: Vec<RecentFile> = if store_path.exists() {
        let content = fs::read_to_string(&store_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    let name = Path::new(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();

    let timestamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    recent_files.retain(|f| f.path != path);
    recent_files.insert(0, RecentFile { path, name, timestamp });
    recent_files.truncate(20);

    let content = serde_json::to_string(&recent_files).map_err(|e| e.to_string())?;
    fs::write(store_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_recent_files() -> Vec<RecentFile> {
    let store_path = get_recent_files_store_path();
    if store_path.exists() {
        let content = fs::read_to_string(store_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1] == "cli" {
        println!("🧭 Master Browser CLI Mode");
        return;
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_disks,
            list_directory,
            read_file_content,
            write_file_content,
            copy_file,
            move_file,
            delete_file,
            get_recent_files,
            track_recent_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
