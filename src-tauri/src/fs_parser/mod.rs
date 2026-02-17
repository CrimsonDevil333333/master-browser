use serde::{Serialize, Deserialize};
use std::fs::File;
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
pub struct Ext4SuperblockInfo {
    pub s_inodes_count: u32,
    pub s_blocks_count_lo: u32,
    pub s_r_blocks_count_lo: u32,
    pub s_free_blocks_count_lo: u32,
    pub s_free_inodes_count: u32,
    pub s_log_block_size: u32,
    pub s_magic: u16,
    pub s_volume_name: String,
    pub s_last_mounted: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NtfsVolumeInfo {
    pub serial_number: u64,
    pub bytes_per_sector: u16,
    pub sectors_per_cluster: u8,
    pub total_sectors: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FatVolumeInfo {
    pub volume_label: String,
    pub oem_name: String,
    pub bytes_per_sector: u16,
    pub sectors_per_cluster: u8,
    pub total_sectors: u32,
}

pub fn parse_ntfs_volume(path: &str) -> Result<NtfsVolumeInfo, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open device: {}", e))?;
    let mut buffer = [0u8; 512];
    file.read_exact(&mut buffer).map_err(|e| e.to_string())?;

    // NTFS Magic "NTFS    " at offset 3
    if &buffer[3..7] != b"NTFS" {
        return Err("Invalid NTFS magic number".to_string());
    }

    let bytes_per_sector = u16::from_le_bytes([buffer[11], buffer[12]]);
    let sectors_per_cluster = buffer[13];
    let total_sectors = u64::from_le_bytes(buffer[40..48].try_into().unwrap());
    let serial_number = u64::from_le_bytes(buffer[72..80].try_into().unwrap());

    Ok(NtfsVolumeInfo {
        serial_number,
        bytes_per_sector,
        sectors_per_cluster,
        total_sectors,
    })
}

pub fn parse_fat_volume(path: &str) -> Result<FatVolumeInfo, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open device: {}", e))?;
    let mut buffer = [0u8; 512];
    file.read_exact(&mut buffer).map_err(|e| e.to_string())?;

    // Check FAT magic 0x55 0xAA at end of boot sector
    if buffer[510] != 0x55 || buffer[511] != 0xAA {
        return Err("Invalid FAT boot sector signature".to_string());
    }

    let oem_name = String::from_utf8_lossy(&buffer[3..11]).trim().to_string();
    let bytes_per_sector = u16::from_le_bytes([buffer[11], buffer[12]]);
    let sectors_per_cluster = buffer[13];
    let total_sectors_16 = u16::from_le_bytes([buffer[19], buffer[20]]);
    let total_sectors_32 = u32::from_le_bytes(buffer[32..36].try_into().unwrap());
    let total_sectors = if total_sectors_16 != 0 { total_sectors_16 as u32 } else { total_sectors_32 };
    
    // Label offset depends on FAT12/16 vs FAT32
    let volume_label = if buffer[38] == 0x29 {
        // FAT12/16
        String::from_utf8_lossy(&buffer[43..54]).trim().to_string()
    } else if buffer[66] == 0x29 {
        // FAT32
        String::from_utf8_lossy(&buffer[71..82]).trim().to_string()
    } else {
        "NO LABEL".to_string()
    };

    Ok(FatVolumeInfo {
        volume_label,
        oem_name,
        bytes_per_sector,
        sectors_per_cluster,
        total_sectors,
    })
}

pub fn list_raw_devices() -> Result<Vec<RawBlockDevice>, String> {
    let mut devices = Vec::new();
    
    // On Linux, we can use /sys/block to find devices
    #[cfg(target_os = "linux")]
    {
        let block_dir = Path::new("/sys/block");
        if let Ok(entries) = std::fs::read_dir(block_dir) {
            for entry in entries.flatten() {
                let dev_name = entry.file_name().into_string().unwrap_or_default();
                // Filter for common block devices (sda, nvme, mmcblk, loop)
                if dev_name.starts_with("sd") || dev_name.starts_with("nvme") || dev_name.starts_with("mmcblk") || dev_name.starts_with("loop") {
                    let dev_path = format!("/dev/{}", dev_name);
                    let size_path = entry.path().join("size");
                    let size = std::fs::read_to_string(size_path)
                        .ok()
                        .and_then(|s| s.trim().parse::<u64>().ok())
                        .map(|blocks| blocks * 512) // size is in 512-byte sectors
                        .unwrap_or(0);

                    let mut partitions = Vec::new();
                    // Look for partitions (e.g., sda1, mmcblk0p1)
                    if let Ok(sub_entries) = std::fs::read_dir(entry.path()) {
                        for sub_entry in sub_entries.flatten() {
                            let sub_name = sub_entry.file_name().into_string().unwrap_or_default();
                            if sub_name.starts_with(&dev_name) && sub_name != dev_name {
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
                                    fs_type: None, // Will try to detect if needed
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
        
        // Add virtual test device for verification
        let test_img = "/home/pi/.openclaw/workspace/projects/master-browser/test_ext4.img";
        if std::path::Path::new(test_img).exists() {
            devices.push(RawBlockDevice {
                name: "test_ext4.img".to_string(),
                path: test_img.to_string(),
                size: 100 * 1024 * 1024,
                device_type: "virtual".to_string(),
                partitions: vec![RawPartition {
                    name: "test_ext4.img".to_string(),
                    path: test_img.to_string(),
                    size: 100 * 1024 * 1024,
                    fs_type: Some("ext4".to_string()),
                }],
            });
        }
    }

    Ok(devices)
}

pub fn parse_ext4_superblock(path: &str) -> Result<Ext4SuperblockInfo, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open device: {}", e))?;
    
    // Ext4 Superblock starts at 1024 bytes offset
    file.seek(SeekFrom::Start(1024)).map_err(|e| e.to_string())?;
    
    let mut buffer = [0u8; 1024];
    file.read_exact(&mut buffer).map_err(|e| e.to_string())?;

    // Check Magic Number (0xEF53 at offset 0x38 = 56)
    let magic = u16::from_le_bytes([buffer[56], buffer[57]]);
    if magic != 0xEF53 {
        return Err(format!("Invalid Ext4 magic number: 0x{:X}", magic));
    }

    let inodes_count = u32::from_le_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]);
    let blocks_count_lo = u32::from_le_bytes([buffer[4], buffer[5], buffer[6], buffer[7]]);
    let r_blocks_count_lo = u32::from_le_bytes([buffer[8], buffer[9], buffer[10], buffer[11]]);
    let free_blocks_count_lo = u32::from_le_bytes([buffer[12], buffer[13], buffer[14], buffer[15]]);
    let free_inodes_count = u32::from_le_bytes([buffer[16], buffer[17], buffer[18], buffer[19]]);
    let log_block_size = u32::from_le_bytes([buffer[24], buffer[25], buffer[26], buffer[27]]);
    
    // Volume name at offset 120 (0x78), 16 bytes
    let volume_name = String::from_utf8_lossy(&buffer[120..136]).trim_matches('\0').to_string();
    
    // Last mounted path at offset 136 (0x88), 64 bytes
    let last_mounted = String::from_utf8_lossy(&buffer[136..200]).trim_matches('\0').to_string();

    Ok(Ext4SuperblockInfo {
        s_inodes_count: inodes_count,
        s_blocks_count_lo: blocks_count_lo,
        s_r_blocks_count_lo: r_blocks_count_lo,
        s_free_blocks_count_lo: free_blocks_count_lo,
        s_free_inodes_count: free_inodes_count,
        s_log_block_size: log_block_size,
        s_magic: magic,
        s_volume_name: volume_name,
        s_last_mounted: last_mounted,
    })
}
