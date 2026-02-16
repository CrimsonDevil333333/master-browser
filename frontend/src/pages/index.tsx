import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, Folder, File, Shield, ChevronRight, Activity } from 'lucide-react';

interface Disk {
  name: string;
  mount_point: string;
  fs_type: string;
  total_space: number;
  available_space: number;
  is_removable: boolean;
}

export default function Dashboard() {
  const [disks, setDisks] = useState<Disk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDisks = async () => {
      try {
        const result = await invoke<Disk[]>('list_disks');
        setDisks(result);
      } catch (err) {
        console.error('Failed to fetch disks:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDisks();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 p-8 font-sans selection:bg-indigo-500/30">
      <header className="flex items-center justify-between mb-12">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Master Browser</h1>
        </motion.div>
        
        <div className="flex items-center gap-4 text-xs font-mono text-zinc-500 bg-zinc-900/50 px-4 py-2 rounded-full border border-zinc-800">
          <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
          SYSTEM_STABLE: USER_SPACE_MODE
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <AnimatePresence>
            {disks.map((disk, idx) => (
              <motion.div
                key={disk.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ y: -5, borderColor: 'rgba(99, 102, 241, 0.4)' }}
                className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-xl flex flex-col gap-4 group cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="p-3 bg-zinc-800 rounded-xl group-hover:bg-indigo-900/20 transition-colors">
                    <HardDrive className="w-6 h-6 text-indigo-400" />
                  </div>
                  {disk.is_removable && (
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded">Removable</span>
                  )}
                </div>
                
                <div>
                  <h3 className="font-bold text-lg">{disk.name || 'Unnamed Drive'}</h3>
                  <p className="text-zinc-500 text-sm font-mono">{disk.mount_point}</p>
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
                      transition={{ duration: 1, delay: 0.5 }}
                      className="h-full bg-indigo-500" 
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
                  <span className="text-xs font-mono text-zinc-400 uppercase">{disk.fs_type}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && [1,2,3].map(i => (
            <div key={i} className="h-48 rounded-2xl bg-zinc-900/20 border border-zinc-800/20 animate-pulse" />
          ))}
        </motion.div>
      </main>

      <footer className="fixed bottom-8 left-1/2 -translate-x-1/2">
        <div className="flex gap-2 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 p-1 rounded-xl shadow-2xl">
          <button className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-bold flex items-center gap-2">
            <Folder className="w-4 h-4" /> Explorer
          </button>
          <button className="px-4 py-2 hover:bg-zinc-800 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <File className="w-4 h-4" /> Recent
          </button>
        </div>
      </footer>
    </div>
  );
}
