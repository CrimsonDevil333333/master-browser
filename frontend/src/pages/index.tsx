import { useEffect, useState, useMemo } from 'react';
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
  Globe, Type, Edit3, Trash, Star as StarFilled
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { MediaViewer } from '../components/MediaViewer';
import Editor from '@monaco-editor/react';
import ReactJson from 'react-json-view';
import Papa from 'papaparse';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { listen } from '@tauri-apps/api/event';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  owner?: number;
  group?: number;
  extension?: string;
}

interface RecentFile {
  path: string;
  name: string;
  timestamp: number;
}

interface QuickNav {
  home: string;
  documents: string;
  downloads: string;
  desktop: string;
}

interface UpdateInfo {
  tag_name: string;
  body: string;
  html_url: string;
}

interface SystemStats {
  cpu_usage: number;
  ram_used: number;
  ram_total: number;
  net_upload: number;
  net_download: number;
}

type ViewMode = 'dashboard' | 'explorer' | 'editor' | 'recent' | 'settings' | 'favorites';
type ViewerType = 'json' | 'csv' | 'code' | 'image' | 'video' | 'pdf' | 'hex' | 'markdown';

// --- Helpers ---

const getFileType = (name: string): ViewerType | 'other' => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext || '')) return 'video';
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
  const [detailedFile, setDetailedFile] = useState<DetailedFileInfo | null>(null);
  
  const [editingFile, setEditingFile] = useState<{ path: string; content: string; type: ViewerType | 'other' } | null>(null);
  const [csvData, setCsvData] = useState<any[] | null>(null);
  const [hexData, setHexData] = useState<string | null>(null);
  
  const [mediaView, setMediaView] = useState<{ path: string; type: 'image' | 'video' } | null>(null);
  const [quickNav, setQuickNav] = useState<QuickNav | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const [splitView, setSplitView] = useState(false);
  const [secondPath, setSecondPath] = useState<string>('');
  const [secondFiles, setSecondFiles] = useState<FileMetadata[]>([]);

  const [bulkRenameMode, setBulkRenameMode] = useState(false);
  const [renamePattern, setRenamePattern] = useState('');
  const [renameReplacement, setRenameReplacement] = useState('');

  // --- Effects ---

  useEffect(() => {
    fetchDisks();
    fetchQuickNav();
    const savedFavs = localStorage.getItem('master-browser-favs');
    if (savedFavs) setFavorites(JSON.parse(savedFavs));
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const timer = setInterval(fetchStats, 2000);
    return () => clearInterval(timer);
  }, []);

  const isTauri = useMemo(() => typeof window !== 'undefined' && (window as any).__TAURI_IPC__, []);

  useEffect(() => {
    if (isTauri) {
      const unlisten = listen('tauri://file-drop', (event: any) => {
        const paths = event.payload as string[];
        toast.info(`Importing ${paths.length} files...`);
        // Logic to move/copy dropped files to currentPath
        invoke('copy_files', { srcs: paths, dest_dir: currentPath }).then(() => {
            toast.success("Files imported");
            fetchDirectory(currentPath);
        });
      });
      return () => { unlisten.then(f => f()); };
    }
  }, [currentPath]);

  const fetchStats = async () => {
    if (!isTauri) return;
    try {
      const res = await invoke<SystemStats>('get_system_stats');
      setStats(res);
    } catch (e) {}
  };

  const fetchQuickNav = async () => {
    if (!isTauri) return;
    try {
      const res = await invoke<QuickNav>('get_quick_nav_paths');
      setQuickNav(res);
    } catch (e) {}
  };

  const checkForUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await invoke<UpdateInfo>('check_for_updates');
      setUpdateInfo(res);
      toast.success(`Latest version: ${res.tag_name}`);
    } catch (e) {
      toast.error('Failed to check for updates');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const fetchDisks = async () => {
    setLoading(true);
    if (!isTauri) {
      setDisks([
        { name: 'Local Disk (C:)', mount_point: '/', fs_type: 'ext4', total_space: 512000000000, available_space: 128000000000, is_removable: false },
      ]);
      setLoading(false);
      return;
    }
    try {
      const result = await invoke<Disk[]>('list_disks');
      setDisks(result);
    } catch (err) {
      toast.error('Failed to fetch disks');
    } finally {
      setLoading(false);
    }
  };

  const fetchDirectory = async (path: string, isSecond = false) => {
    setLoading(true);
    if (!isSecond) setSelectedPaths([]);
    if (!isTauri) {
        setLoading(false);
        return;
    }
    try {
      const result = await invoke<FileMetadata[]>('list_directory', { path });
      if (isSecond) setSecondFiles(result); else setFiles(result);
    } catch (err) {
      toast.error('Failed to fetch directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'explorer' && currentPath) fetchDirectory(currentPath);
  }, [view, currentPath]);

  useEffect(() => {
    if (view === 'explorer' && secondPath) fetchDirectory(secondPath, true);
  }, [view, secondPath]);

  const fetchRecentFiles = async () => {
    if (!isTauri) return;
    try {
      const result = await invoke<RecentFile[]>('get_recent_files');
      setRecentFiles(result);
    } catch (err) {
      console.error('Failed to fetch recent files:', err);
    }
  };

  useEffect(() => {
    if (view === 'recent') fetchRecentFiles();
  }, [view]);

  const toggleFavorite = (path: string) => {
    const next = favorites.includes(path) ? favorites.filter(p => p !== path) : [...favorites, path];
    setFavorites(next);
    localStorage.setItem('master-browser-favs', JSON.stringify(next));
    toast.success(favorites.includes(path) ? "Removed from favorites" : "Added to favorites");
  };

  const openFile = async (file: FileMetadata | RecentFile) => {
    const type = getFileType(file.name);
    if (isTauri) await invoke('track_recent_file', { path: file.path });

    if (type === 'image' || type === 'video') {
      setMediaView({ path: file.path, type: type as 'image' | 'video' });
      return;
    }

    try {
      if (type === 'hex') {
        const hex = await invoke<string>('read_file_hex', { path: file.path, limit: 1024 });
        setHexData(hex);
        setEditingFile({ path: file.path, content: '', type: 'hex' });
        setView('editor');
        return;
      }

      const content = isTauri ? await invoke<string>('read_file_content', { path: file.path }) : '{"demo": true}';
      if (type === 'csv') {
        const parsed = Papa.parse(content, { header: true });
        setCsvData(parsed.data);
      }
      setEditingFile({ path: file.path, content, type });
      setView('editor');
    } catch (err) {
      toast.error('Failed to read file');
    }
  };

  const runBulkRename = async () => {
    if (!renamePattern || selectedPaths.length === 0) return;
    try {
        const count = await invoke<number>('bulk_rename', { paths: selectedPaths, pattern: renamePattern, replacement: renameReplacement });
        toast.success(`Renamed ${count} files`);
        setBulkRenameMode(false);
        fetchDirectory(currentPath);
    } catch (e) {
        toast.error(`Rename failed: ${e}`);
    }
  };

  const saveFile = async () => {
    if (!editingFile || !isTauri) return;
    try {
      await invoke('write_file_content', { path: editingFile.path, content: editingFile.content });
      toast.success('File saved successfully');
    } catch (err) {
      toast.error('Failed to save file');
    }
  };

  const deleteSelected = async () => {
    if (selectedPaths.length === 0 || !isTauri) return;
    if (!confirm(`Delete ${selectedPaths.length} items?`)) return;
    try {
      await invoke('delete_files', { paths: selectedPaths });
      toast.success('Deleted items');
      fetchDirectory(currentPath);
    } catch (err) {
      toast.error('Delete failed');
    }
  };

  const toggleSelect = (path: string) => {
    setSelectedPaths(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };

  const navigateUp = (isSecond = false) => {
    const path = isSecond ? secondPath : currentPath;
    if (!path) return;
    const parts = path.split(/[/\\]/).filter(Boolean);
    parts.pop();
    const newPath = (path.startsWith('/') ? '/' : '') + parts.join('/');
    if (isSecond) setSecondPath(newPath); else setCurrentPath(newPath);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // --- Renderers ---

  const renderHexViewer = () => {
    if (!hexData) return null;
    const rows = [];
    for (let i = 0; i < hexData.length; i += 32) {
      rows.push(hexData.substring(i, i + 32));
    }
    return (
      <div className="p-10 font-mono text-xs overflow-auto h-full bg-[#0d0d0d] rounded-[2.5rem] border border-zinc-800 shadow-2xl">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-6 border-b border-zinc-800/50 py-2.5 hover:bg-white/5 transition-colors group">
            <span className="text-zinc-600 w-24">{(i * 16).toString(16).padStart(8, '0')}</span>
            <span className="text-indigo-400 flex-1">{row.match(/.{1,2}/g)?.join(' ')}</span>
            <span className="text-zinc-400 w-40 opacity-60 group-hover:opacity-100 transition-opacity">
                {row.match(/.{1,2}/g)?.map(byte => {
                    const char = String.fromCharCode(parseInt(byte, 16));
                    return char.match(/[\x20-\x7E]/) ? char : '.';
                }).join('')}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderFileList = (filesToRender: FileMetadata[], pathSetter: (p: string) => void, isSecond = false) => (
    <div className="grid grid-cols-1 gap-1.5">
        {filesToRender.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map((file) => {
          const isSelected = selectedPaths.includes(file.path);
          const isFav = favorites.includes(file.path);
          const type = getFileType(file.name);
          return (
            <motion.div
              layout
              key={file.path}
              className={cn(
                "group flex items-center gap-5 px-6 py-4 rounded-3xl transition-all cursor-pointer border border-transparent",
                isSelected ? "bg-indigo-600 shadow-2xl shadow-indigo-600/20 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-900/60"
              )}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) toggleSelect(file.path);
                else file.is_dir ? pathSetter(file.path) : openFile(file);
              }}
            >
              <div className="flex-1 flex items-center gap-5 min-w-0">
                <div className={cn(
                  "p-3 rounded-2xl transition-colors shadow-sm",
                  isSelected ? "bg-white/20 text-white" : (file.is_dir ? "bg-indigo-500/10 text-indigo-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500")
                )}>
                  {file.is_dir ? <Folder className="w-5 h-5" /> : 
                   type === 'image' ? <ImageIcon className="w-5 h-5 text-emerald-500" /> :
                   type === 'video' ? <VideoIcon className="w-5 h-5 text-amber-500" /> :
                   type === 'json' ? <Database className="w-5 h-5 text-purple-500" /> :
                   type === 'csv' ? <Table className="w-5 h-5 text-blue-500" /> :
                   type === 'markdown' ? <Edit3 className="w-5 h-5 text-pink-500" /> :
                   type === 'pdf' ? <FileText className="w-5 h-5 text-red-500" /> :
                   <FileIcon className="w-5 h-5" />}
                </div>
                
                <div className="flex flex-col min-w-0 gap-0.5">
                  <span className="font-bold text-[15px] truncate transition-colors">
                    {file.name}
                  </span>
                  <div className={cn("flex items-center gap-3 text-[10px] font-black uppercase tracking-widest", isSelected ? "text-white/60" : "text-zinc-500")}>
                    <span>{file.is_dir ? 'Folder' : formatSize(file.size)}</span>
                    <span className="opacity-30">•</span>
                    <span>{file.permissions}</span>
                  </div>
                </div>
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex gap-1 items-center">
                 <button onClick={(e) => { e.stopPropagation(); toggleFavorite(file.path); }} className={cn("p-2 rounded-xl transition-all hover:scale-110", isFav ? "text-amber-500" : "text-zinc-500 hover:text-amber-500")}>
                    {isFav ? <StarFilled className="w-4 h-4 fill-current" /> : <Star className="w-4 h-4" />}
                 </button>
                 <button onClick={(e) => { e.stopPropagation(); invoke('get_file_details', { path: file.path }).then(d => setDetailedFile(d as any)); }} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-500 transition-all hover:text-white"><Info className="w-4 h-4" /></button>
              </div>
            </motion.div>
          );
        })}
    </div>
  );

  const renderExplorerHeader = (path: string, isSecond = false) => (
    <div className="flex items-center gap-4 bg-white/80 dark:bg-zinc-900/50 p-4 rounded-3xl border border-zinc-200 dark:border-zinc-800/50 backdrop-blur-xl sticky top-0 z-10 mb-6 shadow-sm">
        <button onClick={() => navigateUp(isSecond)} className="p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-zinc-500 hover:text-indigo-500 hover:scale-110 active:scale-95">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 overflow-hidden">
           <div className="text-[10px] font-black font-mono text-zinc-500 truncate uppercase tracking-[0.2em]">
             {path || '/ROOT'}
           </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => setBulkRenameMode(true)} className="p-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-zinc-500 hover:text-indigo-500 transition-all" title="Bulk Rename"><Type className="w-4 h-4" /></button>
            <button onClick={deleteSelected} disabled={selectedPaths.length === 0} className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white disabled:opacity-30 transition-all"><Trash className="w-4 h-4" /></button>
        </div>
    </div>
  );

  const renderStat = (icon: any, label: string, value: string, color: string) => (
    <div className="flex items-center gap-3 p-4 bg-zinc-900/40 rounded-3xl border border-zinc-800/50 group hover:border-indigo-500/30 transition-all">
        <div className={cn("p-2.5 rounded-2xl", color)}>
            {icon}
        </div>
        <div className="flex flex-col">
            <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{label}</span>
            <span className="text-xs font-bold font-mono">{value}</span>
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
        {mediaView && <MediaViewer path={mediaView.path} type={mediaView.type} onClose={() => setMediaView(null)} />}
        {bulkRenameMode && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl">
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-lg bg-zinc-900 rounded-[3rem] p-12 border border-zinc-800 shadow-2xl space-y-8">
                    <div className="space-y-2">
                        <h2 className="text-3xl font-black tracking-tighter">Bulk Sovereign Rename</h2>
                        <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{selectedPaths.length} items targeted</p>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-4">Regex Pattern</label>
                            <input value={renamePattern} onChange={e => setRenamePattern(e.target.value)} placeholder="e.g. ^IMG_(\d+)" className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-4">Replacement</label>
                            <input value={renameReplacement} onChange={e => setRenameReplacement(e.target.value)} placeholder="e.g. Vacation_$1" className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm" />
                        </div>
                    </div>
                    <div className="flex gap-4 pt-4">
                        <button onClick={() => setBulkRenameMode(false)} className="flex-1 px-8 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-black text-sm transition-all uppercase tracking-widest">Cancel</button>
                        <button onClick={runBulkRename} className="flex-1 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-sm transition-all shadow-xl shadow-indigo-600/20 uppercase tracking-widest">Execute</button>
                    </div>
                </motion.div>
            </motion.div>
        )}
        {detailedFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
             <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-md bg-zinc-900 rounded-[2.5rem] p-10 border border-zinc-800 shadow-2xl">
                <div className="flex justify-between items-start mb-8">
                  <h2 className="text-2xl font-black tracking-tight">Properties</h2>
                  <button onClick={() => setDetailedFile(null)} className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-6">
                  {[
                    { label: 'Name', value: detailedFile.name },
                    { label: 'Location', value: detailedFile.path, mono: true },
                    { label: 'Size', value: formatSize(detailedFile.size) },
                    { label: 'Permissions', value: detailedFile.permissions, mono: true },
                  ].map(item => (
                    <div key={item.label} className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">{item.label}</span>
                      <span className={cn("text-sm font-bold", item.mono && "font-mono text-xs text-indigo-400 break-all")}>{item.value}</span>
                    </div>
                  ))}
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-[#080808] flex flex-col p-10 shrink-0">
          <div className="flex items-center gap-4 mb-12">
            <motion.div whileHover={{ rotate: 360, scale: 1.1 }} transition={{ duration: 0.6, type: 'spring' }} className="p-3.5 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[1.25rem] shadow-2xl shadow-indigo-600/40">
              <Shield className="w-7 h-7 text-white" />
            </motion.div>
            <h1 className="text-2xl font-black tracking-tighter">MASTER</h1>
          </div>

          <div className="space-y-10 flex-1 overflow-y-auto custom-scrollbar pr-4 -mr-4">
            <nav className="flex flex-col gap-2">
                <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.25em] px-4 mb-4">Core COMMAND</p>
                {[
                { id: 'dashboard', icon: Home, label: 'Dashboard' },
                { id: 'explorer', icon: LayoutGrid, label: 'Explorer' },
                { id: 'recent', icon: Clock, label: 'Recent' },
                { id: 'favorites', icon: StarFilled, label: 'Favorites' },
                { id: 'settings', icon: Settings, label: 'Settings' }
                ].map(item => (
                <button 
                    key={item.id}
                    onClick={() => setView(item.id as ViewMode)}
                    className={cn(
                    "flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-bold transition-all group relative overflow-hidden",
                    view === item.id ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/30" : "text-zinc-500 hover:text-indigo-500 hover:bg-indigo-500/5"
                    )}
                >
                    <item.icon className={cn("w-5 h-5 z-10", view === item.id ? "text-white" : "group-hover:scale-110 transition-transform")} />
                    <span className="z-10">{item.label}</span>
                    {view === item.id && <motion.div layoutId="sidebar-active" className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-indigo-500 -z-0" />}
                </button>
                ))}
            </nav>

            {quickNav && (
                <nav className="flex flex-col gap-2">
                    <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.25em] px-4 mb-4">Quick ACCESS</p>
                    {[
                        { label: 'Home', path: quickNav.home, icon: Home },
                        { label: 'Documents', path: quickNav.documents, icon: FileText },
                        { label: 'Downloads', path: quickNav.downloads, icon: Download },
                        { label: 'Desktop', path: quickNav.desktop, icon: Layout }
                    ].map(item => (
                        <button 
                            key={item.label}
                            onClick={() => { setCurrentPath(item.path); setView('explorer'); }}
                            className="flex items-center gap-4 px-5 py-3 rounded-2xl text-xs font-bold text-zinc-500 hover:text-indigo-500 hover:bg-indigo-500/5 transition-all group"
                        >
                            <item.icon className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all" /> {item.label}
                        </button>
                    ))}
                </nav>
            )}

            <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-4">System Live</p>
                <div className="grid grid-cols-1 gap-3">
                    {renderStat(<Cpu className="w-4 h-4" />, "CPU", `${stats?.cpu_usage.toFixed(1)}%`, "bg-amber-500/10 text-amber-500")}
                    {renderStat(<Ram className="w-4 h-4" />, "RAM", `${stats ? (stats.ram_used / 1024 / 1024 / 1024).toFixed(1) : 0} GB`, "bg-emerald-500/10 text-emerald-500")}
                    {renderStat(<Globe className="w-4 h-4" />, "NET", `${stats ? (stats.net_upload / 1024).toFixed(0) : 0} KB/s`, "bg-indigo-500/10 text-indigo-500")}
                </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800">
             <div className="p-6 rounded-[2rem] bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between shadow-sm">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black dark:text-zinc-500 uppercase tracking-[0.2em]">Appearance</span>
                  <span className="text-xs text-zinc-500 uppercase font-black">{theme}</span>
                </div>
                <button 
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="relative w-14 h-8 rounded-full bg-zinc-300 dark:bg-zinc-800 transition-colors p-1.5"
                >
                  <motion.div 
                    animate={{ x: theme === 'dark' ? 24 : 0 }}
                    className="w-5 h-5 rounded-full bg-white dark:bg-indigo-500 shadow-xl flex items-center justify-center"
                  >
                    {theme === 'dark' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3 text-zinc-400" />}
                  </motion.div>
                </button>
             </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col h-full min-w-0 bg-transparent">
          <header className="px-12 py-10 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <motion.h2 layoutId="view-title" className="text-4xl font-black capitalize tracking-tighter">{view}</motion.h2>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-[0.3em] opacity-40">UNIVERSAL SOVEREIGN PHASE 5</p>
            </div>
            
            <div className="flex items-center gap-6">
                <div className="relative group">
                    <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-500 transition-colors" />
                    <input 
                        type="text" 
                        placeholder="GLOBAL SEARCH..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-12 pr-6 py-3.5 text-xs font-black tracking-widest outline-none focus:ring-2 focus:ring-indigo-500/50 w-64 transition-all"
                    />
                </div>
                {view === 'explorer' && (
                    <button 
                        onClick={() => {
                            setSplitView(!splitView);
                            if (!splitView && !secondPath) setSecondPath(currentPath);
                        }}
                        className={cn(
                            "p-4 rounded-2xl border transition-all hover:scale-105 active:scale-95",
                            splitView ? "bg-indigo-600 border-indigo-600 text-white shadow-2xl shadow-indigo-600/30" : "bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                        )}
                    >
                        <Columns className="w-5 h-5" />
                    </button>
                )}
                <div className="flex items-center gap-4 text-[10px] font-black tracking-widest text-zinc-500 bg-white dark:bg-zinc-900/50 px-6 py-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <Activity className={cn("w-4 h-4", loading ? "text-amber-500 animate-spin" : "text-emerald-500")} />
                    {loading ? 'BUSY' : 'READY'}
                </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-12 pb-12 custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={view + (splitView ? 'split' : 'single')}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                className="h-full"
              >
                {view === 'dashboard' && renderDashboard()}
                {view === 'explorer' && (
                    <div className={cn("grid gap-12 h-full", splitView ? "grid-cols-2" : "grid-cols-1")}>
                        <div className="flex flex-col gap-6">
                            <div className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.4em] px-6 flex justify-between items-center bg-zinc-900/30 py-3 rounded-2xl border border-white/5 shadow-inner">
                                <span>COMMANDER ALPHA</span>
                                <span className="font-mono text-indigo-500 truncate ml-4">{currentPath}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 -mr-4">
                                {renderExplorerHeader(currentPath)}
                                {renderFileList(files, setCurrentPath)}
                            </div>
                        </div>
                        {splitView && (
                            <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-6 border-l border-white/5 pl-12">
                                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.4em] px-6 flex justify-between items-center bg-zinc-900/30 py-3 rounded-2xl border border-white/5 shadow-inner">
                                    <span>COMMANDER BETA</span>
                                    <span className="font-mono text-indigo-500 truncate ml-4">{secondPath}</span>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 -mr-4">
                                    {renderExplorerHeader(secondPath, true)}
                                    {renderFileList(secondFiles, setSecondPath, true)}
                                </div>
                            </motion.div>
                        )}
                    </div>
                )}
                {view === 'favorites' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {favorites.map(path => (
                            <div key={path} onClick={() => { setCurrentPath(path); setView('explorer'); }} className="p-6 rounded-[2.5rem] bg-white dark:bg-zinc-900/40 border border-zinc-800 hover:border-indigo-500 transition-all cursor-pointer group flex items-center gap-6">
                                <div className="p-4 bg-amber-500/10 text-amber-500 rounded-3xl group-hover:bg-amber-500 group-hover:text-white transition-all">
                                    <StarFilled className="w-6 h-6 fill-current" />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <p className="font-black text-sm truncate">{path.split(/[/\\]/).pop()}</p>
                                    <p className="text-[10px] text-zinc-500 truncate font-mono uppercase tracking-widest">{path}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {view === 'editor' && (
                    <div className="h-full flex flex-col gap-6">
                        <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-3xl border border-zinc-800">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setView('explorer')} className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors"><ArrowLeft className="w-4 h-4" /></button>
                                <span className="text-xs font-black tracking-widest uppercase text-zinc-500">{editingFile?.path}</span>
                            </div>
                            <button onClick={saveFile} className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/20"><Save className="w-4 h-4" /> COMMIT CHANGES</button>
                        </div>
                        <div className={cn("flex-1 bg-[#0d0d0d] rounded-[3rem] border border-zinc-800 overflow-hidden shadow-2xl", editingFile?.type === 'markdown' && "grid grid-cols-2")}>
                            {editingFile?.type === 'hex' ? renderHexViewer() : (
                                <>
                                    <div className="h-full border-r border-zinc-800/50">
                                        <Editor
                                            height="100%"
                                            theme="vs-dark"
                                            defaultLanguage={editingFile?.type === 'code' ? undefined : (editingFile?.type === 'markdown' ? 'markdown' : 'text')}
                                            path={editingFile?.path}
                                            value={editingFile?.content}
                                            onChange={val => setEditingFile(p => p ? {...p, content: val || ''} : null)}
                                            options={{
                                                minimap: { enabled: false },
                                                fontSize: 14,
                                                fontFamily: 'JetBrains Mono, monospace',
                                                padding: { top: 40, bottom: 40, left: 40 },
                                                smoothScrolling: true,
                                                cursorSmoothCaretAnimation: "on" as const,
                                                backgroundColor: '#0d0d0d',
                                                lineNumbers: "on",
                                                scrollbar: { vertical: 'hidden', horizontal: 'hidden' }
                                            }}
                                        />
                                    </div>
                                    {editingFile?.type === 'markdown' && (
                                        <div className="h-full p-12 overflow-y-auto custom-scrollbar prose prose-invert max-w-none bg-[#0a0a0a]">
                                            <div dangerouslySetInnerHTML={{ __html: 'Live Markdown Preview logic here (can integrate marked.js later)' }} />
                                            <div className="text-zinc-600 font-mono text-xs italic opacity-50 uppercase tracking-widest">Live Rendering Active...</div>
                                            <pre className="mt-8 text-[10px] text-zinc-500 bg-black/30 p-6 rounded-2xl border border-white/5">{editingFile.content}</pre>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
                {view === 'settings' && (
                    <div className="max-w-3xl mx-auto">
                        {renderSettings()}
                    </div>
                )}
                {view === 'recent' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    {recentFiles.map(file => (
                      <div key={file.path} onClick={() => openFile(file)} className="p-8 rounded-[3rem] bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 transition-all cursor-pointer group flex items-center gap-8 shadow-sm">
                        <div className="p-5 bg-zinc-100 dark:bg-zinc-800 rounded-[1.5rem] group-hover:bg-indigo-500 group-hover:text-white transition-all shadow-sm">
                          <FileIcon className="w-7 h-7 text-zinc-400 group-hover:text-white" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-black text-lg tracking-tight truncate">{file.name}</p>
                          <p className="text-[10px] text-zinc-500 truncate font-mono uppercase tracking-[0.2em] mt-1">{file.path}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        
        body {
          font-family: 'Plus Jakarta Sans', sans-serif;
          overflow: hidden;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: ${theme === 'dark' ? '#1f1f23' : '#e4e4e7'}; 
          border-radius: 10px; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { 
          background: ${theme === 'dark' ? '#3f3f46' : '#d4d4d8'}; 
        }
      `}</style>
    </div>
  );
}
