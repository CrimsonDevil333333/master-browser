import { useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardDrive,
  Folder,
  File as FileIcon,
  Shield,
  ChevronRight,
  Activity,
  ArrowLeft,
  Save,
  LayoutGrid,
  Search,
  Copy,
  Trash2,
  Home,
  Terminal,
  X,
  Database,
  Play,
  Scissors,
  Clipboard,
  Music,
  FilePlus2,
  FolderPlus,
  Pencil,
  Ban,
  Keyboard,
  Clock3,
  Star,
  Globe,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { RawDiskViewer } from '../components/RawDiskViewer';
import Editor from '@monaco-editor/react';

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

interface SystemStats {
  cpu_usage: number;
  ram_used: number;
  ram_total: number;
  net_upload: number;
  net_download: number;
}

interface RecentFile {
  path: string;
  name: string;
  timestamp: number;
}

type ViewMode = 'dashboard' | 'explorer' | 'terminal' | 'raw' | 'editor' | 'chronology' | 'anchors' | 'nexus';
type ViewerType = 'image' | 'video' | 'audio' | 'code' | 'markdown' | 'other';

const cn = (...inputs: any[]) => inputs.filter(Boolean).join(' ');

export default function MasterBrowser() {
  const [view, setView] = useState<ViewMode>('dashboard');
  const [disks, setDisks] = useState<Disk[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [pathInput, setPathInput] = useState<string>('');
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setStats] = useState<SystemStats | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<{ paths: string[]; type: 'copy' | 'move' } | null>(null);
  const [activeFile, setActiveFile] = useState<{ path: string; content: string; originalContent: string; type: ViewerType } | null>(null);
  const [mediaOverlay, setMediaOverlay] = useState<{ path: string; type: 'image' | 'video' | 'audio' } | null>(null);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['Sovereign Shell v0.2.19 connected.']);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [terminalRequestId, setTerminalRequestId] = useState<string | null>(null);
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [terminalHistoryIndex, setTerminalHistoryIndex] = useState<number>(-1);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path?: string } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [anchors, setAnchors] = useState<string[]>([]);
  const [networkNodes, setNetworkNodes] = useState<string[]>([]);
  const [networkLoading, setNetworkLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.style.backgroundColor = '#050505';
  }, []);

  const isTauri = useMemo(() => typeof window !== 'undefined' && (window as any).__TAURI_IPC__, []);

  const fetchDisks = async () => {
    if (!isTauri) return;
    try {
      const res = await invoke<Disk[]>('list_disks');
      setDisks(res);
      if (!currentPath && res.length > 0) {
        setCurrentPath(res[0].mount_point);
        setPathInput(res[0].mount_point);
      }
    } catch {
      toast.error('Sync Error');
    }
  };

  const fetchDirectory = async (path: string) => {
    if (!path) return;
    setLoading(true);
    try {
      const result = await invoke<FileMetadata[]>('list_directory', { path });
      setFiles(result);
      setSelectedPaths([]);
    } catch {
      toast.error('Access Denied');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!isTauri) return;
    try {
      setStats(await invoke<SystemStats>('get_system_stats'));
    } catch {}
  };

  const fetchRecentFiles = async () => {
    if (!isTauri) return;
    try {
      const res = await invoke<RecentFile[]>('get_recent_files');
      setRecentFiles(res);
    } catch {}
  };

  const scanNetwork = async () => {
    if (!isTauri) return;
    setNetworkLoading(true);
    try {
      const res = await invoke<string[]>('scan_local_network');
      setNetworkNodes(res);
    } catch {
      toast.error('Network scan failed');
    } finally {
      setNetworkLoading(false);
    }
  };

  useEffect(() => {
    fetchDisks();
    fetchRecentFiles();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('master-browser-anchors');
    if (stored) {
      try { setAnchors(JSON.parse(stored)); } catch {}
    }
  }, []);

  useEffect(() => {
    const t = setInterval(fetchStats, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (view === 'explorer' && currentPath) {
      fetchDirectory(currentPath);
      setPathInput(currentPath);
    }
    if (view === 'chronology') {
      fetchRecentFiles();
    }
    if (view === 'nexus') {
      scanNetwork();
    }
  }, [view, currentPath]);

  const editorDirty = !!activeFile && activeFile.content !== activeFile.originalContent;

  const guardedSetView = (nextView: ViewMode) => {
    if (view === 'editor' && editorDirty) {
      const proceed = confirm('You have unsaved changes. Leave editor anyway?');
      if (!proceed) return;
    }
    setView(nextView);
  };

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (view === 'editor' && editorDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [view, editorDirty]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (view === 'editor' && activeFile) {
          e.preventDefault();
          void saveFile();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      if ((e.key === '?' && !e.ctrlKey && !e.metaKey) || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }

      if (e.key === 'Escape') {
        setContextMenu(null);
        setShortcutsOpen(false);
      }
    };

    const onClickAway = () => setContextMenu(null);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onClickAway);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onClickAway);
    };
  }, [view, activeFile]);

  const navigateUp = () => {
    if (!currentPath || currentPath === '/' || currentPath.match(/^[A-Z]:\\$/i)) return;
    const parts = currentPath.split(/[/\\]/).filter(Boolean);
    let parent = currentPath.includes(':\\') ? `${parts.slice(0, -1).join('\\')}\\` : `/${parts.slice(0, -1).join('/')}`;
    if (parent === '' || parent === '\\') parent = currentPath.includes(':\\') ? `${parts[0]}:\\` : '/';
    setCurrentPath(parent);
  };

  const handlePathSubmit = (e: any) => {
    e.preventDefault();
    if (pathInput.trim()) setCurrentPath(pathInput.trim());
  };

  const getFileType = (name: string): ViewerType => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    if (['md', 'markdown'].includes(ext)) return 'markdown';
    if (['txt', 'rs', 'js', 'ts', 'tsx', 'css', 'html', 'json', 'py', 'sh', 'toml', 'yaml', 'yml'].includes(ext)) return 'code';
    return 'other';
  };

  const openFile = async (file: FileMetadata) => {
    const type = getFileType(file.name);
    if (['image', 'video', 'audio'].includes(type)) {
      setMediaOverlay({ path: file.path, type: type as any });
      return;
    }
    setLoading(true);
    try {
      const content = await invoke<string>('read_file_content', { path: file.path });
      setActiveFile({ path: file.path, content, originalContent: content, type });
      await invoke('track_recent_file', { path: file.path });
      setView('editor');
    } catch {
      toast.error('Binary or protected file');
    } finally {
      setLoading(false);
    }
  };

  const saveFile = async () => {
    if (!activeFile) return;
    try {
      await invoke('write_file_content', { path: activeFile.path, content: activeFile.content });
      setActiveFile((prev) => (prev ? { ...prev, originalContent: prev.content } : null));
      toast.success('File saved');
    } catch {
      toast.error('Write Access Denied');
    }
  };

  const handleAction = async (action: 'copy' | 'move' | 'delete' | 'paste') => {
    if (action === 'delete') {
      if (!selectedPaths.length) return;
      if (!confirm(`Delete ${selectedPaths.length} items?`)) return;
      try {
        await invoke('delete_files', { paths: selectedPaths });
        toast.success('Deleted');
        fetchDirectory(currentPath);
      } catch {
        toast.error('Delete failed');
      }
    } else if (action === 'copy' || action === 'move') {
      if (!selectedPaths.length) return;
      setClipboard({ paths: [...selectedPaths], type: action });
      toast.info(`Staged for ${action}`);
    } else if (action === 'paste') {
      if (!clipboard) return;
      try {
        if (clipboard.type === 'copy') await invoke('copy_files', { srcs: clipboard.paths, dest_dir: currentPath });
        else {
          await invoke('move_files', { srcs: clipboard.paths, dest_dir: currentPath });
          setClipboard(null);
        }
        toast.success('Pasted');
        fetchDirectory(currentPath);
      } catch {
        toast.error('Paste failed');
      }
    }
  };

  const joinCurrentPath = (name: string) => {
    const separator = currentPath.includes('\\') ? '\\' : '/';
    return `${currentPath}${currentPath.endsWith('/') || currentPath.endsWith('\\') ? '' : separator}${name}`;
  };

  const createNewFile = async () => {
    const name = prompt('New file name');
    if (!name) return;
    const path = joinCurrentPath(name);
    try {
      await invoke('create_file', { path });
      toast.success('File created');
      fetchDirectory(currentPath);
    } catch {
      toast.error('Create file failed');
    }
  };

  const createNewFolder = async () => {
    const name = prompt('New folder name');
    if (!name) return;
    const path = joinCurrentPath(name);
    try {
      await invoke('create_folder', { path });
      toast.success('Folder created');
      fetchDirectory(currentPath);
    } catch {
      toast.error('Create folder failed');
    }
  };

  const renameSinglePath = async (sourcePath?: string) => {
    const targetPath = sourcePath || (selectedPaths.length === 1 ? selectedPaths[0] : undefined);
    if (!targetPath) {
      toast.info('Select exactly one item to rename');
      return;
    }
    const currentName = targetPath.split(/[/\\]/).pop() || '';
    const nextName = prompt('Rename to', currentName);
    if (!nextName || nextName === currentName) return;
    const base = targetPath.slice(0, targetPath.length - currentName.length);
    const newPath = `${base}${nextName}`;

    try {
      await invoke('rename_path', { oldPath: targetPath, newPath });
      toast.success('Renamed');
      fetchDirectory(currentPath);
    } catch {
      toast.error('Rename failed');
    }
  };

  const saveAnchors = (next: string[]) => {
    setAnchors(next);
    localStorage.setItem('master-browser-anchors', JSON.stringify(next));
  };

  const addAnchor = () => {
    if (!currentPath) return;
    if (anchors.includes(currentPath)) {
      toast.info('Already pinned');
      return;
    }
    saveAnchors([currentPath, ...anchors].slice(0, 100));
    toast.success('Pinned to Anchors');
  };

  const removeAnchor = (path: string) => {
    saveAnchors(anchors.filter((a) => a !== path));
  };

  const cancelTerminalCommand = async () => {
    if (!terminalRequestId || !terminalRunning) return;
    try {
      await invoke('cancel_terminal_command', { requestId: terminalRequestId });
      setTerminalOutput((p) => [...p.slice(0, -1), '⛔ command canceled']);
    } catch {
      toast.error('Cancel failed');
    } finally {
      setTerminalRunning(false);
      setTerminalRequestId(null);
    }
  };

  const runCommand = async () => {
    if (!terminalInput.trim() || terminalRunning) return;

    const cmd = terminalInput;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setTerminalInput('');
    setTerminalRunning(true);
    setTerminalRequestId(requestId);
    setTerminalHistory((prev) => {
      if (prev[0] === cmd) return prev;
      return [cmd, ...prev].slice(0, 200);
    });
    setTerminalHistoryIndex(-1);
    setTerminalOutput((p) => [...p, `> ${cmd}`, '⏳ running...']);

    try {
      const res = await invoke<string>('run_terminal_command', { command: cmd, dir: currentPath || '.', requestId });
      setTerminalOutput((p) => [...p.slice(0, -1), res || '(no output)']);
    } catch (e) {
      setTerminalOutput((p) => [...p.slice(0, -1), `Error: ${e}`]);
    } finally {
      setTerminalRunning(false);
      setTerminalRequestId(null);
    }
  };

  const handleTerminalInputKeyDown = (e: any) => {
    if (e.key === 'Enter') {
      void runCommand();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!terminalHistory.length) return;
      const nextIndex = Math.min(terminalHistoryIndex + 1, terminalHistory.length - 1);
      setTerminalHistoryIndex(nextIndex);
      setTerminalInput(terminalHistory[nextIndex] || '');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!terminalHistory.length) return;
      const nextIndex = terminalHistoryIndex - 1;
      if (nextIndex < 0) {
        setTerminalHistoryIndex(-1);
        setTerminalInput('');
      } else {
        setTerminalHistoryIndex(nextIndex);
        setTerminalInput(terminalHistory[nextIndex] || '');
      }
    }
  };

  const filteredFiles = files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleFileRowClick = (e: any, file: FileMetadata, index: number) => {
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangePaths = filteredFiles.slice(start, end + 1).map((x) => x.path);
      setSelectedPaths((prev) => Array.from(new Set([...prev, ...rangePaths])));
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths((prev) => (prev.includes(file.path) ? prev.filter((x) => x !== file.path) : [...prev, file.path]));
      setLastSelectedIndex(index);
      return;
    }

    setSelectedPaths([file.path]);
    setLastSelectedIndex(index);
  };

  const formatSize = (b: number) => {
    if (b === 0) return '0 B';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${(b / Math.pow(1024, i)).toFixed(2)} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`;
  };

  const renderDashboard = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {disks.map((disk) => (
        <div
          key={disk.mount_point}
          onClick={() => {
            setCurrentPath(disk.mount_point);
            guardedSetView('explorer');
          }}
          className="p-10 rounded-[3rem] bg-zinc-900/40 border border-zinc-800 shadow-xl hover:border-indigo-500 cursor-pointer transition-all relative overflow-hidden group text-zinc-100"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-125 transition-transform">
            <HardDrive className="w-32 h-32" />
          </div>
          <div className="relative z-10 space-y-8">
            <div className="p-4 bg-indigo-600 rounded-2xl text-white w-fit shadow-lg">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{disk.fs_type}</p>
              <h3 className="text-xl font-black truncate">{disk.name || disk.mount_point}</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                <span>{formatSize(disk.available_space)} Free</span>
                <span>{Math.round((1 - disk.available_space / disk.total_space) * 100)}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600" style={{ width: `${(1 - disk.available_space / disk.total_space) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen w-screen bg-[#050505] text-white">
      <Toaster position="top-right" richColors theme="dark" />
      <AnimatePresence>
        {mediaOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-20 bg-black/90 backdrop-blur-xl"
          >
            <button onClick={() => setMediaOverlay(null)} className="absolute top-10 right-10 p-4 bg-white/10 hover:bg-white/20 rounded-full text-white">
              <X />
            </button>
            <div className="max-w-6xl max-h-full">
              {mediaOverlay.type === 'image' && <img src={convertFileSrc(mediaOverlay.path)} className="max-w-full max-h-[80vh] rounded-3xl shadow-2xl" />}
              {mediaOverlay.type === 'video' && (
                <video src={convertFileSrc(mediaOverlay.path)} controls autoPlay className="max-w-full max-h-[80vh] rounded-3xl" />
              )}
              {mediaOverlay.type === 'audio' && (
                <div className="bg-zinc-900 p-12 rounded-[3rem] border border-white/10 flex flex-col items-center gap-8">
                  <Music className="w-24 h-24 text-indigo-500" />
                  <audio src={convertFileSrc(mediaOverlay.path)} controls autoPlay />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <aside className="w-72 border-r border-zinc-800 flex flex-col p-8 shrink-0 bg-[#080808] z-50 relative">
        <div className="flex items-center gap-4 mb-12">
          <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-black text-zinc-100">MASTER</h1>
        </div>

        <nav className="flex-1 space-y-2">
          {[
            { id: 'dashboard', icon: Home, label: 'Dashboard' },
            { id: 'explorer', icon: LayoutGrid, label: 'Explorer' },
            { id: 'chronology', icon: Clock3, label: 'Chronology' },
            { id: 'anchors', icon: Star, label: 'Anchors' },
            { id: 'raw', icon: Database, label: 'Raw Probe' },
            { id: 'nexus', icon: Globe, label: 'Nexus Scan' },
            { id: 'terminal', icon: Terminal, label: 'Terminal' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => guardedSetView(item.id as ViewMode)}
              className={cn(
                'flex items-center gap-4 w-full px-5 py-3.5 rounded-xl text-sm font-bold transition-all',
                view === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:bg-white/5',
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#050505]">
        <header className="h-24 px-12 border-b border-zinc-900 flex items-center justify-between z-40 bg-[#050505]">
          <h2 className="text-3xl font-black capitalize tracking-tighter text-zinc-100">{view}</h2>
          <div className="flex items-center gap-6">
            <div className="relative text-white">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl pl-11 pr-4 py-2.5 text-xs font-bold outline-none w-64"
              />
            </div>
            <button
              onClick={() => setShortcutsOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-300 border border-zinc-700 hover:bg-zinc-900 text-[10px] font-black uppercase"
              title="Show keyboard shortcuts"
            >
              <Keyboard className="w-3 h-3" /> Shortcuts
            </button>
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-lg text-emerald-400 text-[10px] font-black uppercase border border-emerald-500/20">
              <Activity className="w-3 h-3" /> Live
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 p-12 overflow-y-auto custom-scrollbar relative z-30">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full min-h-0 flex-1 flex flex-col"
            >
              {view === 'explorer' && (
                <div className="space-y-8">
                  <form onSubmit={handlePathSubmit} className="flex items-center gap-4 bg-zinc-900/50 p-4 rounded-3xl border border-zinc-800 shadow-sm text-zinc-100">
                    <button type="button" onClick={navigateUp} className="p-2.5 hover:bg-zinc-800 rounded-xl text-zinc-500 transition-all">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <input className="flex-1 bg-transparent border-none outline-none font-mono text-sm font-black" value={pathInput} onChange={(e) => setPathInput(e.target.value)} />
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={createNewFile} className="p-2 text-zinc-400 hover:text-emerald-500" title="New file">
                        <FilePlus2 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={createNewFolder} className="p-2 text-zinc-400 hover:text-emerald-500" title="New folder">
                        <FolderPlus className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => void renameSinglePath()} className="p-2 text-zinc-400 hover:text-indigo-500" title="Rename">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleAction('copy')} className="p-2 text-zinc-400 hover:text-indigo-500" title="Copy">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleAction('move')} className="p-2 text-zinc-400 hover:text-indigo-500" title="Move">
                        <Scissors className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleAction('paste')} className={cn('p-2', clipboard ? 'text-amber-500' : 'text-zinc-400')} title="Paste">
                        <Clipboard className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={addAnchor} className="p-2 text-zinc-400 hover:text-amber-400" title="Pin current path">
                        <Star className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleAction('delete')} className="p-2 text-zinc-400 hover:text-red-500" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </form>

                  {loading && <p className="text-xs text-zinc-400">Loading…</p>}

                  <div
                    className="grid grid-cols-1 gap-2"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY });
                    }}
                  >
                    {filteredFiles.map((f, index) => (
                        <div
                          key={f.path}
                          onClick={(e) => handleFileRowClick(e, f, index)}
                          onDoubleClick={() => (f.is_dir ? setCurrentPath(f.path) : openFile(f))}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (!selectedPaths.includes(f.path)) setSelectedPaths([f.path]);
                            setContextMenu({ x: e.clientX, y: e.clientY, path: f.path });
                          }}
                          className={cn(
                            'flex items-center gap-5 p-5 rounded-[2rem] border transition-all cursor-pointer shadow-sm group',
                            selectedPaths.includes(f.path)
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'bg-zinc-900/40 border-zinc-800 hover:border-indigo-500/50',
                          )}
                        >
                          <div className={cn('p-3 rounded-2xl transition-all', f.is_dir ? 'text-indigo-600 bg-indigo-500/10' : 'text-zinc-400 bg-zinc-800')}>
                            {f.is_dir ? <Folder className="w-5 h-5 fill-current" /> : <FileIcon className="w-5 h-5" />}
                          </div>
                          <div className="flex-1 min-w-0 text-zinc-100">
                            <p className="text-sm font-black truncate">{f.name}</p>
                            <p className="text-[10px] opacity-60 font-mono uppercase">{f.is_dir ? 'Directory' : formatSize(f.size)}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-700" />
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {view === 'chronology' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">Recent Activity</h3>
                    <button className="px-3 py-2 text-xs rounded-lg border border-zinc-700 hover:bg-zinc-900" onClick={fetchRecentFiles}>Refresh</button>
                  </div>
                  <div className="space-y-2">
                    {recentFiles.length === 0 && <p className="text-xs text-zinc-500">No recent files yet.</p>}
                    {recentFiles.map((item) => (
                      <button key={item.path} onClick={() => { setCurrentPath(item.path.split(/[/\\]/).slice(0, -1).join(item.path.includes('\\') ? '\\' : '/') || '/'); guardedSetView('explorer'); }} className="w-full text-left p-4 rounded-2xl border border-zinc-800 hover:border-indigo-500/40 bg-zinc-900/40">
                        <p className="text-sm font-bold truncate">{item.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono truncate">{item.path}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {view === 'anchors' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">Pinned Paths</h3>
                    <button className="px-3 py-2 text-xs rounded-lg border border-zinc-700 hover:bg-zinc-900" onClick={addAnchor}>Pin Current Path</button>
                  </div>
                  <div className="space-y-2">
                    {anchors.length === 0 && <p className="text-xs text-zinc-500">No anchors yet. Open Explorer and pin current path.</p>}
                    {anchors.map((path) => (
                      <div key={path} className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-3">
                        <button className="text-left flex-1" onClick={() => { setCurrentPath(path); guardedSetView('explorer'); }}>
                          <p className="text-xs font-mono truncate text-indigo-300">{path}</p>
                        </button>
                        <button className="text-[10px] px-2 py-1 rounded-lg border border-zinc-700 hover:bg-zinc-800" onClick={() => removeAnchor(path)}>Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {view === 'nexus' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 rounded-3xl bg-indigo-600/20 border border-indigo-500/30">
                    <div>
                      <h3 className="text-xl font-black">Nexus Probe</h3>
                      <p className="text-xs text-zinc-300">Live local-network neighbor discovery (no mock values)</p>
                    </div>
                    <button className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-black" onClick={scanNetwork} disabled={networkLoading}>{networkLoading ? 'Scanning…' : 'Execute Scan'}</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {networkNodes.length === 0 && !networkLoading && <p className="text-xs text-zinc-500">No neighbors discovered yet.</p>}
                    {networkNodes.map((node) => (
                      <div key={node} className="p-6 rounded-3xl border border-zinc-800 bg-zinc-900/40">
                        <p className="text-lg font-black">{node.split(' ')[0]}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{node.replace(node.split(' ')[0], '').trim() || 'reachable host'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {view === 'terminal' && (
                <div className="flex-1 bg-[#080808] rounded-[2.5rem] border border-zinc-800 flex flex-col overflow-hidden shadow-2xl min-h-[500px]">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-950/40 text-zinc-400">
                    <div className="flex items-center gap-4">
                      <Terminal className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-black uppercase tracking-widest">Sovereign Shell</span>
                    </div>
                    <span className="text-[10px] font-mono opacity-40">{currentPath}</span>
                  </div>
                  <div className="flex-1 p-10 font-mono text-[11px] overflow-auto custom-scrollbar text-zinc-400 space-y-1">
                    {terminalOutput.map((l, i) => (
                      <p key={i} className={cn('whitespace-pre-wrap leading-relaxed', l.startsWith('>') ? 'text-indigo-400 font-black mt-4' : '')}>
                        {l}
                      </p>
                    ))}
                  </div>
                  <div className="p-5 bg-zinc-950/60 border-t border-white/5 flex items-center gap-4">
                    <span className="text-indigo-500 font-black ml-2">λ</span>
                    <input
                      autoFocus
                      className="flex-1 bg-transparent border-none outline-none text-[11px] font-mono text-zinc-100 disabled:opacity-50"
                      value={terminalInput}
                      onChange={(e) => setTerminalInput(e.target.value)}
                      onKeyDown={handleTerminalInputKeyDown}
                      placeholder={terminalRunning ? 'Command running…' : 'Command...'}
                      disabled={terminalRunning}
                    />
                    <button
                      onClick={runCommand}
                      disabled={terminalRunning}
                      className="p-3 bg-indigo-600 rounded-xl hover:bg-indigo-500 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Run"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      onClick={cancelTerminalCommand}
                      disabled={!terminalRunning}
                      className="p-3 bg-red-600/80 rounded-xl hover:bg-red-500 text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Cancel running command"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {view === 'editor' && activeFile && (
                <div className="h-full min-h-0 flex flex-col gap-6">
                  <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-[2.5rem] border border-zinc-800 shadow-sm text-zinc-100">
                    <div className="flex items-center gap-6">
                      <button onClick={() => guardedSetView('explorer')} className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-zinc-100">
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase">Editor {editorDirty ? '• UNSAVED' : '• SAVED'}</p>
                        <p className="text-xs font-mono font-black text-indigo-400">{activeFile.path}</p>
                      </div>
                    </div>
                    <button onClick={saveFile} className="flex items-center gap-3 px-10 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-xs text-white shadow-xl shadow-indigo-600/20">
                      <Save className="w-4 h-4" /> COMMIT CHANGES
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 bg-[#0d0d0d] rounded-[3rem] border border-zinc-800 overflow-hidden shadow-2xl">
                    <Editor
                      height="100%"
                      theme="vs-dark"
                      defaultLanguage={activeFile.type === 'code' ? undefined : activeFile.type === 'markdown' ? 'markdown' : 'text'}
                      value={activeFile.content}
                      onChange={(val) => setActiveFile((p) => (p ? { ...p, content: val || '' } : null))}
                      options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: 'JetBrains Mono', padding: { top: 40, bottom: 40 } }}
                    />
                  </div>
                </div>
              )}

              {view === 'dashboard' && renderDashboard()}
              {view === 'raw' && <RawDiskViewer onOpenPath={(path) => { setCurrentPath(path); guardedSetView('explorer'); }} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {shortcutsOpen && (
        <div className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShortcutsOpen(false)}>
          <div className="w-full max-w-2xl rounded-3xl border border-zinc-700 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black">Keyboard Shortcuts</h3>
              <button className="p-2 rounded-lg hover:bg-zinc-800" onClick={() => setShortcutsOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-800/70 border border-zinc-700"><b>Ctrl/Cmd + K</b><br />Focus search</div>
              <div className="p-3 rounded-xl bg-zinc-800/70 border border-zinc-700"><b>Ctrl/Cmd + S</b><br />Save active file</div>
              <div className="p-3 rounded-xl bg-zinc-800/70 border border-zinc-700"><b>?</b> or <b>Ctrl/Cmd + /</b><br />Toggle shortcuts panel</div>
              <div className="p-3 rounded-xl bg-zinc-800/70 border border-zinc-700"><b>Esc</b><br />Close menus/panels</div>
              <div className="p-3 rounded-xl bg-zinc-800/70 border border-zinc-700"><b>Explorer: Ctrl/Cmd + Click</b><br />Toggle multi-select</div>
              <div className="p-3 rounded-xl bg-zinc-800/70 border border-zinc-700"><b>Explorer: Shift + Click</b><br />Range select</div>
              <div className="p-3 rounded-xl bg-zinc-800/70 border border-zinc-700"><b>Terminal: Arrow Up/Down</b><br />Command history</div>
              <div className="p-3 rounded-xl bg-zinc-800/70 border border-zinc-700"><b>Terminal: Enter</b><br />Run command</div>
            </div>
          </div>
        </div>
      )}

      {contextMenu && view === 'explorer' && (
        <div
          className="fixed z-[120] w-56 rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl p-2"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.path && (
            <>
              <button className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 rounded-lg" onClick={() => {
                const target = files.find((f) => f.path === contextMenu.path);
                if (target) {
                  target.is_dir ? setCurrentPath(target.path) : void openFile(target);
                }
                setContextMenu(null);
              }}>Open</button>
              <button className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 rounded-lg" onClick={() => { void renameSinglePath(contextMenu.path); setContextMenu(null); }}>Rename</button>
              <button className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 rounded-lg" onClick={() => { setClipboard({ paths: [contextMenu.path!], type: 'copy' }); setContextMenu(null); }}>Copy</button>
              <button className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 rounded-lg" onClick={() => { setClipboard({ paths: [contextMenu.path!], type: 'move' }); setContextMenu(null); }}>Move</button>
              <button className="w-full text-left px-3 py-2 text-xs hover:bg-red-900/40 text-red-300 rounded-lg" onClick={() => { setSelectedPaths([contextMenu.path!]); void handleAction('delete'); setContextMenu(null); }}>Delete</button>
              <div className="my-2 border-t border-zinc-700" />
            </>
          )}
          <button className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 rounded-lg" onClick={() => { void createNewFile(); setContextMenu(null); }}>New File</button>
          <button className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 rounded-lg" onClick={() => { void createNewFolder(); setContextMenu(null); }}>New Folder</button>
          <button className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 rounded-lg" onClick={() => { void handleAction('paste'); setContextMenu(null); }}>Paste</button>
        </div>
      )}
    </div>
  );
}
