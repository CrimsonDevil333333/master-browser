import { convertFileSrc } from '@tauri-apps/api/tauri';
import { motion } from 'framer-motion';
import { X, Maximize2, Download, Music } from 'lucide-react';

interface MediaViewerProps {
  path: string;
  type: 'image' | 'video' | 'audio';
  onClose: () => void;
}

export function MediaViewer({ path, type, onClose }: MediaViewerProps) {
  const assetUrl = convertFileSrc(path);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-8"
      onClick={onClose}
    >
      <div className="absolute top-6 right-6 flex items-center gap-4">
        <button 
          onClick={(e) => { e.stopPropagation(); }}
          className="p-2 bg-zinc-800/50 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-all"
        >
          <Download className="w-5 h-5" />
        </button>
        <button 
          onClick={onClose}
          className="p-2 bg-zinc-800/50 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="max-w-full max-h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {type === 'image' ? (
          <img 
            src={assetUrl} 
            alt={path} 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl shadow-indigo-500/10"
          />
        ) : type === 'video' ? (
          <video 
            src={assetUrl} 
            controls 
            autoPlay 
            className="max-w-full max-h-full rounded-lg shadow-2xl shadow-indigo-500/10"
          />
        ) : (
          <div className="bg-zinc-900 border border-white/5 p-16 rounded-[4rem] flex flex-col items-center gap-8 shadow-2xl">
            <div className="p-8 bg-indigo-600 rounded-[2.5rem] shadow-xl shadow-indigo-600/20">
                <Music className="w-16 h-16 text-white" />
            </div>
            <div className="text-center">
                <p className="text-xl font-black tracking-tight">{path.split(/[/\\]/).pop()}</p>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-2">Neural Audio Stream</p>
            </div>
            <audio src={assetUrl} controls autoPlay className="w-80 h-12" />
          </div>
        )}
      </motion.div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-full text-[10px] font-mono text-zinc-500">
        {path}
      </div>
    </motion.div>
  );
}
