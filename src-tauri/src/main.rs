#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Serialize, Deserialize};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use sysinfo::{DiskExt, System, SystemExt, CpuExt, NetworkExt};
use tauri::api::path::{app_data_dir, home_dir, desktop_dir, document_dir, download_dir};
use tauri::Config;
use walkdir::WalkDir;
use zip::write::FileOptions;
use std::io::{Write, Read, BufReader};
use regex::Regex;
use sha2::{Sha256, Digest};
use md5::Md5;
use base64::{Engine as _, engine::general_purpose};
use image::io::Reader as ImageReader;
use std::process::Command;

#[cfg(unix)]
use std::os::unix::fs::{MetadataExt, PermissionsExt};

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
    pub permissions: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DetailedFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub created: u64,
    pub modified: u64,
    pub accessed: u64,
    pub permissions: String,
    pub owner: Option<u32>,
    pub group: Option<u32>,
    pub extension: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QuickNavPaths {
    pub home: String,
    pub documents: String,
    pub downloads: String,
    pub desktop: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub ram_used: u64,
    pub ram_total: u64,
    pub net_upload: u64,
    pub net_download: u64,
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

fn get_permissions_string(meta: &fs::Metadata) -> String {
    #[cfg(unix)]
    {
        let mode = meta.permissions().mode();
        let user = match mode & 0o400 { 0 => "-", _ => "r" }.to_string() + 
                   &match mode & 0o200 { 0 => "-", _ => "w" } + 
                   &match mode & 0o100 { 0 => "-", _ => "x" };
        let group = match mode & 0o040 { 0 => "-", _ => "r" }.to_string() + 
                    &match mode & 0o020 { 0 => "-", _ => "w" } + 
                    &match mode & 0o010 { 0 => "-", _ => "x" };
        let other = match mode & 0o004 { 0 => "-", _ => "r" }.to_string() + 
                    &match mode & 0o002 { 0 => "-", _ => "w" } + 
                    &match mode & 0o001 { 0 => "-", _ => "x" };
        format!("{}{}{}", user, group, other)
    }
    #[cfg(not(unix))]
    {
        if meta.permissions().readonly() { "r--r--r--".to_string() } else { "rw-rw-rw-".to_string() }
    }
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
                permissions: get_permissions_string(&meta),
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
fn get_file_details(path: String) -> Result<DetailedFileInfo, String> {
    let p = Path::new(&path);
    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    
    let created = meta.created().unwrap_or(UNIX_EPOCH).duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let modified = meta.modified().unwrap_or(UNIX_EPOCH).duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let accessed = meta.accessed().unwrap_or(UNIX_EPOCH).duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();

    #[cfg(unix)]
    let (uid, gid) = (Some(meta.uid()), Some(meta.gid()));
    #[cfg(not(unix))]
    let (uid, gid) = (None, None);

    Ok(DetailedFileInfo {
        name: p.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        path: path.clone(),
        size: meta.len(),
        is_dir: meta.is_dir(),
        created,
        modified,
        accessed,
        permissions: get_permissions_string(&meta),
        owner: uid,
        group: gid,
        extension: p.extension().map(|e| e.to_string_lossy().into_owned()),
    })
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
fn copy_files(srcs: Vec<String>, dest_dir: String) -> Result<(), String> {
    for src in srcs {
        let path = Path::new(&src);
        let name = path.file_name().ok_or("Invalid source file name")?;
        let mut dest = PathBuf::from(&dest_dir);
        dest.push(name);
        
        let meta = fs::metadata(&src).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            copy_dir_recursive(&src, dest.to_str().ok_or("Invalid dest path")?)?;
        } else {
            fs::copy(src, dest).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn copy_dir_recursive(src: &str, dest: &str) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let mut dest_path = PathBuf::from(dest);
        dest_path.push(entry.file_name());

        if file_type.is_dir() {
            copy_dir_recursive(src_path.to_str().ok_or("Invalid path")?, dest_path.to_str().ok_or("Invalid path")?)?;
        } else {
            fs::copy(src_path, dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn move_files(srcs: Vec<String>, dest_dir: String) -> Result<(), String> {
    for src in srcs {
        let path = Path::new(&src);
        let name = path.file_name().ok_or("Invalid source file name")?;
        let mut dest = PathBuf::from(&dest_dir);
        dest.push(name);
        fs::rename(src, dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn delete_files(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            fs::remove_dir_all(path).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn compress_zip(path: String, output_name: String) -> Result<String, String> {
    let src_path = Path::new(&path);
    let zip_path = if output_name.ends_with(".zip") {
        src_path.parent().unwrap().join(output_name)
    } else {
        src_path.parent().unwrap().join(format!("{}.zip", output_name))
    };

    let file = File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .unix_permissions(0o755);

    let walk = WalkDir::new(src_path);
    for entry in walk.into_iter().filter_map(|e| e.ok()) {
        let name = entry.path().strip_prefix(src_path).map_err(|e| e.to_string())?;
        if entry.path().is_file() {
            zip.start_file(name.to_string_lossy(), options).map_err(|e| e.to_string())?;
            let mut f = File::open(entry.path()).map_err(|e| e.to_string())?;
            let mut buffer = Vec::new();
            f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            zip.write_all(&buffer).map_err(|e| e.to_string())?;
        } else if !name.as_os_str().is_empty() {
            zip.add_directory(name.to_string_lossy(), options).map_err(|e| e.to_string())?;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(zip_path.to_string_lossy().into_owned())
}

#[tauri::command]
fn extract_zip(path: String, dest: String) -> Result<(), String> {
    let file = File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = PathBuf::from(&dest).join(file.name());
        if (*file.name()).ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() { fs::create_dir_all(&p).map_err(|e| e.to_string())?; }
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn extract_tar_gz(path: String, dest: String) -> Result<(), String> {
    let file = File::open(&path).map_err(|e| e.to_string())?;
    let tar = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(tar);
    archive.unpack(dest).map_err(|e| e.to_string())?;
    Ok(())
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

    let name = Path::new(&path).file_name().unwrap_or_default().to_string_lossy().into_owned();
    let timestamp = std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();

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

#[tauri::command]
fn get_system_stats() -> SystemStats {
    let mut sys = System::new_all();
    sys.refresh_all();
    let cpu_usage = sys.global_cpu_info().cpu_usage();
    let ram_used = sys.used_memory();
    let ram_total = sys.total_memory();
    let mut net_upload = 0;
    let mut net_download = 0;
    for (_iface, data) in sys.networks() {
        net_upload += data.transmitted();
        net_download += data.received();
    }
    SystemStats { cpu_usage, ram_used, ram_total, net_upload, net_download }
}

#[tauri::command]
fn bulk_rename(paths: Vec<String>, pattern: String, replacement: String) -> Result<usize, String> {
    let re = Regex::new(&pattern).map_err(|e| e.to_string())?;
    let mut count = 0;
    for path_str in paths {
        let path = Path::new(&path_str);
        if let Some(file_name) = path.file_name() {
            let name_str = file_name.to_string_lossy();
            let new_name = re.replace_all(&name_str, &replacement);
            if new_name != name_str {
                let mut new_path = path.to_path_buf();
                new_path.set_file_name(new_name.as_ref());
                fs::rename(path, new_path).map_err(|e| e.to_string())?;
                count += 1;
            }
        }
    }
    Ok(count)
}

#[tauri::command]
fn get_quick_nav_paths() -> QuickNavPaths {
    QuickNavPaths {
        home: home_dir().unwrap_or_default().to_string_lossy().into_owned(),
        documents: document_dir().unwrap_or_default().to_string_lossy().into_owned(),
        downloads: download_dir().unwrap_or_default().to_string_lossy().into_owned(),
        desktop: desktop_dir().unwrap_or_default().to_string_lossy().into_owned(),
    }
}

#[tauri::command]
fn read_file_hex(path: String, limit: usize) -> Result<String, String> {
    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    let mut buffer = vec![0; limit];
    let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
    Ok(hex::encode(&buffer[..n]))
}

#[tauri::command]
async fn check_for_updates() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let res = client.get("https://api.github.com/repos/clawdy-ai/master-browser/releases/latest")
        .header("User-Agent", "master-browser")
        .send().await.map_err(|e| e.to_string())?;
    let json = res.json::<serde_json::Value>().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
fn calculate_hash(path: String, algo: String) -> Result<String, String> {
    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    if algo.to_lowercase() == "sha256" {
        let mut hasher = Sha256::new();
        std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
        Ok(format!("{:x}", hasher.finalize()))
    } else {
        let mut hasher = Md5::new();
        std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
        Ok(format!("{:x}", hasher.finalize()))
    }
}

#[tauri::command]
fn get_image_thumbnail(path: String, size: u32) -> Result<String, String> {
    let img = ImageReader::open(&path).map_err(|e| e.to_string())?.decode().map_err(|e| e.to_string())?;
    let thumbnail = img.thumbnail(size, size);
    let mut buffer = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buffer);
    thumbnail.write_to(&mut cursor, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(buffer))
}

#[tauri::command]
fn run_terminal_command(command: String, dir: String) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd").args(&["/C", &command]).current_dir(dir).output()
    } else {
        Command::new("sh").args(&["-c", &command]).current_dir(dir).output()
    }.map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
fn scan_local_network() -> Result<Vec<String>, String> {
    // Basic ping scan mockup for v0.2.1
    // Real implementation would use pnet or similar
    Ok(vec!["192.168.1.1 (Gateway)".to_string(), "192.168.1.15 (Current Device)".to_string()])
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_disks,
            list_directory,
            read_file_content,
            write_file_content,
            copy_files,
            move_files,
            delete_files,
            get_recent_files,
            track_recent_file,
            get_file_details,
            compress_zip,
            extract_zip,
            extract_tar_gz,
            get_quick_nav_paths,
            read_file_hex,
            check_for_updates,
            get_system_stats,
            bulk_rename,
            calculate_hash,
            get_image_thumbnail,
            run_terminal_command,
            scan_local_network
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
