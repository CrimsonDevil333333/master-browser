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

interface Disk { name: string; mount_point: string; fs_type: string; total_space: number; available_space: number; is_removable: boolean; }
interface FileMetadata { name: string; size: number; is_dir: boolean; last_modified: number; path: string; permissions: string; }
interface RecentFile { path: string; name: string; timestamp: number; }
interface QuickNav { home: string; documents: string; downloads: string; desktop: string; }
interface SystemStats { cpu_usage: number; ram_used: number; ram_total: number; net_upload: number; net_download: number; }
type ViewMode = 'dashboard' | 'explorer' | 'editor' | 'recent' | 'settings' | 'favorites' | 'network' | 'cleanup' | 'raw' | 'terminal';
type ViewerType = 'json' | 'csv' | 'code' | 'image' | 'video' | 'pdf' | 'hex' | 'markdown' | 'audio';

const cn = (...inputs: any[]) => inputs.filter(Boolean).join(' ');

export default function MasterBrowser() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [view, setView] = useState<ViewMode>('dashboard');
  const [disks, setDisks] = useState<Disk[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickNav, setQuickNav] = useState<QuickNav | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['Sovereign Shell v0.2.17', 'Ready...']);

  useEffect(() => {
    fetchDisks();
    if (theme === 'light') document.documentElement.classList.remove('dark');
    else document.documentElement.classList.add('dark');
  }, [theme]);

  const isTauri = useMemo(() => typeof window !== 'undefined' && (window as any).__TAURI_IPC__, []);

  const fetchDisks = async () => {
    if (!isTauri) return;
    try { 
        const res = await invoke<Disk[]>('list_disks');
        setDisks(res);
        if (!currentPath && res.length > 0) setCurrentPath(res[0].mount_point);
    } catch (e) {}
  };

  const fetchDirectory = async (path: string) => {
    if (!path) return;
    setLoading(true);
    try {
      const result = await invoke<FileMetadata[]>('list_directory', { path });
      setFiles(result);
    } catch (err) { toast.error('Access Denied'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (view === 'explorer' && currentPath) fetchDirectory(currentPath); }, [view, currentPath]);

  const navigateUp = () => {
    if (!currentPath || currentPath === '/' || currentPath.match(/^[A-Z]:\\$/i)) return;
    const parts = currentPath.split(/[/\\]/).filter(Boolean);
    let parent = currentPath.includes(':\\') ? (parts.slice(0, -1).join('\\') + '\\') : ('/' + parts.slice(0, -1).join('/'));
    if (parent === '' || parent === '\\') parent = currentPath.includes(':\\') ? parts[0] + ':\\' : '/';
    setCurrentPath(parent);
  };

  const runCommand = async () => {
    if (!terminalInput.trim()) return;
    const cmd = terminalInput; setTerminalInput('');
    setTerminalOutput(p => [...p, `> ${cmd}`]);
    try {
        const res = await invoke<string>('run_terminal_command', { command: cmd, dir: currentPath || '.' });
        setTerminalOutput(p => [...p, res]);
    } catch (e) { setTerminalOutput(p => [...p, `Error: ${e}`]); }
  };

  const formatSize = (b: number) => {
    if (b === 0) return '0 B';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
  };

  const openFile = async (file: FileMetadata | RecentFile) => {
    try {
      await invoke<string>('read_file_content', { path: file.path });
      toast.success('File system verified.');
    } catch (err) { toast.error('Read Failure'); }
  };

  return (
    <div className={cn("flex h-screen w-screen transition-colors duration-300", theme === 'dark' ? "bg-[#050505] text-white" : "bg-white text-zinc-900")}>
      <Toaster position="top-right" richColors theme={theme} />
      <aside className="w-72 border-r border-zinc-200 dark:border-zinc-800 flex flex-col p-8 shrink-0 bg-zinc-50 dark:bg-[#080808] z-50">
        <div className="flex items-center gap-4 mb-12">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg"><Shield className="w-6 h-6 text-white" /></div>
            <div><h1 className="text-xl font-black tracking-tighter">MASTER</h1><p className="text-[8px] font-bold text-indigo-500 uppercase">Sovereign v0.2.17</p></div>
        </div>
        <nav className="flex-1 space-y-2">
            {[ { id: 'dashboard', icon: Home, label: 'Dashboard' }, { id: 'explorer', icon: LayoutGrid, label: 'Explorer' }, { id: 'raw', icon: Database, label: 'Raw Probe' }, { id: 'terminal', icon: Terminal, label: 'Terminal' } ].map(item => (
                <button key={item.id} onClick={() => setView(item.id as any)} className={cn("flex items-center gap-4 w-full px-5 py-3 rounded-xl text-sm font-bold transition-all", view === item.id ? "bg-indigo-600 text-white shadow-md" : "text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/5")}>
                    <item.icon className="w-4 h-4" />{item.label}
                </button>
            ))}
        </nav>
        <div className="pt-8 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-3 bg-zinc-200 dark:bg-zinc-900 rounded-xl hover:text-indigo-500">{theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}</button>
            <button onClick={() => setView('settings' as any)} className="p-3 bg-zinc-200 dark:bg-zinc-900 rounded-xl hover:text-indigo-500"><Settings className="w-4 h-4" /></button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#050505]">
        <header className="h-20 px-12 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between bg-white dark:bg-[#050505] z-40">
            <h2 className="text-2xl font-black capitalize tracking-tight">{view}</h2>
            <div className="flex items-center gap-6">
                <div className="relative text-zinc-900 dark:text-white"><Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" /><input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-2 text-xs font-bold outline-none w-64" /></div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg text-emerald-600 text-[10px] font-black uppercase border border-emerald-500/20"><Activity className="w-3 h-3" /> Live</div>
            </div>
        </header>
        <div className="flex-1 p-10 flex flex-col relative z-30 overflow-hidden">
            <AnimatePresence mode="wait">
                <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                    {view === 'explorer' && (
                        <div className="flex-1 flex flex-col gap-4">
                            <div className="flex items-center gap-4 bg-zinc-100 dark:bg-zinc-900/50 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
                                <button onClick={navigateUp} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg"><ArrowLeft className="w-4 h-4" /></button>
                                <p className="text-xs font-mono font-bold truncate flex-1">{currentPath}</p>
                                <button onClick={fetchDisks} className="p-1.5 text-zinc-400 hover:text-indigo-500"><RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /></button>
                            </div>
                            <div className="flex-1 relative">
                                {/* @ts-ignore */}
                                <AutoSizer>
                                {({ height, width }: any) => {
                                    const filtered = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
                                    return (
                                        <VirtualList height={height} width={width} itemCount={filtered.length} itemSize={65}>
                                        {({ index, style }: any) => {
                                            const f = filtered[index];
                                            return (
                                                <div style={style} className="px-1"><div onClick={() => f.is_dir ? setCurrentPath(f.path) : openFile(f)} className="flex items-center gap-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800 hover:border-indigo-500/50 cursor-pointer transition-all"><div className={cn("p-2 rounded-lg", f.is_dir ? "text-indigo-500 bg-indigo-500/10" : "text-zinc-400 bg-zinc-100 dark:bg-zinc-800")}>{f.is_dir ? <Folder className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}</div><div className="flex-1 min-w-0 text-zinc-900 dark:text-zinc-100"><p className="text-sm font-bold truncate">{f.name}</p><p className="text-[9px] text-zinc-500 font-mono uppercase">{f.is_dir ? 'Folder' : formatSize(f.size)}</p></div><ChevronRight className="w-3 h-3 text-zinc-300 dark:text-zinc-700" /></div></div>
                                            );
                                        }}
                                        </VirtualList>
                                    );
                                }}
                                </AutoSizer>
                            </div>
                        </div>
                    )}
                    {view === 'terminal' && (
                        <div className="flex-1 bg-[#080808] rounded-2xl border border-zinc-800 flex flex-col overflow-hidden shadow-2xl">
                            <div className="flex-1 p-6 font-mono text-[11px] overflow-auto custom-scrollbar text-zinc-400">{terminalOutput.map((l, i) => <p key={i} className={l.startsWith('>') ? "text-indigo-400" : ""}>{l}</p>)}</div>
                            <div className="p-4 bg-black/40 border-t border-white/5 flex items-center gap-3"><span className="text-indigo-500 font-bold">λ</span><input className="flex-1 bg-transparent border-none outline-none text-[11px] font-mono text-zinc-100" value={terminalInput} onChange={e => setTerminalInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && runCommand()} placeholder="..." /></div>
                        </div>
                    )}
                    {view === 'raw' && <RawDiskViewer />}
                    {view === 'settings' && (
                        <div className="p-10 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-3xl space-y-6 text-zinc-900 dark:text-zinc-100"><h3 className="text-xl font-black">Settings</h3><div className="flex items-center justify-between p-6 bg-white dark:bg-black/20 rounded-2xl border border-zinc-200 dark:border-white/5"><span className="font-bold">Dark Mode</span><button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs uppercase">{theme} Mode</button></div></div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
