import { useEffect, useState, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HardDrive, Folder, File as FileIcon, Shield, 
  ChevronRight, Activity, ArrowLeft, Save, 
  Clock, LayoutGrid, Search, MoreVertical,
  Download, AlertCircle, Copy, Move, Trash2,
  Image as ImageIcon, Video as VideoIcon,
  Star, Home, Terminal, Moon, Sun, List, 
  Settings, Info, FileArchive, CheckSquare, 
  Square, X, Filter, Code, Database, Table,
  DownloadCloud, RefreshCw, FileText, Binary,
  Columns, Layout, ArrowUpCircle, Cpu, Cpu as Ram,
  Globe, Type, Edit3, Trash, Star as StarFilled,
  Archive, Zap, Hash, Maximize2, Tag, Music, 
  FileSearch, Key, Command as CommandIcon, ListFilter,
  Check, User, Settings2, Play
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import * as ReactWindow from 'react-window';
const VirtualList = (ReactWindow as any).FixedSizeList;
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { MediaViewer } from '../components/MediaViewer';
import { RawDiskViewer } from '../components/RawDiskViewer';
import Editor from '@monaco-editor/react';
import { listen } from '@tauri-apps/api/event';

// --- Types ---

interface Disk {
  name: string;
  mount_point: string;
  fs_type: string;
  total_space: number;
  available_space: number;
  is_removable: boolean;
}

interface FileMetadata {
  name: string;
  size: number;
  is_dir: boolean;
  last_modified: number;
  path: string;
  permissions: string;
}

interface DetailedFileInfo {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  created: number;
  modified: number;
  accessed: number;
  permissions: string;
  owner: number | null;
  group: number | null;
  extension: string | null;
}

interface RecentFile { path: string; name: string; timestamp: number; }
interface QuickNav { home: string; documents: string; downloads: string; desktop: string; }
interface SystemStats { cpu_usage: number; ram_used: number; ram_total: number; net_upload: number; net_download: number; }

type ViewMode = 'dashboard' | 'explorer' | 'editor' | 'recent' | 'settings' | 'favorites' | 'network' | 'cleanup' | 'raw' | 'terminal';
type ViewerType = 'json' | 'csv' | 'code' | 'image' | 'video' | 'pdf' | 'hex' | 'markdown' | 'audio';

const cn = (...inputs: any[]) => inputs.filter(Boolean).join(' ');

// --- Helpers ---

const getFileType = (name: string): ViewerType | 'other' => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext || '')) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext || '')) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'json') return 'json';
  if (ext === 'csv') return 'csv';
  if (ext === 'md') return 'markdown';
  if (['txt', 'rs', 'js', 'ts', 'tsx', 'css', 'html', 'toml', 'yaml', 'yml', 'py', 'go', 'c', 'cpp', 'sh'].includes(ext || '')) return 'code';
  return 'hex';
};

export default function MasterBrowser() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [view, setView] = useState<ViewMode>('dashboard');
  const [disks, setDisks] = useState<Disk[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [quickLookFile, setQuickLookFile] = useState<FileMetadata | null>(null);
  
  const [editingFile, setEditingFile] = useState<{ path: string; content: string; type: ViewerType | 'other' } | null>(null);
  const [hexData, setHexData] = useState<string | null>(null);
  const [mediaView, setMediaView] = useState<{ path: string; type: 'image' | 'video' | 'audio' } | null>(null);
  
  const [quickNav, setQuickNav] = useState<QuickNav | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [splitView, setSplitView] = useState(false);
  const [secondPath, setSecondPath] = useState<string>('');
  const [secondFiles, setSecondFiles] = useState<FileMetadata[]>([]);

  const [commandPalette, setCommandPalette] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [networkNodes, setNetworkNodes] = useState<string[]>([]);
  const [fileTags, setFileTags] = useState<Record<string, string>>({});

  const [terminalInput, setTerminalInput] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['Master Browser Sovereign Shell [v0.2.16]', 'Ready for command input...']);

  // --- Effects ---

  useEffect(() => {
    fetchDisks();
    fetchQuickNav();
    const savedFavs = localStorage.getItem('mb-favs');
    if (savedFavs) setFavorites(JSON.parse(savedFavs));
    const savedTags = localStorage.getItem('mb-tags');
    if (savedTags) setFileTags(JSON.parse(savedTags));
    
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const timer = setInterval(fetchStats, 2000);
    return () => clearInterval(timer);
  }, []);

  const isTauri = useMemo(() => typeof window !== 'undefined' && (window as any).__TAURI_IPC__, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setCommandPalette(true);
      }
      if (e.key === 'Escape') {
        setCommandPalette(false);
        setQuickLookFile(null);
      }
      if (e.key === ' ' && selectedPaths.length === 1 && !commandPalette && !editingFile) {
        e.preventDefault();
        const file = [...files, ...secondFiles].find(f => f.path === selectedPaths[0]);
        if (file) setQuickLookFile(file);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPaths, files, secondFiles, commandPalette, editingFile]);

  const fetchStats = async () => {
    if (!isTauri) return;
    try { setStats(await invoke<SystemStats>('get_system_stats')); } catch (e) {}
  };

  const fetchQuickNav = async () => {
    if (!isTauri) return;
    try { 
        const nav = await invoke<QuickNav>('get_quick_nav_paths');
        setQuickNav(nav);
        if (!currentPath && nav.home) setCurrentPath(nav.home);
    } catch (e) {}
  };

  const fetchDisks = async () => {
    setLoading(true);
    if (!isTauri) {
      setDisks([{ name: 'System Root', mount_point: '/', fs_type: 'ext4', total_space: 512e9, available_space: 128e9, is_removable: false }]);
      setLoading(false);
      return;
    }
    try { setDisks(await invoke<Disk[]>('list_disks')); } catch (err) { toast.error('Disk Sync Failure'); }
    finally { setLoading(false); }
  };

  const fetchDirectory = async (path: string, isSecond = false) => {
    if (!path) return;
    setLoading(true);
    if (!isSecond) setSelectedPaths([]);
    try {
      const result = await invoke<FileMetadata[]>('list_directory', { path });
      if (isSecond) setSecondFiles(result); else setFiles(result);
    } catch (err) { toast.error('Directory Access Denied'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (view === 'explorer' && currentPath) fetchDirectory(currentPath); }, [view, currentPath]);
  useEffect(() => { if (view === 'explorer' && secondPath) fetchDirectory(secondPath, true); }, [view, secondPath]);

  const openFile = async (file: FileMetadata | RecentFile) => {
    const type = getFileType(file.name);
    if (isTauri) await invoke('track_recent_file', { path: file.path });

    if (['image', 'video', 'audio'].includes(type)) {
      setMediaView({ path: file.path, type: type as any });
      return;
    }

    try {
      if (type === 'hex') {
        setHexData(await invoke<string>('read_file_hex', { path: file.path, limit: 2048 }));
        setEditingFile({ path: file.path, content: '', type: 'hex' });
        setView('editor');
        return;
      }
      const content = await invoke<string>('read_file_content', { path: file.path });
      setEditingFile({ path: file.path, content, type });
      setView('editor');
    } catch (err) { toast.error('Sovereign Read Failure'); }
  };

  const extractArchive = async (path: string) => {
    const dest = path.substring(0, path.lastIndexOf('.'));
    try {
      if (path.endsWith('.zip')) await invoke('extract_zip', { path, dest });
      else if (path.endsWith('.tar.gz')) await invoke('extract_tar_gz', { path, dest });
      toast.success('Archive Extracted');
      fetchDirectory(currentPath);
    } catch (e) { toast.error('Extraction Failed'); }
  };

  const navigateUp = (isSecond = false) => {
    const path = isSecond ? secondPath : currentPath;
    if (!path) return;
    if (path.length <= 3 && (path.endsWith(':\\') || path === '/')) return;
    
    const parts = path.split(/[/\\]/).filter(Boolean);
    if (parts.length === 0) return;
    
    let parent = '';
    if (path.includes(':\\')) {
        parent = parts.slice(0, -1).join('\\');
        if (!parent.includes(':')) parent += parts[0] + '\\';
        else if (!parent.endsWith('\\')) parent += '\\';
    } else {
        parent = '/' + parts.slice(0, -1).join('/');
    }
    
    if (isSecond) setSecondPath(parent); else setCurrentPath(parent);
  };

  const toggleFavorite = (path: string) => {
    const next = favorites.includes(path) ? favorites.filter(p => p !== path) : [...favorites, path];
    setFavorites(next);
    localStorage.setItem('mb-favs', JSON.stringify(next));
    toast.success(favorites.includes(path) ? "Purged from Favorites" : "Anchored to Favorites");
  };

  const setTag = (path: string, tag: string) => {
    const next = { ...fileTags, [path]: tag };
    setFileTags(next);
    localStorage.setItem('mb-tags', JSON.stringify(next));
    toast.success(`Tagged: ${tag}`);
  };

  const runCommand = async () => {
    if (!terminalInput.trim()) return;
    const cmd = terminalInput;
    setTerminalInput('');
    setTerminalOutput(p => [...p, `> ${cmd}`]);
    try {
        const res = await invoke<string>('run_terminal_command', { command: cmd, dir: currentPath || '/' });
        setTerminalOutput(p => [...p, res]);
    } catch (e) {
        setTerminalOutput(p => [...p, `Error: ${e}`]);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // --- Render Sections ---

  const renderQuickLook = () => {
    if (!quickLookFile) return null;
    const type = getFileType(quickLookFile.name);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-20 bg-black/60 backdrop-blur-2xl">
        <motion.div layoutId={`file-${quickLookFile.path}`} className="w-full max-w-5xl h-full bg-white dark:bg-zinc-900/80 rounded-[4rem] border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col">
          <div className="p-8 border-b border-zinc-100 dark:border-white/5 flex justify-between items-center bg-zinc-50/40 dark:bg-zinc-950/40">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-600 dark:text-indigo-400"><FileSearch className="w-6 h-6" /></div>
              <div>
                <h3 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">{quickLookFile.name}</h3>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">{quickLookFile.path}</p>
              </div>
            </div>
            <button onClick={() => setQuickLookFile(null)} className="p-4 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-3xl transition-colors"><X className="w-6 h-6 text-zinc-900 dark:text-zinc-100" /></button>
          </div>
          <div className="flex-1 overflow-auto p-12 flex items-center justify-center">
            {type === 'image' ? <img src={`https://asset.localhost/${quickLookFile.path}`} className="max-w-full max-h-full rounded-3xl shadow-2xl" /> :
             type === 'code' || type === 'markdown' ? <pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap w-full bg-zinc-50 dark:bg-black/20 p-8 rounded-3xl border border-zinc-100 dark:border-white/5">Loading content...</pre> :
             <div className="text-center space-y-6">
                <Binary className="w-24 h-24 mx-auto text-zinc-300 dark:text-zinc-700" />
                <p className="text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-[0.3em]">Binary Interface Locked</p>
             </div>}
          </div>
          <div className="p-8 bg-zinc-50/40 dark:bg-zinc-950/40 border-t border-zinc-100 dark:border-white/5 flex gap-4">
             <button onClick={() => { openFile(quickLookFile); setQuickLookFile(null); }} className="px-8 py-4 bg-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 text-white"><Edit3 className="w-4 h-4" /> Open in Editor</button>
             <button className="px-8 py-4 bg-zinc-200 dark:bg-white/5 rounded-2xl font-black text-xs uppercase tracking-widest text-zinc-900 dark:text-zinc-100">Properties</button>
          </div>
        </motion.div>
      </motion.div>
    );
  };

  const renderDashboard = () => (
    <div className="space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {disks.map(disk => (
          <motion.div 
            key={disk.mount_point}
            whileHover={{ y: -10, scale: 1.02 }}
            onClick={() => { setCurrentPath(disk.mount_point); setView('explorer'); }}
            className="p-10 rounded-[3.5rem] bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 shadow-2xl group cursor-pointer overflow-hidden relative"
          >
            <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:scale-150 group-hover:rotate-12 transition-transform duration-700">
                <HardDrive className="w-40 h-44 text-zinc-900 dark:text-zinc-100" />
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between gap-12">
                <div className="flex justify-between items-start">
                    <div className="p-5 bg-indigo-600 rounded-[1.75rem] shadow-xl shadow-indigo-600/20 text-white">
                        <HardDrive className="w-8 h-8" />
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{disk.fs_type}</div>
                        <div className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100">{disk.name || (disk.mount_point.startsWith('/') ? 'Root' : disk.mount_point)}</div>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        <span>{formatSize(disk.available_space)} Free</span>
                        <span>{Math.round((1 - disk.available_space / disk.total_space) * 100)}%</span>
                    </div>
                    <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-zinc-200 dark:border-white/5">
                        <motion.div 
                            initial={{ width: 0 }} animate={{ width: `${(1 - disk.available_space / disk.total_space) * 100}%` }}
                            className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full"
                        />
                    </div>
                </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <section className="space-y-6">
            <h3 className="text-xl font-black tracking-tighter flex items-center gap-3 text-zinc-900 dark:text-zinc-100"><Clock className="w-5 h-5 text-indigo-500" /> Recent Chronology</h3>
            <div className="grid gap-4">
                {recentFiles.length > 0 ? recentFiles.slice(0, 5).map(file => (
                    <div key={file.path} onClick={() => openFile(file)} className="p-6 rounded-[2rem] bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-900/40 transition-all cursor-pointer flex items-center gap-6 group">
                        <div className="p-3 bg-zinc-200 dark:bg-zinc-800 rounded-xl group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"><FileIcon className="w-5 h-5" /></div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate text-zinc-900 dark:text-zinc-100">{file.name}</p>
                            <p className="text-[9px] text-zinc-500 dark:text-zinc-600 font-mono uppercase tracking-widest truncate">{file.path}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-700" />
                    </div>
                )) : (
                    <div className="p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] flex flex-col items-center justify-center text-center text-zinc-400">
                        <Clock className="w-8 h-8 mb-4 opacity-20" />
                        <p className="text-xs font-black uppercase tracking-widest">Awaiting Activity</p>
                    </div>
                )}
            </div>
        </section>
        <section className="space-y-6">
            <h3 className="text-xl font-black tracking-tighter flex items-center gap-3 text-zinc-900 dark:text-zinc-100"><Zap className="w-5 h-5 text-amber-500" /> Quantum Actions</h3>
            <div className="grid grid-cols-2 gap-4">
                {[
                    { label: 'Scan Network', icon: Globe, color: 'text-emerald-500', action: () => setView('network') },
                    { label: 'Disk Cleanup', icon: Trash2, color: 'text-red-500', action: () => setView('cleanup') },
                    { label: 'System Check', icon: Activity, color: 'text-indigo-500', action: () => {} },
                    { label: 'Terminal', icon: Terminal, color: 'text-zinc-400', action: () => setView('terminal') }
                ].map(act => (
                    <button key={act.label} onClick={act.action} className="p-8 rounded-[2.5rem] bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/20 dark:hover:border-white/10 shadow-lg dark:shadow-none transition-all flex flex-col items-center gap-4 text-center group">
                        <act.icon className={cn("w-8 h-8 group-hover:scale-110 transition-transform", act.color)} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{act.label}</span>
                    </button>
                ))}
            </div>
        </section>
      </div>
    </div>
  );

  const renderFileList = (filesToRenderRaw: FileMetadata[], pathSetter: (p: string) => void, isSecond = false) => {
    const filesToRender = filesToRenderRaw.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return (
      <div className="h-[calc(100vh-280px)] w-full">
        {filesToRender.length > 0 ? (
            /* @ts-ignore */
            <AutoSizer>
            {({ height, width }: { height: number; width: number }) => (
                <VirtualList
                height={height}
                width={width}
                itemCount={filesToRender.length}
                itemSize={80}
                >
                {({ index, style }: { index: number; style: React.CSSProperties }) => {
                    const file = filesToRender[index];
                    const isSelected = selectedPaths.includes(file.path);
                    const type = getFileType(file.name);
                    const tag = fileTags[file.path];
                    return (
                    <div style={style} className="px-2">
                        <motion.div
                        layout key={file.path}
                        className={cn(
                            "group flex items-center gap-5 px-8 py-5 rounded-[2rem] transition-all cursor-pointer border border-transparent",
                            isSelected ? "bg-indigo-600 text-white shadow-2xl shadow-indigo-600/20" : "hover:bg-zinc-100 dark:hover:bg-zinc-900/60"
                        )}
                        onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) setSelectedPaths(p => p.includes(file.path) ? p.filter(x => x !== file.path) : [...p, file.path]);
                            else file.is_dir ? pathSetter(file.path) : openFile(file);
                        }}
                        >
                        <div className="flex-1 flex items-center gap-6 min-w-0">
                            <div className={cn(
                            "p-4 rounded-2xl transition-all shadow-sm group-hover:rotate-3",
                            isSelected ? "bg-white/20 text-white" : (file.is_dir ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-500" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500")
                            )}>
                            {file.is_dir ? <Folder className="w-6 h-6" /> : 
                            type === 'image' ? <ImageIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-500" /> :
                            type === 'video' ? <VideoIcon className="w-6 h-6 text-amber-600 dark:text-amber-500" /> :
                            type === 'audio' ? <Music className="w-6 h-6 text-pink-600 dark:text-pink-500" /> :
                            type === 'markdown' ? <Edit3 className="w-6 h-6 text-purple-600 dark:text-purple-500" /> :
                            <FileIcon className="w-6 h-6" />}
                            </div>
                            
                            <div className="flex flex-col min-w-0 gap-1 text-zinc-900 dark:text-zinc-100">
                            <div className="flex items-center gap-3">
                                <span className="font-black text-sm truncate tracking-tight">{file.name}</span>
                                {tag && <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-[8px] font-black text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-500/20 uppercase tracking-widest">{tag}</span>}
                            </div>
                            <div className={cn("flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.2em]", isSelected ? "text-white/60" : "text-zinc-400 dark:text-zinc-600")}>
                                <span>{file.is_dir ? 'Directory' : formatSize(file.size)}</span>
                                <span className="opacity-20">•</span>
                                <span>{file.permissions}</span>
                            </div>
                            </div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-2 items-center transition-opacity">
                            {(file.name.endsWith('.zip') || file.name.endsWith('.tar.gz')) && 
                                <button onClick={(e) => { e.stopPropagation(); extractArchive(file.path); }} className="p-2.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl text-emerald-600 dark:text-emerald-500 transition-all"><Archive className="w-4 h-4" /></button>}
                            <button onClick={(e) => { e.stopPropagation(); setTag(file.path, 'Important'); }} className="p-2.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"><Tag className="w-4 h-4" /></button>
                            <button onClick={(e) => { e.stopPropagation(); toggleFavorite(file.path); }} className={cn("p-2.5 rounded-xl transition-all", favorites.includes(file.path) ? "text-amber-500" : "text-zinc-400 dark:text-zinc-500 hover:text-amber-500")}><Star className="w-4 h-4" /></button>
                        </div>
                        </motion.div>
                    </div>
                    );
                }}
                </VirtualList>
            )}
            </AutoSizer>
        ) : (
            <div className="flex flex-col items-center justify-center py-32 text-zinc-300 dark:text-zinc-800 animate-pulse">
                <LayoutGrid className="w-16 h-16 mb-6" />
                <p className="text-sm font-black uppercase tracking-widest">No entries found</p>
            </div>
        )}
      </div>
    );
  };

  const renderSettings = () => (
    <div className="max-w-4xl space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-10 rounded-[3rem] bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 space-y-8 shadow-xl dark:shadow-none">
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl text-zinc-900 dark:text-zinc-100"><User className="w-6 h-6" /></div>
                    <div>
                        <h3 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100">Satyaa Sovereign</h3>
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Authorized Developer</p>
                    </div>
                </div>
                <div className="grid gap-2">
                    <button className="flex items-center justify-between w-full p-5 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/5 transition-all text-sm font-bold text-zinc-600 dark:text-zinc-400">
                        Edit Profile <ChevronRight className="w-4 h-4" />
                    </button>
                    <button className="flex items-center justify-between w-full p-5 rounded-2xl hover:bg-zinc-50 dark:hover:bg-white/5 transition-all text-sm font-bold text-zinc-600 dark:text-zinc-400">
                        Manage Keys <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="p-10 rounded-[3rem] bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 space-y-8 shadow-xl dark:shadow-none">
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl text-zinc-900 dark:text-zinc-100"><Settings2 className="w-6 h-6" /></div>
                    <div>
                        <h3 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100">Preferences</h3>
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Interface & Core</p>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-5">
                        <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Dark Mode</span>
                        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={cn(
                            "w-12 h-6 rounded-full transition-all relative",
                            theme === 'dark' ? "bg-indigo-600" : "bg-zinc-300"
                        )}>
                            <div className={cn(
                                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                theme === 'dark' ? "left-7" : "left-1"
                            )} />
                        </button>
                    </div>
                    <div className="flex items-center justify-between px-5">
                        <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Telemetry Refresh</span>
                        <span className="text-[10px] font-mono text-zinc-500">2000ms</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="p-10 rounded-[3rem] bg-indigo-600/5 border border-indigo-500/20 space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500 px-4">System Metadata</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                    { label: 'Release', value: 'v0.2.16' },
                    { label: 'Codename', value: 'Sovereign' },
                    { label: 'Kernel', value: 'User-Space' },
                    { label: 'Stability', value: 'Alpha' }
                ].map(item => (
                    <div key={item.label} className="p-6 bg-white dark:bg-black/20 rounded-3xl border border-zinc-100 dark:border-white/5 space-y-1">
                        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{item.label}</p>
                        <p className="font-black text-zinc-900 dark:text-zinc-100">{item.value}</p>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );

  const renderTerminal = () => (
    <div className="flex flex-col h-full bg-[#080808] rounded-[3rem] border border-zinc-800 overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-950/40">
            <div className="flex items-center gap-4">
                <div className="p-2 bg-zinc-800 rounded-lg text-emerald-500"><Terminal className="w-4 h-4" /></div>
                <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Sovereign Shell</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{currentPath || '/'}</span>
        </div>
        <div className="flex-1 p-10 font-mono text-xs overflow-auto custom-scrollbar space-y-2">
            {terminalOutput.map((line, i) => (
                <p key={i} className={cn(
                    "whitespace-pre-wrap leading-relaxed",
                    line.startsWith('>') ? "text-indigo-400 font-black" : "text-zinc-400"
                )}>{line}</p>
            ))}
        </div>
        <div className="p-6 bg-zinc-950/60 border-t border-white/5 flex items-center gap-4">
            <div className="text-indigo-500 font-black text-lg">λ</div>
            <input 
                autoFocus
                className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-zinc-100 placeholder:text-zinc-800"
                placeholder="EXECUTE SYSTEM COMMAND..."
                value={terminalInput}
                onChange={e => setTerminalInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runCommand()}
            />
            <button onClick={runCommand} className="p-3 bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-all text-white shadow-lg shadow-indigo-600/20"><Play className="w-4 h-4" /></button>
        </div>
    </div>
  );

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-500 font-sans selection:bg-indigo-500/30",
      theme === 'dark' ? "bg-[#050505] text-zinc-100" : "bg-zinc-50 text-zinc-900"
    )}>
      <Toaster position="top-right" theme={theme} richColors />
      
      <AnimatePresence>
        {commandPalette && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] flex items-start justify-center pt-40 px-6 bg-black/40 backdrop-blur-md">
                <motion.div initial={{ y: -20 }} animate={{ y: 0 }} className="w-full max-w-2xl bg-white dark:bg-zinc-900/90 rounded-[2.5rem] border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden shadow-indigo-500/10">
                    <div className="p-8 flex items-center gap-6 border-b border-zinc-100 dark:border-white/5">
                        <CommandIcon className="w-6 h-6 text-indigo-500" />
                        <input 
                            autoFocus 
                            placeholder="EXECUTE COMMAND OR SEARCH DISK..." 
                            value={paletteQuery}
                            onChange={(e) => setPaletteQuery(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-xl font-black tracking-tight placeholder:text-zinc-300 dark:placeholder:text-zinc-700 text-zinc-900 dark:text-zinc-100" 
                        />
                    </div>
                    <div className="p-4 max-h-96 overflow-auto">
                        <p className="px-6 py-4 text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Sovereign Suggestions</p>
                        <div className="grid gap-1">
                            {[
                                { id: 'home', label: 'Navigate to Home', action: () => { if (quickNav) setCurrentPath(quickNav.home); setView('explorer'); setCommandPalette(false); } },
                                { id: 'update', label: 'Check for Updates', action: () => { invoke('check_for_updates'); setCommandPalette(false); } },
                                { id: 'raw', label: 'Raw Partition Probe', action: () => { setView('raw'); setCommandPalette(false); } },
                                { id: 'nexus', label: 'Nexus Network Scan', action: () => { setView('network'); setCommandPalette(false); } },
                                { id: 'term', label: 'Open Terminal', action: () => { setView('terminal'); setCommandPalette(false); } }
                            ].filter(c => c.label.toLowerCase().includes(paletteQuery.toLowerCase())).map(cmd => (
                                <button key={cmd.id} onClick={cmd.action} className="flex items-center gap-4 w-full px-6 py-4 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-2xl transition-all text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white group">
                                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl group-hover:bg-indigo-600 transition-colors"><Zap className="w-4 h-4" /></div>
                                    {cmd.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        )}
        {renderQuickLook()}
        {mediaView && <MediaViewer path={mediaView.path} type={mediaView.type as any} onClose={() => setMediaView(null)} />}
      </AnimatePresence>

      <div className="flex h-screen overflow-hidden">
        {/* Pro Sidebar */}
        <aside className="w-80 border-r border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-[#080808] flex flex-col p-10 shrink-0 relative z-50">
          <div className="flex items-center gap-4 mb-16">
            <div className="p-4 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl shadow-2xl shadow-indigo-600/40">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div className="flex flex-col">
                <h1 className="text-2xl font-black tracking-tighter leading-none text-zinc-900 dark:text-zinc-100">MASTER</h1>
                <span className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.4em] mt-1 text-zinc-400 dark:text-indigo-500">Sovereign v0.2.16</span>
            </div>
          </div>

          <div className="space-y-12 flex-1 overflow-y-auto custom-scrollbar pr-4 -mr-4">
            <nav className="flex flex-col gap-2">
                <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em] px-4 mb-4">Core COMMAND</p>
                {[
                { id: 'dashboard', icon: Home, label: 'Dashboard' },
                { id: 'explorer', icon: LayoutGrid, label: 'Explorer' },
                { id: 'recent', icon: Clock, label: 'Chronology' },
                { id: 'favorites', icon: StarFilled, label: 'Anchors' },
                { id: 'raw', icon: Database, label: 'Raw Probe' },
                { id: 'network', icon: Globe, label: 'Nexus Scan' }
                ].map(item => (
                <button 
                    key={item.id}
                    onClick={() => setView(item.id as ViewMode)}
                    className={cn(
                    "flex items-center gap-5 px-6 py-4 rounded-[1.5rem] text-sm font-black transition-all group relative overflow-hidden",
                    view === item.id ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/30" : "text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-500 hover:bg-indigo-500/5"
                    )}
                >
                    <item.icon className={cn("w-5 h-5 z-10", view === item.id ? "text-white" : "group-hover:scale-110 transition-transform")} />
                    <span className="z-10">{item.label}</span>
                </button>
                ))}
            </nav>

            <div className="space-y-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest px-4">Telemetry</p>
                <div className="grid gap-4">
                    <div className="p-5 bg-zinc-50 dark:bg-zinc-900/40 rounded-3xl border border-zinc-100 dark:border-white/5 space-y-3 shadow-sm dark:shadow-none text-zinc-900 dark:text-zinc-100">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                            <span className="flex items-center gap-2"><Cpu className="w-3 h-3" /> Core Load</span>
                            <span>{stats?.cpu_usage.toFixed(0) || 0}%</span>
                        </div>
                        <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div animate={{ width: `${stats?.cpu_usage || 0}%` }} className="h-full bg-amber-500" />
                        </div>
                    </div>
                    <div className="p-5 bg-zinc-50 dark:bg-zinc-900/40 rounded-3xl border border-zinc-100 dark:border-white/5 space-y-3 shadow-sm dark:shadow-none text-zinc-900 dark:text-zinc-100">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                            <span className="flex items-center gap-2"><Ram className="w-3 h-3" /> Memory</span>
                            <span>{stats ? (stats.ram_used / 1e9).toFixed(1) : 0}G</span>
                        </div>
                        <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div animate={{ width: `${stats ? (stats.ram_used / stats.ram_total * 100) : 0}%` }} className="h-full bg-emerald-500" />
                        </div>
                    </div>
                </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
             <button onClick={() => setCommandPalette(true)} className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-white transition-colors border border-zinc-100 dark:border-white/5 shadow-sm dark:shadow-none"><CommandIcon className="w-5 h-5" /></button>
             <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-white transition-colors border border-zinc-100 dark:border-white/5 shadow-sm dark:shadow-none">
                {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
             </button>
             <button onClick={() => setView('settings')} className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-white transition-colors border border-zinc-100 dark:border-white/5 shadow-sm dark:shadow-none"><Settings className="w-5 h-5" /></button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col h-full min-w-0 bg-white dark:bg-[#050505]">
          <header className="px-16 py-12 flex items-center justify-between relative z-40 border-b border-zinc-50 dark:border-none shadow-sm dark:shadow-none bg-white dark:bg-[#050505]">
            <div className="flex flex-col gap-1">
              <motion.h2 layoutId="view-title" className="text-5xl font-black capitalize tracking-tighter text-zinc-900 dark:text-zinc-100">{view}</motion.h2>
              <div className="flex items-center gap-3">
                <span className="w-8 h-[2px] bg-indigo-600 rounded-full" />
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-[0.4em]">SOVEREIGN PROTOCOL ALPHA</p>
              </div>
            </div>
            
            <div className="flex items-center gap-8">
                <div className="relative group">
                    <Search className="w-5 h-5 absolute left-6 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-500 transition-colors" />
                    <input 
                        type="text" placeholder="GLOBAL PROBE..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] pl-16 pr-8 py-5 text-xs font-black tracking-[0.2em] outline-none focus:ring-4 focus:ring-indigo-500/10 w-80 transition-all text-zinc-900 dark:text-zinc-100"
                    />
                </div>
                <div className="flex items-center gap-4 bg-zinc-50 dark:bg-zinc-900/50 px-8 py-5 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-none">
                    <Activity className={cn("w-5 h-5", loading ? "text-amber-500 animate-spin" : "text-emerald-500")} />
                    <span className="text-[10px] font-black tracking-widest text-zinc-400 dark:text-zinc-500">{loading ? 'LINKING...' : 'SYNCED'}</span>
                </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-16 pb-16 custom-scrollbar relative z-30">
            <AnimatePresence mode="wait">
              <motion.div key={view + (splitView ? 'split' : 'single')} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }} transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }} className="h-full">
                {view === 'dashboard' && renderDashboard()}
                {view === 'raw' && <RawDiskViewer />}
                {view === 'settings' && renderSettings()}
                {view === 'terminal' && renderTerminal()}
                {view === 'explorer' && (
                    <div className={cn("grid gap-16 h-full", splitView ? "grid-cols-2" : "grid-cols-1")}>
                        <div className="flex flex-col gap-8">
                            <div className="flex items-center justify-between">
                                <div className="flex gap-4">
                                    <button onClick={() => navigateUp()} className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-500 transition-all shadow-sm dark:shadow-none"><ArrowLeft className="w-5 h-5" /></button>
                                    <div className="flex flex-col justify-center">
                                        <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest leading-none mb-1">Commander Alpha</p>
                                        <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate max-w-xs">{currentPath || '/'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setSplitView(!splitView)} className={cn("p-4 rounded-2xl border transition-all", splitView ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 shadow-sm dark:shadow-none")}><Columns className="w-5 h-5" /></button>
                                    <button className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-400 dark:text-zinc-500 hover:text-red-500 transition-all shadow-sm dark:shadow-none"><Trash2 className="w-5 h-5" /></button>
                                </div>
                            </div>
                            <div className="flex-1">
                                {renderFileList(files, setCurrentPath)}
                            </div>
                        </div>
                        {splitView && (
                            <motion.div initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-8 border-l border-zinc-100 dark:border-white/5 pl-16">
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-4">
                                        <button onClick={() => navigateUp(true)} className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-500 transition-all shadow-sm dark:shadow-none"><ArrowLeft className="w-5 h-5" /></button>
                                        <div className="flex flex-col justify-center">
                                            <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest leading-none mb-1">Commander Beta</p>
                                            <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate max-w-xs">{secondPath || '/'}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    {renderFileList(secondFiles, setSecondPath, true)}
                                </div>
                            </motion.div>
                        )}
                    </div>
                )}
                {view === 'network' && (
                    <div className="space-y-12">
                        <div className="p-12 rounded-[4rem] bg-indigo-600 shadow-2xl shadow-indigo-600/20 text-white flex justify-between items-center">
                            <div>
                                <h2 className="text-4xl font-black tracking-tighter">Nexus Probe</h2>
                                <p className="text-xs font-black uppercase tracking-[0.3em] opacity-60 mt-2">Scanning local neural network for nodes</p>
                            </div>
                            <button onClick={async () => {
                                const nodes = await invoke<string[]>('scan_local_network');
                                setNetworkNodes(nodes);
                            }} className="p-6 bg-white/20 hover:bg-white/30 rounded-[2.5rem] transition-all flex items-center gap-4 text-white">
                                <RefreshCw className="w-6 h-6" /> <span className="font-black text-sm uppercase tracking-widest">Execute Scan</span>
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {networkNodes.map(node => (
                                <div key={node} className="p-10 rounded-[3rem] bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center text-center gap-6 group hover:border-indigo-500 transition-all shadow-lg dark:shadow-none">
                                    <div className="p-6 bg-zinc-100 dark:bg-zinc-800 rounded-[2rem] text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all"><Globe className="w-8 h-8" /></div>
                                    <div>
                                        <p className="font-black text-lg tracking-tight text-zinc-900 dark:text-zinc-100">{node.split(' ')[0]}</p>
                                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest mt-1">{node.split(' ').slice(1).join(' ')}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {view === 'editor' && (
                    <div className="h-full flex flex-col gap-8">
                        <div className="flex items-center justify-between p-6 bg-zinc-50 dark:bg-zinc-900/50 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-none">
                            <div className="flex items-center gap-6">
                                <button onClick={() => setView('explorer')} className="p-4 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-2xl transition-colors text-zinc-900 dark:text-zinc-100"><ArrowLeft className="w-5 h-5" /></button>
                                <div>
                                    <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-widest leading-none mb-1">Active File</p>
                                    <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400">{editingFile?.path}</span>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button className="px-8 py-4 bg-zinc-200 dark:bg-zinc-800 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all text-zinc-900 dark:text-zinc-100">Download</button>
                                <button onClick={async () => {
                                    await invoke('write_file_content', { path: editingFile?.path, content: editingFile?.content });
                                    toast.success('Sovereign State Saved');
                                }} className="flex items-center gap-3 px-10 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/20 text-white"><Save className="w-4 h-4" /> COMMIT CHANGES</button>
                            </div>
                        </div>
                        <div className="flex-1 bg-white dark:bg-[#0d0d0d] rounded-[4rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-2xl relative">
                            {editingFile?.type === 'hex' ? (
                                <div className="p-16 font-mono text-xs overflow-auto h-full space-y-3 custom-scrollbar text-zinc-900 dark:text-zinc-100">
                                    {hexData?.match(/.{1,32}/g)?.map((row, i) => (
                                        <div key={i} className="flex gap-10 hover:bg-black/5 dark:hover:bg-white/5 p-2 rounded-lg transition-colors">
                                            <span className="text-zinc-400 dark:text-zinc-700 w-24">{(i * 16).toString(16).padStart(8, '0')}</span>
                                            <span className="text-indigo-600 dark:text-indigo-400/80 flex-1">{row.match(/.{1,2}/g)?.join(' ')}</span>
                                            <span className="text-zinc-400 dark:text-zinc-500 w-48 text-right opacity-40">{row.match(/.{1,2}/g)?.map(byte => {
                                                const char = String.fromCharCode(parseInt(byte, 16));
                                                return char.match(/[\x20-\x7E]/) ? char : '.';
                                            }).join('')}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <Editor
                                    height="100%" theme={theme === 'dark' ? "vs-dark" : "light"}
                                    defaultLanguage={editingFile?.type === 'code' ? undefined : (editingFile?.type === 'markdown' ? 'markdown' : 'text')}
                                    value={editingFile?.content}
                                    onChange={val => setEditingFile(p => p ? {...p, content: val || ''} : null)}
                                    options={{
                                        minimap: { enabled: false }, fontSize: 15, fontFamily: 'JetBrains Mono, monospace',
                                        padding: { top: 60, bottom: 60 }, 
                                        lineNumbers: "on", scrollbar: { vertical: 'hidden' }
                                    }}
                                />
                            )}
                        </div>
                    </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
