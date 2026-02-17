import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { HardDrive, Cpu, Database, Activity, Search, ShieldAlert, FileSearch, RefreshCw, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface RawPartition {
  name: string;
  path: string;
  size: number;
  fs_type?: string;
}

interface RawBlockDevice {
  name: string;
  path: string;
  size: number;
  device_type: string;
  partitions: RawPartition[];
}

interface Ext4Info {
  s_inodes_count: number;
  s_blocks_count_lo: number;
  s_free_blocks_count_lo: number;
  s_free_inodes_count: number;
  s_volume_name: string;
  s_last_mounted: string;
}

interface NtfsInfo {
  serial_number: string;
  bytes_per_sector: number;
  sectors_per_cluster: number;
  total_sectors: number;
}

interface FatInfo {
  volume_label: string;
  oem_name: string;
  bytes_per_sector: number;
  sectors_per_cluster: number;
  total_sectors: number;
}

type InspectionData = { type: 'ext4', data: Ext4Info } | { type: 'ntfs', data: NtfsInfo } | { type: 'fat', data: FatInfo } | null;

export const RawDiskViewer: React.FC = () => {
  const [devices, setDevices] = useState<RawBlockDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPart, setSelectedPart] = useState<RawPartition | null>(null);
  const [inspection, setInspection] = useState<InspectionData>(null);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res = await invoke<RawBlockDevice[]>('get_raw_devices');
      setDevices(res);
    } catch (e) {
      toast.error('Failed to probe block devices');
    } finally {
      setLoading(false);
    }
  };

  const inspectPartition = async (path: string) => {
    setInspection(null);
    
    // Try Ext4
    try {
      const res = await invoke<Ext4Info>('inspect_ext4_superblock', { path });
      setInspection({ type: 'ext4', data: res });
      toast.success('Ext4 Superblock Identified');
      return;
    } catch (e) {}

    // Try NTFS
    try {
      const res = await invoke<NtfsInfo>('inspect_ntfs_volume', { path });
      setInspection({ type: 'ntfs', data: res });
      toast.success('NTFS Volume Identified');
      return;
    } catch (e) {}

    // Try FAT
    try {
      const res = await invoke<FatInfo>('inspect_fat_volume', { path });
      setInspection({ type: 'fat', data: res });
      toast.success('FAT Volume Identified');
      return;
    } catch (e) {}

    toast.error('Unknown filesystem or access denied');
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const formatSize = (bytes: number) => {
    const g = bytes / 1e9;
    return g.toFixed(2) + ' GB';
  };

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-center bg-zinc-900/40 p-8 rounded-[3rem] border border-white/5">
        <div>
          <h2 className="text-3xl font-black tracking-tighter">Raw Hardware Probe</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 mt-2">Bypassing OS Mount Points for Direct Sector Access</p>
        </div>
        <button onClick={fetchDevices} disabled={loading} className="p-5 bg-indigo-600 rounded-3xl hover:bg-indigo-500 transition-all flex items-center gap-3">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          <span className="font-black text-xs uppercase tracking-widest px-2">Rescan Bus</span>
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600 px-4">Detected Block Devices</h3>
          <div className="grid gap-4">
            {devices.map(dev => (
              <div key={dev.path} className="bg-zinc-900/20 border border-zinc-800 rounded-[2.5rem] p-8 space-y-6">
                <div className="flex items-center gap-6">
                  <div className="p-4 bg-zinc-800 rounded-2xl text-indigo-400">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-black text-lg tracking-tight">/dev/{dev.name}</p>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{formatSize(dev.size)} Physical Disk</p>
                  </div>
                </div>
                
                <div className="grid gap-2">
                  {dev.partitions.map(part => (
                    <button 
                      key={part.path}
                      onClick={() => { setSelectedPart(part); inspectPartition(part.path); }}
                      className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${selectedPart?.path === part.path ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-black/20 border-white/5 hover:border-white/10 text-zinc-400'}`}
                    >
                      <div className="flex items-center gap-4">
                        <HardDrive className="w-4 h-4" />
                        <span className="font-bold text-sm">{part.name}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-60">{formatSize(part.size)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600 px-4">Low-Level Inspection</h3>
          <AnimatePresence mode="wait">
            {selectedPart ? (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="bg-zinc-900/40 border border-white/5 rounded-[3rem] p-10 space-y-10 min-h-[400px]">
                <div className="flex items-center gap-6 pb-10 border-b border-white/5">
                  <div className="p-5 bg-indigo-600 rounded-3xl text-white">
                    <FileSearch className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black tracking-tight">{selectedPart.name}</h4>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{selectedPart.path}</p>
                  </div>
                </div>

                {inspection ? (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="col-span-2 flex items-center gap-3 px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Filesystem: <span className="text-indigo-400">{inspection.type.toUpperCase()}</span></span>
                    </div>

                    {inspection.type === 'ext4' && (
                        <>
                            <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Inodes Count</p>
                                <p className="text-2xl font-black text-indigo-400 font-mono">{inspection.data.s_inodes_count.toLocaleString()}</p>
                            </div>
                            <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Free Blocks</p>
                                <p className="text-2xl font-black text-emerald-400 font-mono">{inspection.data.s_free_blocks_count_lo.toLocaleString()}</p>
                            </div>
                            <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Volume Name</p>
                                <p className="text-sm font-black text-zinc-300 truncate">{inspection.data.s_volume_name || 'N/A'}</p>
                            </div>
                            <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Last Mounted</p>
                                <p className="text-xs font-mono text-zinc-400 truncate">{inspection.data.s_last_mounted || 'Unknown'}</p>
                            </div>
                        </>
                    )}

                    {inspection.type === 'ntfs' && (
                        <>
                            <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Serial Number</p>
                                <p className="text-sm font-black text-indigo-400 font-mono truncate">{inspection.data.serial_number}</p>
                            </div>
                            <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Sector Size</p>
                                <p className="text-2xl font-black text-emerald-400 font-mono">{inspection.data.bytes_per_sector} B</p>
                            </div>
                            <div className="col-span-2 p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Total Sectors</p>
                                <p className="text-2xl font-black text-zinc-300 font-mono">{inspection.data.total_sectors.toLocaleString()}</p>
                            </div>
                        </>
                    )}

                    {inspection.type === 'fat' && (
                        <>
                            <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Volume Label</p>
                                <p className="text-sm font-black text-indigo-400 truncate">{inspection.data.volume_label}</p>
                            </div>
                            <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">OEM Name</p>
                                <p className="text-sm font-black text-emerald-400 truncate">{inspection.data.oem_name}</p>
                            </div>
                            <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Sector Size</p>
                                <p className="text-2xl font-black text-zinc-300 font-mono">{inspection.data.bytes_per_sector} B</p>
                            </div>
                            <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Clusters</p>
                                <p className="text-2xl font-black text-zinc-300 font-mono">{inspection.data.sectors_per_cluster}</p>
                            </div>
                        </>
                    )}

                    <div className="col-span-2 p-8 bg-indigo-500/5 rounded-[2rem] border border-indigo-500/10 flex items-center gap-6">
                      <ShieldAlert className="w-10 h-10 text-indigo-500 shrink-0" />
                      <div>
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">User-Space Access Status</p>
                        <p className="text-xs text-zinc-500 font-medium leading-relaxed mt-1">Direct sector-level probe successful. Bypassed VFS layer via logical disk seek.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                    <Activity className="w-16 h-16 text-zinc-800 animate-pulse" />
                    <div className="space-y-2">
                      <p className="text-sm font-black text-zinc-600 uppercase tracking-widest">Awaiting Signature</p>
                      <p className="text-xs text-zinc-700 max-w-[200px]">Probing sectors for Ext4, NTFS, or FAT signatures...</p>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="h-full min-h-[400px] border-2 border-dashed border-zinc-800 rounded-[3rem] flex flex-col items-center justify-center p-12 text-center">
                <Database className="w-12 h-12 text-zinc-800 mb-6" />
                <p className="text-sm font-black text-zinc-700 uppercase tracking-widest">No Selection</p>
                <p className="text-xs text-zinc-800 mt-2">Pick a physical partition to begin sector-level analysis</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
