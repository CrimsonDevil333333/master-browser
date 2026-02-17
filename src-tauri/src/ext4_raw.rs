use serde::{Deserialize, Serialize};

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
            supported_now: false,
            mode: "pending-userspace-reader".to_string(),
            details: "Windows unmounted Ext4 userspace reader/writer integration is in progress.".to_string(),
        };
    }

    Ext4RawCapability {
        partition_path: partition_path.to_string(),
        supported_now: true,
        mode: "mount-bridge".to_string(),
        details: "Ext4 path can currently be routed through mount bridge on this platform.".to_string(),
    }
}
