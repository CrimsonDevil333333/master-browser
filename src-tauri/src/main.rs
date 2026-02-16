use serde::{Serialize, Deserialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub fs_type: String,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
}

#[tauri::command]
pub fn list_disks() -> Vec<DiskInfo> {
    let mut disks = Vec::new();
    
    // In a production environment, we'd use a more robust crate like `sysinfo` or `disks-rs`
    // For this initial setup, we'll simulate or use basic sys calls
    use sysinfo::{DiskExt, System, SystemExt};
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

fn main() {
    // If CLI arguments are provided, handle them here instead of starting the GUI
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
    println!("Master Browser CLI Mode");
    if args.is_empty() {
        println!("Available commands: ls, status");
        return;
    }

    match args[0].as_str() {
        "ls" => {
            let disks = list_disks();
            for disk in disks {
                println!("{}: {} ({} type) - {}/{} free", 
                    disk.name, disk.mount_point, disk.fs_type, 
                    disk.available_space, disk.total_space);
            }
        },
        _ => println!("Unknown command: {}", args[0]),
    }
}
