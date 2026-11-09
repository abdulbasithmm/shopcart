import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-slate-900/95 text-white px-3.5 py-2 text-xs font-semibold shadow-xl border border-amber-500/30 backdrop-blur-xs animate-in slide-in-from-bottom-3 duration-200">
      <div className="p-1 rounded-md bg-amber-500/20 text-amber-400">
        <WifiOff className="w-3.5 h-3.5" />
      </div>
      <div>
        <p className="leading-tight">Offline Mode</p>
        <p className="text-[10px] text-slate-300 font-normal">Browsing saved catalog data</p>
      </div>
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-1" />
    </div>
  );
};
