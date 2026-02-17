import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { HardDrive, Cpu, Database, Activity, Search, ShieldAlert, FileSearch, RefreshCw, Zap, Layers, Box, Globe } from 'lucide-react';
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

interface FSInfo {
  fs_type: string;
  volume_name: string;
  block_size: number;
  total_blocks: number;
  free_blocks: number;
  serial_number: string;
  features: string[];
}

interface PartitionAccessPlan {
  path: string;
  fs_type?: string;
  mount_point?: string;
  can_browse_now: boolean;
  message: string;
}

interface RootEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}
export const RawDiskViewer: React.FC<{ onOpenPath?: (path: string) => void }> = ({ onOpenPath }) => {
  const [devices, setDevices] = useState<RawBlockDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPart, setSelectedPart] = useState<RawPartition | null>(null);
  const [fsInfo, setFsInfo] = useState<FSInfo | null>(null);
  const [accessPlan, setAccessPlan] = useState<PartitionAccessPlan | null>(null);
  const [rootEntries, setRootEntries] = useState<RootEntry[]>([]);
  const [rootLoading, setRootLoading] = useState(false);
  const [currentRelativePath, setCurrentRelativePath] = useState('');
  const [filePreview, setFilePreview] = useState<{ name: string; content: string } | null>(null);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res = await invoke<RawBlockDevice[]>('get_raw_devices');
      setDevices(res);
      setSelectedPart(null);
      setFsInfo(null);
      setAccessPlan(null);
    } catch (e) {
      toast.error('Failed to probe block devices');
    } finally {
      setLoading(false);
    }
  };

  const inspectPartition = async (path: string) => {
    try {
      const [res, plan] = await Promise.all([
        invoke<FSInfo>('inspect_partition_details', { path }),
        invoke<PartitionAccessPlan>('get_partition_access_plan', { path }),
      ]);
      setFsInfo(res);
      setAccessPlan(plan);
      setRootEntries([]);
      setCurrentRelativePath('');
      setFilePreview(null);
      toast.success(`${res.fs_type} Signature Detected`);
    } catch (e) {
      setFsInfo(null);
      setAccessPlan(null);
      setRootEntries([]);
      toast.error('Unknown filesystem or access denied');
    }
  };

  const normalizeRelative = (entryPath: string) => {
    const mount = accessPlan?.mount_point || '';
    if (!mount) return entryPath;
    const rel = entryPath.startsWith(mount) ? entryPath.slice(mount.length) : entryPath;
    return rel.replace(/^[/\\]+/, '');
  };

  const loadEntries = async (relativePath = '') => {
    if (!selectedPart) return;
    setRootLoading(true);
    try {
      const entries = await invoke<RootEntry[]>('list_partition_entries', { path: selectedPart.path, relativePath });
      setRootEntries(entries.slice(0, 80));
      setCurrentRelativePath(relativePath);
      setFilePreview(null);
      toast.success('Loaded partition entries');
    } catch (e) {
      setRootEntries([]);
      toast.error(String(e));
    } finally {
      setRootLoading(false);
    }
  };

  const previewFile = async (entry: RootEntry) => {
    if (!selectedPart || entry.is_dir) return;
    try {
      const rel = normalizeRelative(entry.path);
      const content = await invoke<string>('read_partition_file_preview', {
        path: selectedPart.path,
        relativePath: rel,
        limit: 8192,
      });
      setFilePreview({ name: rel, content });
      toast.success('Loaded file preview');
    } catch (e) {
      toast.error(String(e));
    }
  };

  const openDirectory = async (entry: RootEntry) => {
    if (!entry.is_dir) return;
    const rel = normalizeRelative(entry.path);
    await loadEntries(rel);
  };

  const goParent = async () => {
    if (!currentRelativePath) return;
    const parts = currentRelativePath.split(/[/\\]/).filter(Boolean);
    const parent = parts.slice(0, -1).join('/');
    await loadEntries(parent);
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
      <header className="flex justify-between items-center bg-zinc-900/40 p-8 rounded-[3rem] border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
            <Layers className="w-64 h-64 rotate-12" />
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black tracking-tighter flex items-center gap-4">
            <Layers className="w-8 h-8 text-indigo-500" />
            Universal Partition Probe
          </h2>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 mt-2">Bypassing VFS Layer for ext4, NTFS, Btrfs, XFS, and exFAT</p>
        </div>
        <button onClick={fetchDevices} disabled={loading} className="p-5 bg-indigo-600 rounded-3xl hover:bg-indigo-500 transition-all flex items-center gap-3 relative z-10 shadow-xl shadow-indigo-600/20">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          <span className="font-black text-xs uppercase tracking-widest px-2">Rescan Hardware</span>
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600 px-4">Physical Block Devices</h3>
          <div className="grid gap-4">
            {devices.map(dev => (
              <div key={dev.path} className="bg-zinc-900/20 border border-zinc-800 rounded-[2.5rem] p-8 space-y-6 hover:bg-zinc-900/30 transition-colors">
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
                      className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${selectedPart?.path === part.path ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 shadow-lg shadow-indigo-600/5' : 'bg-black/20 border-white/5 hover:border-white/10 text-zinc-400'}`}
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
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600 px-4">Filesystem Intelligence</h3>
          <AnimatePresence mode="wait">
            {selectedPart ? (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="bg-zinc-900/40 border border-white/5 rounded-[3rem] p-10 space-y-10 min-h-[500px]">
                <div className="flex items-center gap-6 pb-10 border-b border-white/5">
                  <div className="p-5 bg-indigo-600 rounded-3xl text-white shadow-xl shadow-indigo-600/20">
                    <FileSearch className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black tracking-tight">{selectedPart.name}</h4>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{selectedPart.path}</p>
                  </div>
                </div>

                {fsInfo ? (
                  <div className="space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">FS Type</p>
                        <p className={`text-2xl font-black font-mono ${
                            fsInfo.fs_type === 'NTFS' ? 'text-blue-400' :
                            fsInfo.fs_type === 'Btrfs' ? 'text-amber-400' :
                            fsInfo.fs_type === 'XFS' ? 'text-red-400' : 'text-indigo-400'
                        }`}>{fsInfo.fs_type}</p>
                        </div>
                        <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Volume Name</p>
                        <p className="text-lg font-black text-zinc-300 truncate">{fsInfo.volume_name}</p>
                        </div>
                        <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Block Size</p>
                        <p className="text-2xl font-black text-emerald-400 font-mono">{fsInfo.block_size.toLocaleString()} B</p>
                        </div>
                        <div className="p-6 bg-black/20 rounded-[2rem] border border-white/5 space-y-2">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Serial Number</p>
                        <p className="text-sm font-black text-zinc-400 font-mono truncate">{fsInfo.serial_number}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Detected Capabilities</p>
                        <div className="flex flex-wrap gap-3">
                            {fsInfo.features.map(f => (
                                <span key={f} className="px-5 py-2 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest">{f}</span>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-2xl border border-zinc-700 bg-black/20">
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Raw Detect</p>
                        <p className="text-xs mt-1 text-emerald-400 font-black">Supported</p>
                      </div>
                      <div className="p-4 rounded-2xl border border-zinc-700 bg-black/20">
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Cross-OS Browse</p>
                        <p className="text-xs mt-1 text-amber-400 font-black">Mount bridge live / Raw tree in progress</p>
                      </div>
                      <div className="p-4 rounded-2xl border border-zinc-700 bg-black/20">
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Cross-OS Edit</p>
                        <p className="text-xs mt-1 text-amber-400 font-black">Transactional write layer planned</p>
                      </div>
                    </div>

                    <div className="p-8 bg-indigo-500/5 rounded-[2rem] border border-indigo-500/10 flex items-center gap-6">
                      <ShieldAlert className="w-10 h-10 text-indigo-500 shrink-0" />
                      <div>
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Cross-Device Verification</p>
                        <p className="text-xs text-zinc-500 font-medium leading-relaxed mt-1">
                            Successfully parsed {fsInfo.fs_type} header via user-space driver. This metadata is extracted directly from disk sectors, making it available on all platforms regardless of OS support.
                        </p>
                        {accessPlan && (
                          <div className="mt-3 space-y-3">
                            <p className="text-xs font-medium leading-relaxed text-zinc-300">
                              <span className={accessPlan.can_browse_now ? 'text-emerald-400' : 'text-amber-400'}>
                                {accessPlan.can_browse_now ? 'Browse Ready:' : 'Browse Pending:'}
                              </span>{' '}
                              {accessPlan.message}
                              {accessPlan.mount_point ? ` (mount: ${accessPlan.mount_point})` : ''}
                            </p>
                            {accessPlan.can_browse_now && accessPlan.mount_point && onOpenPath && (
                              <button
                                onClick={() => onOpenPath(accessPlan.mount_point!)}
                                className="px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-black uppercase tracking-wider hover:bg-emerald-600/30"
                              >
                                Open Mount in Explorer
                              </button>
                            )}
                            <button
                              onClick={() => loadEntries('')}
                              disabled={rootLoading}
                              className="ml-2 px-4 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-black uppercase tracking-wider hover:bg-indigo-600/30 disabled:opacity-50"
                            >
                              {rootLoading ? 'Loading…' : 'Browse Partition'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {rootEntries.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Partition Browser</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-zinc-500">/{currentRelativePath || ''}</span>
                            <button className="text-[10px] px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800" onClick={goParent} disabled={!currentRelativePath}>Up</button>
                          </div>
                        </div>
                        <div className="max-h-56 overflow-auto space-y-2 pr-2">
                          {rootEntries.map((entry) => (
                            <div key={entry.path} className="p-3 rounded-xl border border-zinc-800 bg-black/20 flex items-center justify-between gap-2">
                              <button className="text-xs font-mono truncate text-left hover:text-indigo-300" onClick={() => entry.is_dir ? openDirectory(entry) : previewFile(entry)}>
                                {entry.is_dir ? `📁 ${entry.name}` : entry.name}
                              </button>
                              <div className="flex items-center gap-2">
                                {!entry.is_dir && (
                                  <button className="text-[10px] px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800" onClick={() => previewFile(entry)}>Preview</button>
                                )}
                                <p className="text-[10px] text-zinc-500 uppercase">{entry.is_dir ? 'dir' : `${(entry.size / 1024).toFixed(1)} KB`}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {filePreview && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">File Preview: {filePreview.name}</p>
                        <pre className="p-4 rounded-2xl border border-zinc-800 bg-black/30 text-xs text-zinc-300 max-h-56 overflow-auto whitespace-pre-wrap">{filePreview.content}</pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-24 text-center space-y-6">
                    <Activity className="w-16 h-16 text-zinc-800 animate-pulse" />
                    <div className="space-y-2">
                      <p className="text-sm font-black text-zinc-600 uppercase tracking-widest">Searching Signatures</p>
                      <p className="text-xs text-zinc-700 max-w-[200px]">Select a partition to begin user-space sector analysis</p>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="h-full min-h-[500px] border-2 border-dashed border-zinc-800 rounded-[3rem] flex flex-col items-center justify-center p-12 text-center group hover:border-indigo-500/20 transition-colors">
                <Box className="w-12 h-12 text-zinc-800 mb-6 group-hover:text-indigo-500/40 transition-colors" />
                <p className="text-sm font-black text-zinc-700 uppercase tracking-widest">Universal Mode Active</p>
                <p className="text-xs text-zinc-800 mt-2">Pick any physical partition to bypass OS limitations and inspect raw metadata.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
