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
  Square, X, Filter, Code, Database, Table
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { MediaViewer } from '../components/MediaViewer';
import Editor from '@monaco-editor/react';
import ReactJson from 'react-json-view';
import Papa from 'papaparse';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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

type ViewMode = 'dashboard' | 'explorer' | 'editor' | 'recent' | 'viewer';
type ViewerType = 'json' | 'csv' | 'code' | 'image' | 'video';

// --- Helpers ---

const getFileType = (name: string): ViewerType | 'other' => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext || '')) return 'video';
  if (ext === 'json') return 'json';
  if (ext === 'csv') return 'csv';
  if (['txt', 'md', 'rs', 'js', 'ts', 'tsx', 'css', 'html', 'toml', 'yaml', 'yml', 'py', 'go', 'c', 'cpp', 'sh'].includes(ext || '')) return 'code';
  return 'other';
};

// --- Components ---

export default function MasterBrowser() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [view, setView] = useState<ViewMode>('dashboard');
  const [disks, setDisks] = useState<Disk[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [detailedFile, setDetailedFile] = useState<DetailedFileInfo | null>(null);
  
  const [editingFile, setEditingFile] = useState<{ path: string; content: string; type: ViewerType | 'other' } | null>(null);
  const [csvData, setCsvData] = useState<any[] | null>(null);
  
  const [mediaView, setMediaView] = useState<{ path: string; type: 'image' | 'video' } | null>(null);

  // --- Effects ---

  useEffect(() => {
    fetchDisks();
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (view === 'explorer' && currentPath) {
      fetchDirectory(currentPath);
    }
  }, [view, currentPath]);

  useEffect(() => {
    if (view === 'recent') {
      fetchRecentFiles();
    }
  }, [view]);

  // --- Actions ---

  const isTauri = useMemo(() => typeof window !== 'undefined' && (window as any).__TAURI_IPC__, []);

  const fetchDisks = async () => {
    setLoading(true);
    if (!isTauri) {
      setDisks([
        { name: 'Local Disk (C:)', mount_point: '/', fs_type: 'ext4', total_space: 512000000000, available_space: 128000000000, is_removable: false },
        { name: 'Data', mount_point: '/home/pi', fs_type: 'ext4', total_space: 100000000000, available_space: 45000000000, is_removable: true }
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

  const fetchDirectory = async (path: string) => {
    setLoading(true);
    setSelectedPaths([]);
    if (!isTauri) {
        setFiles([
            { name: 'Documents', path: path + '/Documents', is_dir: true, size: 0, last_modified: Math.floor(Date.now()/1000), permissions: 'rwxr-xr-x' },
            { name: 'data.json', path: path + '/data.json', is_dir: false, size: 1024, last_modified: Math.floor(Date.now()/1000), permissions: 'rw-r--r--' },
            { name: 'report.csv', path: path + '/report.csv', is_dir: false, size: 2048, last_modified: Math.floor(Date.now()/1000), permissions: 'rw-r--r--' },
        ]);
        setLoading(false);
        return;
    }
    try {
      const result = await invoke<FileMetadata[]>('list_directory', { path });
      setFiles(result);
    } catch (err) {
      toast.error('Failed to fetch directory');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentFiles = async () => {
    if (!isTauri) return;
    try {
      const result = await invoke<RecentFile[]>('get_recent_files');
      setRecentFiles(result);
    } catch (err) {
      console.error('Failed to fetch recent files:', err);
    }
  };

  const openFile = async (file: FileMetadata | RecentFile) => {
    const type = getFileType(file.name);
    
    if (isTauri) {
      await invoke('track_recent_file', { path: file.path });
    }

    if (type === 'image' || type === 'video') {
      setMediaView({ path: file.path, type: type as 'image' | 'video' });
      return;
    }

    try {
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

  const saveFile = async () => {
    if (!editingFile || !isTauri) return;
    
    if (editingFile.type === 'json') {
      try {
        JSON.parse(editingFile.content);
      } catch (e) {
        toast.error('Invalid JSON structure');
        return;
      }
    }

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

  const compressFolder = async (path: string) => {
    if (!isTauri) return;
    const name = path.split(/[/\\]/).pop() || 'archive';
    toast.promise(invoke('compress_folder', { path, outputName: name }), {
      loading: 'Compressing...',
      success: (p) => `Archive created: ${p}`,
      error: 'Compression failed'
    });
  };

  const showDetails = async (path: string) => {
    if (!isTauri) return;
    try {
      const details = await invoke<DetailedFileInfo>('get_file_details', { path });
      setDetailedFile(details);
    } catch (err) {
      toast.error('Failed to get file details');
    }
  };

  const toggleSelect = (path: string) => {
    setSelectedPaths(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split(/[/\\]/).filter(Boolean);
    parts.pop();
    const newPath = '/' + parts.join('/');
    setCurrentPath(newPath);
  };

  // --- Helpers ---

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredFiles = useMemo(() => {
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  // --- Render Sections ---

  const renderDashboard = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {disks.map((disk, idx) => (
        <motion.div
          key={disk.mount_point}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.05 }}
          whileHover={{ y: -5 }}
          onClick={() => { setCurrentPath(disk.mount_point); setView('explorer'); }}
          className="p-6 rounded-2xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 shadow-sm dark:backdrop-blur-xl flex flex-col gap-4 group cursor-pointer"
        >
          <div className="flex items-start justify-between">
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl group-hover:bg-indigo-500/10 transition-colors">
              <HardDrive className="w-6 h-6 text-zinc-600 dark:text-indigo-400 group-hover:text-indigo-500" />
            </div>
            {disk.is_removable && (
              <span className="text-[10px] font-bold uppercase tracking-widest bg-indigo-500/10 text-indigo-500 px-2 py-1 rounded">Removable</span>
            )}
          </div>
          <div>
            <h3 className="font-bold text-lg dark:group-hover:text-white transition-colors">{disk.name || 'Local Drive'}</h3>
            <p className="text-zinc-500 text-xs font-mono truncate">{disk.mount_point}</p>
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-[10px] font-mono text-zinc-500 mb-1">
              <span>{Math.round((disk.total_space - disk.available_space) / 1024 / 1024 / 1024)}GB USED</span>
              <span>{Math.round(disk.total_space / 1024 / 1024 / 1024)}GB TOTAL</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${((disk.total_space - disk.available_space) / disk.total_space) * 100}%` }}
                className="h-full bg-indigo-500" 
              />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  const renderExplorer = () => (
    <div className="flex flex-col gap-4">
      {/* Explorer Header */}
      <div className="flex items-center gap-4 bg-white/80 dark:bg-zinc-900/50 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 backdrop-blur-md sticky top-0 z-10">
        <button onClick={navigateUp} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-indigo-500">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 overflow-hidden flex items-center gap-2">
           <div className="flex items-center gap-1 text-xs font-mono text-zinc-500 truncate">
             {currentPath.split(/[/\\]/).map((part, i, arr) => (
               <span key={i} className="flex items-center gap-1">
                 <span 
                    className={cn("cursor-pointer hover:text-indigo-500 transition-colors", i === arr.length - 1 && "text-zinc-900 dark:text-zinc-100 font-bold")}
                    onClick={() => setCurrentPath('/' + arr.slice(0, i + 1).join('/'))}
                 >
                   {part || '/'}
                 </span>
                 {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-300 dark:text-zinc-700" />}
               </span>
             ))}
           </div>
        </div>
        
        <div className="flex items-center gap-3 px-3 border-l border-zinc-200 dark:border-zinc-800">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Filter files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-100 dark:bg-zinc-800/50 border-none text-xs rounded-xl pl-9 pr-4 py-2 outline-none w-48 focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
          
          {selectedPaths.length > 0 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
              <button onClick={deleteSelected} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all" title="Delete Selected">
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="h-4 w-px bg-zinc-800 mx-1" />
              <span className="text-[10px] font-bold text-zinc-500">{selectedPaths.length} SELECTED</span>
            </motion.div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1">
        {filteredFiles.map((file) => {
          const isSelected = selectedPaths.includes(file.path);
          const type = getFileType(file.name);
          return (
            <motion.div
              layout
              key={file.path}
              className={cn(
                "group flex items-center gap-4 px-6 py-3 rounded-2xl transition-all cursor-pointer border border-transparent",
                isSelected ? "bg-indigo-500/5 border-indigo-500/20" : "hover:bg-zinc-100 dark:hover:bg-zinc-900/40"
              )}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) toggleSelect(file.path);
                else file.is_dir ? setCurrentPath(file.path) : openFile(file);
              }}
            >
              <div 
                onClick={(e) => { e.stopPropagation(); toggleSelect(file.path); }}
                className={cn(
                  "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                  isSelected ? "bg-indigo-500 border-indigo-500 text-white" : "border-zinc-300 dark:border-zinc-700 opacity-0 group-hover:opacity-100"
                )}
              >
                {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
              </div>

              <div className="flex-1 flex items-center gap-4 min-w-0">
                <div className={cn(
                  "p-2.5 rounded-xl transition-colors",
                  file.is_dir ? "bg-indigo-500/10 text-indigo-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                )}>
                  {file.is_dir ? <Folder className="w-5 h-5" /> : 
                   type === 'image' ? <ImageIcon className="w-5 h-5 text-emerald-500" /> :
                   type === 'video' ? <VideoIcon className="w-5 h-5 text-amber-500" /> :
                   type === 'json' ? <Database className="w-5 h-5 text-purple-500" /> :
                   type === 'csv' ? <Table className="w-5 h-5 text-blue-500" /> :
                   <FileIcon className="w-5 h-5" />}
                </div>
                
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-sm truncate dark:text-zinc-200 group-hover:text-indigo-500 transition-colors">
                    {file.name}
                  </span>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
                    <span>{file.is_dir ? 'Folder' : formatSize(file.size)}</span>
                    <span>•</span>
                    <span>{file.permissions}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {file.is_dir && (
                  <button onClick={(e) => { e.stopPropagation(); compressFolder(file.path); }} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500" title="Zip">
                    <FileArchive className="w-4 h-4" />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); showDetails(file.path); }} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500" title="Info">
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );

  const renderEditor = () => (
    <div className="flex flex-col h-[calc(100vh-160px)] gap-4">
      <div className="flex items-center justify-between p-2 bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 pl-2">
           <button onClick={() => setView('explorer')} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors">
             <ArrowLeft className="w-4 h-4" />
           </button>
           <div className="flex flex-col">
             <span className="text-xs font-bold dark:text-zinc-200">{editingFile?.path.split(/[/\\]/).pop()}</span>
             <span className="text-[10px] font-mono text-zinc-500">{editingFile?.type?.toUpperCase()}</span>
           </div>
        </div>
        <div className="flex items-center gap-2 pr-2">
          {editingFile?.type === 'json' && (
             <button onClick={() => {
                try {
                  const obj = JSON.parse(editingFile.content);
                  setEditingFile({ ...editingFile, content: JSON.stringify(obj, null, 2) });
                  toast.success('JSON Formatted');
                } catch(e) { toast.error('Invalid JSON'); }
             }} className="px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-[10px] font-bold text-zinc-500 uppercase">Format</button>
          )}
          <button onClick={saveFile} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-500/20">
            <Save className="w-3.5 h-3.5" /> Save Changes
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-zinc-50 dark:bg-[#0d0d0d]">
        {editingFile?.type === 'json' ? (
          <div className="h-full overflow-auto p-6">
             <ReactJson 
               src={JSON.parse(editingFile.content || '{}')} 
               theme={theme === 'dark' ? 'monokai' : 'rghost'} 
               onEdit={(e) => {
                 if (typeof e.updated_src === 'object') {
                   setEditingFile({ ...editingFile, content: JSON.stringify(e.updated_src) });
                 }
               }}
               style={{ backgroundColor: 'transparent' }}
               displayDataTypes={false}
             />
          </div>
        ) : editingFile?.type === 'csv' && csvData ? (
          <div className="h-full overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800 z-10">
                <tr>
                  {Object.keys(csvData[0] || {}).map(key => (
                    <th key={key} className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 font-bold uppercase tracking-wider">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvData.map((row, i) => (
                  <tr key={i} className="hover:bg-zinc-100 dark:hover:bg-zinc-900/50">
                    {Object.values(row).map((val: any, j) => (
                      <td key={j} className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-mono">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Editor
            height="100%"
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            defaultLanguage={editingFile?.type === 'code' ? undefined : 'text'}
            path={editingFile?.path}
            value={editingFile?.content}
            onChange={(val) => setEditingFile(prev => prev ? { ...prev, content: val || '' } : null)}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'JetBrains Mono, monospace',
              padding: { top: 20 },
              smoothScrolling: true,
              cursorSmoothCaretAnimation: "on" as const
            }}
          />
        )}
      </div>
    </div>
  );

  // --- Main Layout ---

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300",
      theme === 'dark' ? "bg-[#0a0a0a] text-zinc-100" : "bg-zinc-50 text-zinc-900"
    )}>
      <Toaster position="top-right" theme={theme} />
      
      <AnimatePresence>
        {mediaView && <MediaViewer path={mediaView.path} type={mediaView.type} onClose={() => setMediaView(null)} />}
        {detailedFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
             <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
                <div className="flex justify-between items-start mb-6">
                  <h2 className="text-xl font-bold">Properties</h2>
                  <button onClick={() => setDetailedFile(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4">
                  {[
                    { label: 'Name', value: detailedFile.name },
                    { label: 'Location', value: detailedFile.path, mono: true },
                    { label: 'Size', value: formatSize(detailedFile.size) },
                    { label: 'Type', value: detailedFile.is_dir ? 'Folder' : 'File' },
                    { label: 'Created', value: new Date(detailedFile.created * 1000).toLocaleString() },
                    { label: 'Modified', value: new Date(detailedFile.modified * 1000).toLocaleString() },
                    { label: 'Permissions', value: detailedFile.permissions, mono: true },
                  ].map(item => (
                    <div key={item.label} className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{item.label}</span>
                      <span className={cn("text-sm", item.mono && "font-mono text-xs text-zinc-500 break-all")}>{item.value}</span>
                    </div>
                  ))}
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 border-r border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-[#0d0d0d] flex flex-col p-8 gap-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-600/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-black tracking-tight">Master</h1>
          </div>

          <nav className="flex flex-col gap-1.5">
            <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] px-4 mb-3">Navigation</p>
            {[
              { id: 'dashboard', icon: Home, label: 'Dashboard' },
              { id: 'explorer', icon: LayoutGrid, label: 'Explorer' },
              { id: 'recent', icon: Clock, label: 'Recent' }
            ].map(item => (
              <button 
                key={item.id}
                onClick={() => setView(item.id as ViewMode)}
                className={cn(
                  "flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all",
                  view === item.id ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "text-zinc-500 hover:text-indigo-500 hover:bg-indigo-500/5"
                )}
              >
                <item.icon className="w-5 h-5" /> {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto">
             <div className="p-6 rounded-3xl bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-bold dark:text-zinc-400">Appearance</span>
                  <span className="text-[10px] text-zinc-500 uppercase font-black">{theme} Mode</span>
                </div>
                {/* Theme Toggle Switch */}
                <button 
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="relative w-12 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 transition-colors p-1"
                >
                  <motion.div 
                    animate={{ x: theme === 'dark' ? 24 : 0 }}
                    className="w-4 h-4 rounded-full bg-white dark:bg-indigo-500 shadow-sm flex items-center justify-center"
                  >
                    {theme === 'dark' ? <Moon className="w-2.5 h-2.5" /> : <Sun className="w-2.5 h-2.5 text-zinc-400" />}
                  </motion.div>
                </button>
             </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col h-full min-w-0 bg-transparent">
          <header className="px-10 py-8 flex items-center justify-between">
            <div className="flex flex-col">
              <h2 className="text-2xl font-black capitalize tracking-tight">{view}</h2>
              <p className="text-xs text-zinc-500 font-medium">Control and manage your filesystem with ease.</p>
            </div>
            
            <div className="flex items-center gap-4 text-xs font-mono text-zinc-500 bg-white dark:bg-zinc-900/50 px-5 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <Activity className={cn("w-3.5 h-3.5", loading ? "text-amber-500 animate-spin" : "text-emerald-500")} />
              {loading ? 'BUSY' : 'READY'}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={view + currentPath}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              >
                {view === 'dashboard' && renderDashboard()}
                {view === 'explorer' && renderExplorer()}
                {view === 'editor' && renderEditor()}
                {view === 'recent' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {recentFiles.map(file => (
                      <div key={file.path} onClick={() => openFile(file)} className="p-4 rounded-2xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 transition-all cursor-pointer group flex items-center gap-4">
                        <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl group-hover:bg-indigo-500/10 transition-colors">
                          <FileIcon className="w-5 h-5 text-zinc-400 group-hover:text-indigo-500" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-sm truncate">{file.name}</p>
                          <p className="text-[10px] text-zinc-500 truncate font-mono">{file.path}</p>
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
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: ${theme === 'dark' ? '#27272a' : '#e4e4e7'}; 
          border-radius: 10px; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { 
          background: ${theme === 'dark' ? '#3f3f46' : '#d4d4d8'}; 
        }
      `}</style>
    </div>
  );
}
