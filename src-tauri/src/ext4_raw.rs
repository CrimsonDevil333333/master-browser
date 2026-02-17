use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use crate::FileMetadata;

#[derive(Debug, Serialize, Deserialize)]
pub struct Ext4RawCapability {
    pub partition_path: String,
    pub supported_now: bool,
    pub mode: String,
    pub details: String,
}

pub fn capability_probe(partition_path: &str, is_ext4_signature: bool, is_windows: bool) -> Ext4RawCapability {
    if !is_ext4_signature {
        return Ext4RawCapability {
            partition_path: partition_path.to_string(),
            supported_now: false,
            mode: "none".to_string(),
            details: "Selected partition is not detected as Ext4 signature.".to_string(),
        };
    }

    if is_windows {
        return Ext4RawCapability {
            partition_path: partition_path.to_string(),
            supported_now: true,
            mode: "userspace-reader".to_string(),
            details: "Windows unmounted Ext4 supported via userspace driver.".to_string(),
        };
    }

    Ext4RawCapability {
        partition_path: partition_path.to_string(),
        supported_now: true,
        mode: "mount-bridge".to_string(),
        details: "Ext4 path can currently be routed through mount bridge on this platform.".to_string(),
    }
}

pub fn list_directory_raw(partition_path: &str, relative_path: &str) -> Result<Vec<FileMetadata>, String> {
    let file = File::open(partition_path).map_err(|e| format!("Failed to open partition: {}", e))?;
    let mut vol = ext4::SuperBlock::new(file).map_err(|e| format!("Failed to load Ext4 superblock: {:?}", e))?;
    
    let root = vol.root().map_err(|e| format!("Failed to get root inode: {:?}", e))?;
    
    let target_inode = if relative_path.is_empty() || relative_path == "/" {
        root
    } else {
        vol.walk(&root, relative_path).map_err(|e| format!("Path not found '{}': {:?}", relative_path, e))?
    };

    let mut entries = Vec::new();
    
    // Depending on crate API, we might iterate dir entries
    // Using typical iterator pattern for ext4 crate
    if let Ok(iter) = vol.read_dir(&target_inode) {
        for entry in iter {
            if let Ok(e) = entry {
                entries.push(FileMetadata {
                    name: e.name.clone(),
                    size: e.inode.size as u64,
                    is_dir: e.file_type == ext4::FileType::Directory,
                    last_modified: e.inode.mtime as u64,
                    path: format!("{}", e.name), // Relative name for now, UI handles context
                    permissions: format!("{:o}", e.inode.mode),
                });
            }
        }
    }
    
    Ok(entries)
}

pub fn read_file_raw(partition_path: &str, relative_path: &str) -> Result<Vec<u8>, String> {
    let file = File::open(partition_path).map_err(|e| format!("Failed to open partition: {}", e))?;
    let mut vol = ext4::SuperBlock::new(file).map_err(|e| format!("Failed to load Ext4 superblock: {:?}", e))?;
    
    let root = vol.root().map_err(|e| format!("Failed to get root inode: {:?}", e))?;
    let target_inode = vol.walk(&root, relative_path).map_err(|e| format!("Path not found '{}': {:?}", relative_path, e))?;
    
    let mut buffer = Vec::new();
    vol.open(&target_inode).map_err(|e| format!("Failed to open inode: {:?}", e))? 
        .read_to_end(&mut buffer).map_err(|e| format!("Failed to read content: {}", e))?;
        
    Ok(buffer)
}
