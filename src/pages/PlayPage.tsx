import React, { useState } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Heart,
  Share2,
  ShoppingBag,
  Sparkles,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { PageView } from '../types';
import { PRODUCTS } from '../data/mockData';
import { formatPrice } from '../utils/format';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';

interface PlayPageProps {
  onNavigate: (page: PageView, params?: { productId?: string }) => void;
}

interface VideoReel {
  id: string;
  productId: string;
  creatorName: string;
  creatorAvatar: string;
  title: string;
  description: string;
  likes: number;
  views: string;
  videoPlaceholderBg: string;
  badge: string;
}

const REELS: VideoReel[] = [
  {
    id: 'reel-1',
    productId: 'deal-prod-1',
    creatorName: 'TechUnboxed Pro',
    creatorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    title: 'boAt Airdopes 141 Pro: 45hr Battery Beast Test! 🎧',
    description: 'Testing the 65ms ultra-low latency BEAST mode with battle royale gaming. Unbelievable bass for this price!',
    likes: 1420,
    views: '45.2K',
    videoPlaceholderBg: 'from-slate-900 via-indigo-950 to-slate-900',
    badge: 'Trending Reel',
  },
  {
    id: 'reel-2',
    productId: 'deal-prod-2',
    creatorName: 'Style & Gadgets',
    creatorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
    title: 'Fire-Boltt Phoenix Ultra: AMOLED Display Outdoor Test ☀️',
    description: 'Looking at how bright this 1.43" AMOLED screen actually gets in direct sunlight. Metallic casing feels super premium!',
    likes: 2180,
    views: '68.9K',
    videoPlaceholderBg: 'from-slate-900 via-blue-950 to-slate-900',
    badge: 'Deal of the Day',
  },
  {
    id: 'reel-3',
    productId: 'eko-prod-1',
    creatorName: 'Audioholic Studio',
    creatorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
    title: 'Aura Pro Studio Wireless: Active Noise Cancellation Deep Dive 🔊',
    description: 'Does it block out street noise and cafe chatter? Here is a direct microphone pass-through recording.',
    likes: 3840,
    views: '112K',
    videoPlaceholderBg: 'from-slate-900 via-emerald-950 to-slate-900',
    badge: 'Editor Choice',
  },
  {
    id: 'reel-4',
    productId: 'eko-prod-7',
    creatorName: 'Home Cinema Daily',
    creatorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
    title: 'SoundCore Pulse 360: Living Room Bass Vibration Test ⚡',
    description: 'Dual passive radiators in action. Water droplets jumping to the 60Hz frequency bass hit!',
    likes: 950,
    views: '29.4K',
    videoPlaceholderBg: 'from-slate-900 via-rose-950 to-slate-900',
    badge: 'High Fidelity',
  },
];

export const PlayPage: React.FC<PlayPageProps> = ({ onNavigate }) => {
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [likedReels, setLikedReels] = useState<Record<string, boolean>>({});
  const { addToCart } = useCart();
  const { showToast } = useToast();

  const currentReel = REELS[activeReelIndex];
  const associatedProduct = PRODUCTS.find((p) => p.id === currentReel.productId) || PRODUCTS[0];
  const isLiked = !!likedReels[currentReel.id];

  const handleToggleLike = () => {
    setLikedReels((prev) => ({
      ...prev,
      [currentReel.id]: !prev[currentReel.id],
    }));
  };

  const handleAddToCart = () => {
    addToCart(associatedProduct);
    showToast(`Added ${associatedProduct.name} to cart!`, 'success');
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      showToast('Reel link copied to clipboard!', 'success');
    }
  };

  const nextReel = () => {
    setActiveReelIndex((prev) => (prev + 1) % REELS.length);
  };

  const prevReel = () => {
    setActiveReelIndex((prev) => (prev - 1 + REELS.length) % REELS.length);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-0 sm:p-4 pb-20 md:pb-6">
      {/* Reel Container */}
      <div className="relative w-full max-w-md h-[calc(100vh-6rem)] sm:h-[750px] bg-slate-900 sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between border border-slate-800">
        
        {/* Animated Background Simulation */}
        <div
          className={`absolute inset-0 bg-gradient-to-b ${currentReel.videoPlaceholderBg} transition-all duration-700`}
        >
          {/* Subtle animated particles & glow */}
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-400 via-transparent to-transparent animate-pulse" />
          
          {/* Product Hero Backdrop Image */}
          <div className="absolute inset-0 flex items-center justify-center p-12 opacity-35">
            <img
              src={associatedProduct.image || associatedProduct.images?.[0]}
              alt={associatedProduct.name}
              className="max-h-[70%] max-w-[70%] object-contain filter drop-shadow-[0_20px_30px_rgba(0,0,0,0.8)]"
            />
          </div>
        </div>

        {/* Top Header Controls */}
        <div className="relative z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            <span className="text-xs font-black tracking-wider uppercase bg-rose-600/90 text-white px-2.5 py-0.5 rounded-full shadow-xs">
              Live Showcase
            </span>
            <span className="text-xs text-slate-300 font-mono">
              {currentReel.views} watching
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-colors cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Floating Right Interaction Sidebar */}
        <div className="absolute right-3.5 bottom-36 z-20 flex flex-col items-center gap-4">
          {/* Like */}
          <button
            onClick={handleToggleLike}
            className="flex flex-col items-center gap-1 group cursor-pointer"
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                isLiked
                  ? 'bg-rose-500/90 text-white border-rose-400 scale-110 shadow-lg shadow-rose-500/30'
                  : 'bg-black/40 text-white border-white/20 group-hover:bg-black/60'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
            </div>
            <span className="text-[10px] font-bold text-slate-200">
              {currentReel.likes + (isLiked ? 1 : 0)}
            </span>
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="flex flex-col items-center gap-1 group cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-black/40 hover:bg-black/60 border border-white/20 flex items-center justify-center backdrop-blur-md transition-colors text-white">
              <Share2 className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold text-slate-200">Share</span>
          </button>

          {/* Up & Down Navigation */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
            <button
              onClick={prevReel}
              disabled={activeReelIndex === 0}
              className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-30 border border-white/20 flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer text-white"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <button
              onClick={nextReel}
              disabled={activeReelIndex === REELS.length - 1}
              className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-30 border border-white/20 flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer text-white"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Bottom Content & Attached Product Card */}
        <div className="relative z-10 p-4 space-y-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
          {/* Creator Profile */}
          <div className="flex items-center gap-2.5">
            <img
              src={currentReel.creatorAvatar}
              alt={currentReel.creatorName}
              className="w-9 h-9 rounded-full object-cover border-2 border-[#2874f0]"
            />
            <div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-white">{currentReel.creatorName}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 fill-blue-400/20" />
              </div>
              <span className="text-[10px] text-slate-300 font-mono">{currentReel.badge}</span>
            </div>
          </div>

          {/* Caption */}
          <div>
            <h2 className="text-sm font-bold text-white leading-tight line-clamp-1">
              {currentReel.title}
            </h2>
            <p className="text-xs text-slate-300 line-clamp-2 mt-1 leading-relaxed">
              {currentReel.description}
            </p>
          </div>

          {/* Attached Product Action Card */}
          <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 flex items-center justify-between gap-3 shadow-lg">
            <div
              onClick={() => onNavigate('product', { productId: associatedProduct.id })}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"
            >
              <div className="w-11 h-11 rounded-xl bg-white p-1 flex items-center justify-center shrink-0">
                <img
                  src={associatedProduct.image || associatedProduct.images?.[0]}
                  alt={associatedProduct.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-mono text-blue-300 tracking-wider block">
                  Featured Product
                </span>
                <h4 className="text-xs font-bold text-white truncate">
                  {associatedProduct.name}
                </h4>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs font-black text-amber-400">
                    {formatPrice(associatedProduct.price)}
                  </span>
                  {associatedProduct.originalPrice > associatedProduct.price && (
                    <span className="text-[10px] text-slate-400 line-through">
                      {formatPrice(associatedProduct.originalPrice)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleAddToCart}
                className="px-3 py-2 bg-[#2874f0] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md transition-colors cursor-pointer flex items-center gap-1"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
              <button
                onClick={() => onNavigate('product', { productId: associatedProduct.id })}
                className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors cursor-pointer"
                title="View Full Product Page"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
