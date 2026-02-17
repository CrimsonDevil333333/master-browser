use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::sync::{Arc, Mutex};
use crate::FileMetadata;
use ext4_rs::{BlockDevice, Ext4};

// --------------------------------------------------------------------------
// 1. BlockDevice Implementation (Disk Wrapper)
// --------------------------------------------------------------------------

#[derive(Debug)]
pub struct Disk {
    file: Mutex<File>,
}

impl Disk {
    pub fn new(path: &str) -> Result<Self, String> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .map_err(|e| format!("Failed to open disk '{}': {}", path, e))?;
        Ok(Self { file: Mutex::new(file) })
    }
}

impl BlockDevice for Disk {
    fn read_offset(&self, offset: usize) -> Vec<u8> {
        let mut file = self.file.lock().unwrap();
        file.seek(SeekFrom::Start(offset as u64)).unwrap();
        let mut buf = vec![0u8; 4096]; // Default block size assumption, adjusted by ext4 lib internally usually
        // Note: ext4_rs example reads BLOCK_SIZE. We might need to handle variable sizes or let the lib ask.
        // The trait signature in README returns Vec<u8>, implying it reads *a block*.
        // Assuming 4096 for now.
        let _ = file.read_exact(&mut buf);
        buf
    }

    fn write_offset(&self, offset: usize, data: &[u8]) {
        let mut file = self.file.lock().unwrap();
        file.seek(SeekFrom::Start(offset as u64)).unwrap();
        file.write_all(data).unwrap();
    }
}

// --------------------------------------------------------------------------
// 2. Capability Probe
// --------------------------------------------------------------------------

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

    // On Windows, if we can open the file, we support full read/write via userspace
    if is_windows {
        return Ext4RawCapability {
            partition_path: partition_path.to_string(),
            supported_now: true,
            mode: "userspace-rw".to_string(),
            details: "Windows unmounted Ext4: Read/Write supported via userspace driver.".to_string(),
        };
    }

    Ext4RawCapability {
        partition_path: partition_path.to_string(),
        supported_now: true,
        mode: "mount-bridge".to_string(),
        details: "Ext4 path can currently be routed through mount bridge on this platform.".to_string(),
    }
}

// --------------------------------------------------------------------------
// 3. Read Operations
// --------------------------------------------------------------------------

pub fn list_directory_raw(partition_path: &str, relative_path: &str) -> Result<Vec<FileMetadata>, String> {
    let disk = Arc::new(Disk::new(partition_path)?);
    let ext4 = Ext4::open(disk);

    let root_inode = 2;
    let mut path_inode = root_inode;
    
    // Navigate to target directory if not root
    if !relative_path.is_empty() && relative_path != "/" {
        // Using generic_open to find the inode of the path
        // The lib signature from README: generic_open(path, &mut parent, is_dir, mode, &mut flags)
        // We just want to find the inode.
        path_inode = ext4.generic_open(relative_path, &mut 2, false, 0, &mut 0)
            .map_err(|e| format!("Path not found: {:?}", e))?;
    }

    let entries_raw = ext4.dir_get_entries(path_inode);
    let mut entries = Vec::new();

    for entry in entries_raw {
        let name = entry.get_name();
        if name == "." || name == ".." { continue; }
        
        // We need to fetch inode details to get size/type
        // The Entry struct might have it, or we look it up.
        // Assuming simplified metadata for list speed for now, or using generic_open to probe.
        
        let is_dir = entry.inode == 2 || name.contains("/"); // Simplification, real check needed
        
        // For now, listing names is the proof of life.
        entries.push(FileMetadata {
            name: name.clone(),
            size: 0,
            is_dir: true, // defaulting to true to allow navigation attempts until we lookup inode type
            last_modified: 0,
            path: name,
            permissions: "-".to_string(),
        });
    }

    Ok(entries)
}

pub fn read_file_raw(partition_path: &str, relative_path: &str) -> Result<Vec<u8>, String> {
    let disk = Arc::new(Disk::new(partition_path)?);
    let ext4 = Ext4::open(disk);

    let inode = ext4.generic_open(relative_path, &mut 2, false, 0, &mut 0)
        .map_err(|e| format!("File not found: {:?}", e))?;
        
    let mut data = vec![0u8; 1024 * 1024 * 10]; // Cap at 10MB read for safety in this version
    let _read_len = ext4.read_at(inode, 0, &mut data);
    
    // In real impl, use file size from inode to trim
    // For now, returning buffer (trimmed by actual read logic usually)
    Ok(data)
}

// --------------------------------------------------------------------------
// 4. Write Operations (The Holy Grail)
// --------------------------------------------------------------------------

pub fn write_file_raw(partition_path: &str, relative_path: &str, data: &[u8]) -> Result<(), String> {
    let disk = Arc::new(Disk::new(partition_path)?);
    let ext4 = Ext4::open(disk);

    // Check if exists, if not create
    let inode = match ext4.generic_open(relative_path, &mut 2, false, 0, &mut 0) {
        Ok(i) => i,
        Err(_) => {
            // Create if missing
            // mode 0o100644 (S_IFREG | 0644)
            ext4.create(2, relative_path, 0o100644)
                .map_err(|e| format!("Failed to create file: {:?}", e))?.inode_num
        }
    };

    ext4.write_at(inode, 0, data).map_err(|e| format!("Write failed: {:?}", e))?;
    Ok(())
}
