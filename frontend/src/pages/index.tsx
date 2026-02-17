import { useEffect, useMemo, useState } from 'react';
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

type ViewMode = 'dashboard' | 'explorer' | 'terminal' | 'raw' | 'editor';
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
  const [activeFile, setActiveFile] = useState<{ path: string; content: string; type: ViewerType } | null>(null);
  const [mediaOverlay, setMediaOverlay] = useState<{ path: string; type: 'image' | 'video' | 'audio' } | null>(null);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>(['Sovereign Shell v0.2.19 connected.']);
  const [terminalRunning, setTerminalRunning] = useState(false);

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

  useEffect(() => {
    fetchDisks();
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
  }, [view, currentPath]);

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
      setActiveFile({ path: file.path, content, type });
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

  const runCommand = async () => {
    if (!terminalInput.trim() || terminalRunning) return;

    const cmd = terminalInput;
    setTerminalInput('');
    setTerminalRunning(true);
    setTerminalOutput((p) => [...p, `> ${cmd}`, '⏳ running...']);

    try {
      const res = await invoke<string>('run_terminal_command', { command: cmd, dir: currentPath || '.' });
      setTerminalOutput((p) => [...p.slice(0, -1), res || '(no output)']);
    } catch (e) {
      setTerminalOutput((p) => [...p.slice(0, -1), `Error: ${e}`]);
    } finally {
      setTerminalRunning(false);
    }
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
            setView('explorer');
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
            { id: 'raw', icon: Database, label: 'Raw Probe' },
            { id: 'terminal', icon: Terminal, label: 'Terminal' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id as ViewMode)}
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
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl pl-11 pr-4 py-2.5 text-xs font-bold outline-none w-64"
              />
            </div>
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
                      <button type="button" onClick={() => handleAction('copy')} className="p-2 text-zinc-400 hover:text-indigo-500">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleAction('move')} className="p-2 text-zinc-400 hover:text-indigo-500">
                        <Scissors className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleAction('paste')} className={cn('p-2', clipboard ? 'text-amber-500' : 'text-zinc-400')}>
                        <Clipboard className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleAction('delete')} className="p-2 text-zinc-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </form>

                  {loading && <p className="text-xs text-zinc-400">Loading…</p>}

                  <div className="grid grid-cols-1 gap-2">
                    {files
                      .filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((f) => (
                        <div
                          key={f.path}
                          onClick={(e) => {
                            if (e.ctrlKey) {
                              setSelectedPaths((p) => (p.includes(f.path) ? p.filter((x) => x !== f.path) : [...p, f.path]));
                            } else {
                              f.is_dir ? setCurrentPath(f.path) : openFile(f);
                            }
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
                      onKeyDown={(e) => e.key === 'Enter' && runCommand()}
                      placeholder={terminalRunning ? 'Command running…' : 'Command...'}
                      disabled={terminalRunning}
                    />
                    <button
                      onClick={runCommand}
                      disabled={terminalRunning}
                      className="p-3 bg-indigo-600 rounded-xl hover:bg-indigo-500 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {view === 'editor' && activeFile && (
                <div className="h-full min-h-0 flex flex-col gap-6">
                  <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-[2.5rem] border border-zinc-800 shadow-sm text-zinc-100">
                    <div className="flex items-center gap-6">
                      <button onClick={() => setView('explorer')} className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-zinc-100">
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase">Editor</p>
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
              {view === 'raw' && <RawDiskViewer />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
