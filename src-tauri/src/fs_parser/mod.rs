use serde::{Serialize, Deserialize};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RawBlockDevice {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub device_type: String,
    pub partitions: Vec<RawPartition>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RawPartition {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub fs_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FSInspectorInfo {
    pub fs_type: String,
    pub volume_name: String,
    pub block_size: u64,
    pub total_blocks: u64,
    pub free_blocks: u64,
    pub serial_number: String,
    pub features: Vec<String>,
}

pub fn list_raw_devices() -> Result<Vec<RawBlockDevice>, String> {
    let mut devices = Vec::new();
    
    #[cfg(target_os = "linux")]
    {
        let block_dir = Path::new("/sys/block");
        if let Ok(entries) = std::fs::read_dir(block_dir) {
            for entry in entries.flatten() {
                let dev_name = entry.file_name().into_string().unwrap_or_default();
                if dev_name.starts_with("sd") || dev_name.starts_with("nvme") || dev_name.starts_with("mmcblk") || dev_name.starts_with("loop") {
                    let dev_path = format!("/dev/{}", dev_name);
                    let size_path = entry.path().join("size");
                    let size = std::fs::read_to_string(size_path)
                        .ok()
                        .and_then(|s| s.trim().parse::<u64>().ok())
                        .map(|blocks| blocks * 512)
                        .unwrap_or(0);

                    let mut partitions = Vec::new();
                    if let Ok(sub_entries) = std::fs::read_dir(entry.path()) {
                        for sub_entry in sub_entries.flatten() {
                            let sub_name = sub_entry.file_name().into_string().unwrap_or_default();
                            if (sub_name.starts_with(&dev_name) && sub_name != dev_name) || (dev_name.starts_with("nvme") && sub_name.contains("p")) {
                                let part_path = format!("/dev/{}", sub_name);
                                let part_size_path = sub_entry.path().join("size");
                                let part_size = std::fs::read_to_string(part_size_path)
                                    .ok()
                                    .and_then(|s| s.trim().parse::<u64>().ok())
                                    .map(|blocks| blocks * 512)
                                    .unwrap_or(0);
                                
                                partitions.push(RawPartition {
                                    name: sub_name,
                                    path: part_path,
                                    size: part_size,
                                    fs_type: None,
                                });
                            }
                        }
                    }

                    devices.push(RawBlockDevice {
                        name: dev_name,
                        path: dev_path,
                        size,
                        device_type: "disk".to_string(),
                        partitions,
                    });
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        for i in 0..16 {
            let path = format!("\\\\.\\PhysicalDrive{}", i);
            if let Ok(file) = File::open(&path) {
                let size = file.metadata().map(|m| m.len()).unwrap_or(0);
                devices.push(RawBlockDevice {
                    name: format!("Physical Disk {}", i),
                    path: path.clone(),
                    size,
                    device_type: "disk".to_string(),
                    partitions: vec![RawPartition {
                        name: format!("Raw Partition"),
                        path: path,
                        size,
                        fs_type: None,
                    }],
                });
            }
        }
    }

    Ok(devices)
}

pub fn inspect_partition(path: &str) -> Result<FSInspectorInfo, String> {
    let mut file = File::open(path).map_err(|e| format!("Admin/Root required to read {}: {}", path, e))?;
    let mut buffer = [0u8; 4096];
    if file.read_exact(&mut buffer).is_err() {
        return Err("Unable to read disk sectors. Check permissions.".into());
    }

    if &buffer[0..8] == b"NTFS    " {
        return Ok(FSInspectorInfo {
            fs_type: "NTFS".to_string(),
            volume_name: "Windows Volume".to_string(),
            block_size: u16::from_le_bytes([buffer[11], buffer[12]]) as u64,
            total_blocks: 0, free_blocks: 0,
            serial_number: format!("{:X}", u64::from_le_bytes(buffer[72..80].try_into().unwrap())),
            features: vec!["Journaling".into(), "ACLs".into()],
        });
    }

    if &buffer[3..11] == b"EXFAT   " {
        return Ok(FSInspectorInfo {
            fs_type: "exFAT".to_string(),
            volume_name: "Portable Drive".to_string(),
            block_size: 2u64.pow(buffer[108] as u32),
            total_blocks: 0, free_blocks: 0,
            serial_number: format!("{:X}", u32::from_le_bytes(buffer[100..104].try_into().unwrap())),
            features: vec!["Large Files".into(), "Cross-platform".into()],
        });
    }

    if &buffer[0..4] == b"XFSB" {
        return Ok(FSInspectorInfo {
            fs_type: "XFS".to_string(),
            volume_name: "Linux XFS".to_string(),
            block_size: u32::from_be_bytes(buffer[4..8].try_into().unwrap()) as u64,
            total_blocks: 0, free_blocks: 0,
            serial_number: "N/A".into(),
            features: vec!["Performance".into(), "Scalability".into()],
        });
    }

    file.seek(SeekFrom::Start(65536)).ok();
    let mut btrfs_buf = [0u8; 1024];
    if file.read_exact(&mut btrfs_buf).is_ok() && &btrfs_buf[64..72] == b"_BHRfS_M" {
        return Ok(FSInspectorInfo {
            fs_type: "Btrfs".to_string(),
            volume_name: "Linux Btrfs".to_string(),
            block_size: u32::from_le_bytes(btrfs_buf[144..148].try_into().unwrap()) as u64,
            total_blocks: 0, free_blocks: 0,
            serial_number: "N/A".into(),
            features: vec!["CoW".into(), "Snapshots".into()],
        });
    }

    file.seek(SeekFrom::Start(1024)).ok();
    let mut ext4_buf = [0u8; 1024];
    if file.read_exact(&mut ext4_buf).is_ok() {
        let magic = u16::from_le_bytes([ext4_buf[56], ext4_buf[57]]);
        if magic == 0xEF53 {
            let volume_name = String::from_utf8_lossy(&ext4_buf[120..136]).trim_matches('\0').to_string();
            return Ok(FSInspectorInfo {
                fs_type: "Ext4".to_string(),
                volume_name: if volume_name.is_empty() { "Linux Standard".into() } else { volume_name },
                block_size: 1024 << u32::from_le_bytes(ext4_buf[24..28].try_into().unwrap()),
                total_blocks: u32::from_le_bytes(ext4_buf[4..8].try_into().unwrap()) as u64,
                free_blocks: u32::from_le_bytes(ext4_buf[12..16].try_into().unwrap()) as u64,
                serial_number: "N/A".into(),
                features: vec!["Stability".into(), "Journaling".into()],
            });
        }
    }

    Err("Filesystem signature not recognized".to_string())
}
