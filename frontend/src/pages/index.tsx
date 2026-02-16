import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HardDrive, Folder, File as FileIcon, Shield, 
  ChevronRight, Activity, ArrowLeft, Save, 
  Clock, LayoutGrid, Search, MoreVertical,
  Download, AlertCircle, Copy, Move, Trash2,
  Image as ImageIcon, Video as VideoIcon,
  Star, Home, Terminal
} from 'lucide-react';
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/api/notification';
import { relaunch } from '@tauri-apps/api/process';
import { Toaster, toast } from 'sonner';
import { MediaViewer } from '../components/MediaViewer';

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
}

interface RecentFile {
  path: string;
  name: string;
  timestamp: number;
}

type ViewMode = 'dashboard' | 'explorer' | 'editor' | 'recent';

// --- Helpers ---

const getFileType = (name: string): 'image' | 'video' | 'text' | 'other' => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext || '')) return 'video';
  if (['txt', 'md', 'json', 'rs', 'js', 'ts', 'tsx', 'css', 'html', 'toml', 'yaml', 'yml'].includes(ext || '')) return 'text';
  return 'other';
};

// --- Components ---

export default function MasterBrowser() {
  const [view, setView] = useState<ViewMode>('dashboard');
  const [disks, setDisks] = useState<Disk[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  
  const [mediaView, setMediaView] = useState<{ path: string; type: 'image' | 'video' } | null>(null);
  const [clipboard, setClipboard] = useState<{ path: string; action: 'copy' | 'cut' } | null>(null);

  // --- Effects ---

  useEffect(() => {
    fetchDisks();
    checkForUpdates();
  }, []);

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

  const checkForUpdates = async () => {
    if (!isTauri) return;
    try {
      const { shouldUpdate, manifest } = await checkUpdate();
      if (shouldUpdate) {
        setUpdateAvailable(true);
        let permission = await isPermissionGranted();
        if (!permission) {
          permission = await requestPermission() === 'granted';
        }
        if (permission) {
          sendNotification({
            title: 'Update Available',
            body: `Master Browser ${manifest?.version} is ready to install.`,
          });
        }
      }
    } catch (error) {
      console.error('Update check failed:', error);
    }
  };

  const runUpdate = async () => {
    setUpdating(true);
    try {
      await installUpdate();
      await relaunch();
    } catch (error) {
      toast.error('Update installation failed');
      setUpdating(false);
    }
  };

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
    if (!isTauri) {
        setFiles([
            { name: 'Documents', path: path + '/Documents', is_dir: true, size: 0, last_modified: Math.floor(Date.now()/1000) },
            { name: 'config.json', path: path + '/config.json', is_dir: false, size: 1024, last_modified: Math.floor(Date.now()/1000) },
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

    if (!isTauri) {
        setEditingFile({ path: file.path, content: "// Browser mode mock content\nconsole.log('Hello World');" });
        setView('editor');
        return;
    }

    try {
      const content = await invoke<string>('read_file_content', { path: file.path });
      setEditingFile({ path: file.path, content });
      setView('editor');
    } catch (err) {
      toast.error('Failed to read file');
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

  const copyFile = (path: string) => {
    setClipboard({ path, action: 'copy' });
    toast.success('File path copied to clipboard');
  };

  const cutFile = (path: string) => {
    setClipboard({ path, action: 'cut' });
    toast.success('File marked for moving');
  };

  const pasteFile = async () => {
    if (!clipboard || !isTauri) return;
    const fileName = clipboard.path.split(/[/\\]/).pop();
    const dest = `${currentPath}/${fileName}`;

    try {
      if (clipboard.action === 'copy') {
        await invoke('copy_file', { src: clipboard.path, dest });
        toast.success('File copied successfully');
      } else {
        await invoke('move_file', { src: clipboard.path, dest });
        toast.success('File moved successfully');
        setClipboard(null);
      }
      fetchDirectory(currentPath);
    } catch (err) {
      toast.error('Paste operation failed');
    }
  };

  const deleteFile = async (path: string) => {
    if (!isTauri) return;
    if (!confirm('Are you sure you want to delete this?')) return;
    
    try {
      await invoke('delete_file', { path });
      toast.success('Deleted successfully');
      fetchDirectory(currentPath);
    } catch (err) {
      toast.error('Deletion failed');
    }
  };

  const navigateToDisk = (disk: Disk) => {
    setCurrentPath(disk.mount_point);
    setView('explorer');
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split(/[/\\]/).filter(Boolean);
    parts.pop();
    const newPath = '/' + parts.join('/');
    setCurrentPath(newPath);
  };

  // --- Helpers ---

  const filteredFiles = useMemo(() => {
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // --- Render Sections ---

  const renderDashboard = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {disks.map((disk, idx) => (
        <motion.div
          key={disk.mount_point}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.05 }}
          whileHover={{ y: -5, borderColor: 'rgba(99, 102, 241, 0.4)', boxShadow: '0 0 20px rgba(99, 102, 241, 0.1)' }}
          onClick={() => navigateToDisk(disk)}
          className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-xl flex flex-col gap-4 group cursor-pointer transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="p-3 bg-zinc-800 rounded-xl group-hover:bg-indigo-900/20 transition-colors">
              <HardDrive className="w-6 h-6 text-indigo-400 group-hover:text-indigo-300" />
            </div>
            {disk.is_removable && (
              <span className="text-[10px] font-bold uppercase tracking-widest bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded">Removable</span>
            )}
          </div>
          <div>
            <h3 className="font-bold text-lg group-hover:text-white transition-colors">{disk.name || 'Local Drive'}</h3>
            <p className="text-zinc-500 text-xs font-mono truncate">{disk.mount_point}</p>
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-[10px] font-mono text-zinc-500 mb-1">
              <span>{Math.round((disk.total_space - disk.available_space) / 1024 / 1024 / 1024)}GB USED</span>
              <span>{Math.round(disk.total_space / 1024 / 1024 / 1024)}GB TOTAL</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${((disk.total_space - disk.available_space) / disk.total_space) * 100}%` }}
                className="h-full bg-indigo-500 group-hover:bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all" 
              />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  const renderExplorer = () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 bg-zinc-900/50 p-2 rounded-xl border border-zinc-800 backdrop-blur-md">
        <button onClick={navigateUp} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 overflow-hidden">
           <div className="flex items-center gap-1 text-xs font-mono text-zinc-400 truncate">
             {currentPath.split(/[/\\]/).map((part, i, arr) => (
               <span key={i} className="flex items-center gap-1">
                 <span 
                    className={`cursor-pointer hover:text-indigo-400 transition-colors ${i === arr.length - 1 ? "text-zinc-100 font-bold" : ""}`}
                    onClick={() => setCurrentPath('/' + arr.slice(0, i + 1).join('/'))}
                 >
                   {part || '/'}
                 </span>
                 {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-700" />}
               </span>
             ))}
           </div>
        </div>
        <div className="flex items-center gap-2 px-3 border-l border-zinc-800">
          <Search className="w-4 h-4 text-zinc-600" />
          <input 
            type="text" 
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-xs focus:ring-0 w-32 outline-none text-zinc-300"
          />
        </div>
        {clipboard && (
          <button 
            onClick={pasteFile}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all"
          >
            Paste
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/20 overflow-hidden backdrop-blur-sm">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-zinc-800/50 text-zinc-500 text-[10px] uppercase tracking-widest font-bold">
              <th className="px-6 py-4 font-bold">Name</th>
              <th className="px-6 py-4 font-bold">Size</th>
              <th className="px-6 py-4 font-bold">Modified</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {filteredFiles.map((file) => {
              const type = getFileType(file.name);
              return (
                <tr 
                  key={file.path} 
                  onClick={() => file.is_dir ? setCurrentPath(file.path) : openFile(file)}
                  className="group hover:bg-zinc-800/40 cursor-pointer transition-colors border-b border-zinc-800/10 last:border-0"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {file.is_dir ? (
                        <Folder className="w-4 h-4 text-indigo-400" />
                      ) : type === 'image' ? (
                        <ImageIcon className="w-4 h-4 text-emerald-400" />
                      ) : type === 'video' ? (
                        <VideoIcon className="w-4 h-4 text-amber-400" />
                      ) : (
                        <FileIcon className="w-4 h-4 text-zinc-400" />
                      )}
                      <span className="font-medium truncate max-w-[300px] group-hover:text-white transition-colors">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-zinc-500 group-hover:text-zinc-400">
                    {file.is_dir ? '--' : formatSize(file.size)}
                  </td>
                  <td className="px-6 py-4 text-xs text-zinc-500 group-hover:text-zinc-400">
                    {new Date(file.last_modified * 1000).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); copyFile(file.path); }} className="p-1.5 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-500 hover:text-white" title="Copy">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); cutFile(file.path); }} className="p-1.5 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-500 hover:text-white" title="Move">
                        <Move className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteFile(file.path); }} className="p-1.5 hover:bg-red-900/30 rounded-lg transition-colors text-zinc-500 hover:text-red-400" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredFiles.length === 0 && (
          <div className="py-20 text-center text-zinc-600">
            <Folder className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No files found</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderEditor = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col h-[70vh] rounded-2xl border border-zinc-800 bg-[#0d0d0d] overflow-hidden shadow-2xl shadow-black/50"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/30 backdrop-blur-md">
        <div className="flex items-center gap-4">
           <button onClick={() => setView('explorer')} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
             <ArrowLeft className="w-4 h-4" />
           </button>
           <div className="flex flex-col">
             <span className="text-xs font-bold text-zinc-100">{editingFile?.path.split(/[/\\]/).pop()}</span>
             <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[400px]">{editingFile?.path}</span>
           </div>
        </div>
        <button 
          onClick={saveFile}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </div>
      <textarea
        value={editingFile?.content}
        onChange={(e) => setEditingFile(prev => prev ? { ...prev, content: e.target.value } : null)}
        className="flex-1 bg-transparent p-6 font-mono text-sm resize-none focus:ring-0 outline-none text-zinc-300 leading-relaxed selection:bg-indigo-500/30"
        spellCheck={false}
      />
    </motion.div>
  );

  const renderRecent = () => (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-400">
        <Clock className="w-5 h-5 text-indigo-400" /> Recent Files
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {recentFiles.map((file) => (
          <div 
            key={file.path}
            onClick={() => openFile(file)}
            className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-indigo-500/50 cursor-pointer group transition-all hover:bg-zinc-800/40"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-800 rounded-lg group-hover:bg-indigo-900/20 transition-colors">
                <FileIcon className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="font-bold text-sm truncate group-hover:text-white transition-colors">{file.name}</p>
                <p className="text-[10px] text-zinc-500 font-mono truncate">{file.path}</p>
              </div>
              <span className="text-[10px] text-zinc-600 font-mono whitespace-nowrap">
                {new Date(file.timestamp * 1000).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // --- Main Layout ---

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 flex selection:bg-indigo-500/30">
      <Toaster position="top-right" theme="dark" />
      
      <AnimatePresence>
        {mediaView && (
          <MediaViewer 
            path={mediaView.path} 
            type={mediaView.type} 
            onClose={() => setMediaView(null)} 
          />
        )}
      </AnimatePresence>

      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-zinc-800/50 bg-[#0d0d0d] flex flex-col p-6 gap-8 shrink-0">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => setView('dashboard')}
        >
          <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Master Browser</h1>
        </motion.div>

        <nav className="flex flex-col gap-1">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-3 mb-2">Main Menu</p>
          <button 
            onClick={() => setView('dashboard')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${view === 'dashboard' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            <Home className="w-4 h-4" /> Dashboard
          </button>
          <button 
            onClick={() => setView('explorer')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${view === 'explorer' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            <LayoutGrid className="w-4 h-4" /> Explorer
          </button>
          <button 
            onClick={() => setView('recent')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${view === 'recent' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
          >
            <Clock className="w-4 h-4" /> Recent
          </button>
        </nav>

        <nav className="flex flex-col gap-1">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-3 mb-2">Quick Nav</p>
          <button 
            onClick={() => { setCurrentPath('/home/pi/Desktop'); setView('explorer'); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 transition-all"
          >
            <Star className="w-4 h-4 text-amber-500/50" /> Desktop
          </button>
          <button 
            onClick={() => { setCurrentPath('/home/pi/Documents'); setView('explorer'); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 transition-all"
          >
            <Star className="w-4 h-4 text-amber-500/50" /> Documents
          </button>
          <button 
            onClick={() => { setCurrentPath('/'); setView('explorer'); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 transition-all"
          >
            <Terminal className="w-4 h-4 text-zinc-600" /> Root (/)
          </button>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="flex items-center justify-between px-8 py-6 border-b border-zinc-800/50 bg-[#0a0a0a]/50 backdrop-blur-md">
          <div className="flex items-center gap-4">
             {updateAvailable && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={runUpdate}
                  disabled={updating}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all"
                >
                  {updating ? (
                    <><Activity className="w-3 h-3 animate-spin" /> Updating...</>
                  ) : (
                    <><Download className="w-3 h-3" /> Update Ready</>
                  )}
                </motion.button>
              )}
          </div>
          
          <div className="flex items-center gap-4 text-xs font-mono text-zinc-500 bg-zinc-900/50 px-4 py-2 rounded-full border border-zinc-800">
            <Activity className={`w-3 h-3 ${loading ? 'text-amber-500 animate-spin' : 'text-emerald-500 animate-pulse'}`} />
            {loading ? 'BUSY' : 'READY'}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={view + currentPath}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {view === 'dashboard' && renderDashboard()}
              {view === 'explorer' && renderExplorer()}
              {view === 'editor' && renderEditor()}
              {view === 'recent' && renderRecent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1f1f1f;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #2f2f2f;
        }
      `}</style>
    </div>
  );
}
