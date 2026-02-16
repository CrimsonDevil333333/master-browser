use serde::{Serialize, Deserialize};
use std::process::Command;
use sysinfo::{DiskExt, System, SystemExt};

#[derive(Debug, Serialize, Deserialize)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub fs_type: String,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
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

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1] == "cli" {
        run_cli(&args[2..]);
        return;
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_disks])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn run_cli(args: &[String]) {
    println!("🧭 Master Browser CLI Mode");
    if args.is_empty() {
        println!("Available commands: ls, probe <path>, mount <path> <mount_point>, unmount");
        return;
    }

    match args[0].as_str() {
        "ls" => {
            let disks = get_disks_internal();
            for disk in disks {
                println!("{}: {} ({} type) - {}/{} free", 
                    disk.name, disk.mount_point, disk.fs_type, 
                    disk.available_space, disk.total_space);
            }
        },
        "probe" => {
            if args.len() < 2 {
                println!("Usage: probe <file_path>");
                return;
            }
            probe_file(&args[1]);
        },
        "mount" => {
            if args.len() < 3 {
                println!("Usage: mount <vhd_path> <mount_point>");
                return;
            }
            mount_vhd(&args[1], &args[2]);
        },
        "unmount" => {
            Command::new("sudo").args(&["qemu-nbd", "--disconnect", "/dev/nbd0"]).status().ok();
            println!("Disconnected /dev/nbd0");
        }
        _ => println!("Unknown command: {}", args[0]),
    }
}

fn probe_file(path: &str) {
    println!("Probing file: {}", path);
    if !std::path::Path::new(path).exists() {
        println!("Error: File does not exist.");
        return;
    }

    let output = Command::new("file")
        .arg(path)
        .output()
        .expect("failed to execute file command");
    println!("Type: {}", String::from_utf8_lossy(&output.stdout));

    if path.to_lowercase().ends_with(".vhdx") || path.to_lowercase().ends_with(".vhd") {
        let info = Command::new("qemu-img")
            .arg("info")
            .arg(path)
            .output()
            .expect("failed to execute qemu-img");
        println!("Disk Image Info:\n{}", String::from_utf8_lossy(&info.stdout));
    }
}

fn mount_vhd(vhd_path: &str, mount_point: &str) {
    println!("Attempting to mount {} to {}", vhd_path, mount_point);
    
    Command::new("sudo").args(&["modprobe", "nbd"]).status().ok();
    
    let status = Command::new("sudo")
        .args(&["qemu-nbd", "--connect=/dev/nbd0", vhd_path])
        .status()
        .expect("failed to connect nbd");
    
    if !status.success() {
        println!("Error: Failed to connect NBD.");
        return;
    }

    let output = Command::new("lsblk")
        .args(&["-J", "/dev/nbd0"])
        .output()
        .expect("failed to list partitions");
    
    println!("Partitions detected:\n{}", String::from_utf8_lossy(&output.stdout));

    let target = "/dev/nbd0p2";
    
    let fs_check = Command::new("sudo")
        .args(&["wipefs", target])
        .output()
        .expect("failed to check filesystem");
    let fs_info = String::from_utf8_lossy(&fs_check.stdout);
    
    if fs_info.contains("ReFS") {
        println!("⚠️ Warning: ReFS detected. Linux cannot mount ReFS natively.");
    } else {
        std::fs::create_dir_all(mount_point).ok();
        let mount_status = Command::new("sudo")
            .args(&["mount", target, mount_point])
            .status()
            .expect("failed to mount");
        
        if mount_status.success() {
            println!("✅ Success: {} mounted to {}", target, mount_point);
        } else {
            println!("❌ Error: Mount failed.");
        }
    }
}
