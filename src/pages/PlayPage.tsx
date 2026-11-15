import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Heart,
  Share2,
  ShoppingBag,
  ChevronUp,
  ChevronDown,
  Eye,
  Maximize2,
  Video,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { PageView, Product, VideoItem } from '../types';
import { fetchDemoVideos, toggleVideoLike, getEmbeddableVideoInfo } from '../services/videoService';
import { fetchProducts } from '../services/productService';
import { ProductImage } from '../components/common/ProductImage';
import { ShareModal } from '../components/common/ShareModal';
import { formatPrice } from '../utils/format';
import { buildVideoShareUrl, triggerNativeShare, SharePayload } from '../utils/share';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

interface PlayPageProps {
  onNavigate: (page: PageView, params?: { productId?: string }) => void;
}

export const PlayPage: React.FC<PlayPageProps> = ({ onNavigate }) => {
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    Promise.all([fetchDemoVideos(), fetchProducts().catch(() => ({ products: [] }))])
      .then(([vidRes, prodRes]) => {
        if (!mounted) return;
        const loadedVideos = vidRes.videos || [];
        setVideos(loadedVideos);
        if (prodRes?.products) {
          setProducts(prodRes.products);
        }

        // Support deep linking via ?video=<id>
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const targetVideoId = urlParams.get('video');
          if (targetVideoId && loadedVideos.length > 0) {
            const foundIndex = loadedVideos.findIndex((v) => v.id === targetVideoId);
            if (foundIndex >= 0) {
              setActiveIndex(foundIndex);
            }
          }
        } catch {
          // Ignore URL parse issues
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const currentVideo = videos[activeIndex] || null;

  const embedInfo = useMemo(() => {
    if (!currentVideo) return null;
    return getEmbeddableVideoInfo(currentVideo.videoUrl);
  }, [currentVideo]);

  const linkedProduct = useMemo(() => {
    if (!currentVideo) return null;
    if (currentVideo.product) return currentVideo.product;
    if (currentVideo.productId) {
      return products.find((p) => p.id === currentVideo.productId) || null;
    }
    return null;
  }, [currentVideo, products]);

  // Reset playback state when switching videos
  useEffect(() => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [activeIndex, currentVideo?.id]);

  const handleTogglePlay = async () => {
    if (!videoRef.current) return;
    try {
      if (videoRef.current.paused) {
        await videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } catch {
      setIsPlaying(false);
    }
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (videoRef.current) {
      videoRef.current.muted = next;
    }
  };

  const handleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen().catch(() => {});
    }
  };

  const handleToggleLike = async (video: VideoItem) => {
    if (!isAuthenticated) {
      showToast(t.videos.signInToLike, 'info');
      onNavigate('login');
      return;
    }
    if (likingId === video.id) return;

    setLikingId(video.id);
    try {
      const res = await toggleVideoLike(video.id);
      if (res.requiresAuth) {
        showToast(t.videos.signInToLike, 'info');
        onNavigate('login');
        return;
      }
      if (!res.success) {
        showToast(res.error || 'Could not update like.', 'error');
        return;
      }
      setVideos((prev) =>
        prev.map((v) =>
          v.id === video.id
            ? {
                ...v,
                userHasLiked: Boolean(res.liked),
                likesCount: Number(res.likesCount ?? v.likesCount),
              }
            : v
        )
      );
    } finally {
      setLikingId(null);
    }
  };

  const handleShareVideo = async (video: VideoItem) => {
    const payload: SharePayload = {
      title: video.title,
      text: video.description || t.videos.pageSubtitle,
      url: buildVideoShareUrl(video.id),
    };
    const outcome = await triggerNativeShare(payload);
    if (outcome === 'fallback') {
      setSharePayload(payload);
    } else if (outcome === 'shared') {
      showToast(t.share.linkCopied, 'success');
    }
  };

  const handleAddToCart = () => {
    if (!linkedProduct) return;
    addToCart(linkedProduct, 1);
    showToast(`${linkedProduct.name}`, 'success');
  };

  const nextVideo = () => {
    if (videos.length === 0) return;
    setActiveIndex((prev) => (prev + 1) % videos.length);
  };

  const prevVideo = () => {
    if (videos.length === 0) return;
    setActiveIndex((prev) => (prev - 1 + videos.length) % videos.length);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20 md:pb-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              <Video className="w-3.5 h-3.5" />
              <span>ShopCart Play</span>
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-0.5">{t.videos.pageTitle}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t.videos.pageSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('shop')}
            className="self-start sm:self-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>{t.common.exploreCatalog}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {isLoading ? (
          <div className="min-h-[420px] flex flex-col items-center justify-center gap-3 bg-slate-900/70 rounded-3xl border border-slate-800">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
            <span className="text-xs text-slate-400">{t.common.loading}</span>
          </div>
        ) : !currentVideo ? (
          <div className="min-h-[420px] flex flex-col items-center justify-center text-center p-8 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Video className="w-8 h-8" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h2 className="text-lg font-bold text-white">{t.videos.emptyTitle}</h2>
              <p className="text-xs text-slate-400 leading-relaxed">{t.videos.emptySubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('shop')}
              className="px-5 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-2"
            >
              <span>{t.common.exploreCatalog}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Primary Player Stage */}
            <div className="lg:col-span-7 flex flex-col items-center">
              <div className="relative w-full max-w-md h-[620px] sm:h-[680px] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col justify-between">
                {/* Video Element / Embed */}
                <div className="absolute inset-0 bg-black flex items-center justify-center">
                  {embedInfo?.type === 'direct' ? (
                    <video
                      ref={videoRef}
                      src={embedInfo.src}
                      poster={currentVideo.thumbnailUrl || undefined}
                      controls
                      playsInline
                      muted={isMuted}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      className="w-full h-full object-contain bg-black"
                    />
                  ) : embedInfo ? (
                    <iframe
                      src={embedInfo.src}
                      title={currentVideo.title}
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : null}
                </div>

                {/* Top Controls Overlay */}
                <div className="relative z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/75 via-black/30 to-transparent pointer-events-none">
                  <div className="pointer-events-auto flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider bg-[#0b5c37] text-white px-2.5 py-1 rounded-lg">
                      ShopCart Demo
                    </span>
                    <span className="text-[11px] text-slate-300 font-mono">
                      {activeIndex + 1} / {videos.length}
                    </span>
                  </div>

                  {embedInfo?.type === 'direct' && (
                    <div className="pointer-events-auto flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleToggleMute}
                        aria-label={isMuted ? t.videos.unmute : t.videos.mute}
                        className="w-9 h-9 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer"
                      >
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleTogglePlay}
                        aria-label={isPlaying ? t.videos.pauseVideo : t.videos.playVideo}
                        className="w-9 h-9 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer"
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleFullscreen}
                        aria-label={t.videos.fullscreen}
                        className="w-9 h-9 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Floating Right Action Rail */}
                <div className="absolute right-3.5 bottom-44 z-20 flex flex-col items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(currentVideo)}
                    disabled={likingId === currentVideo.id}
                    aria-label={currentVideo.userHasLiked ? t.videos.liked : t.videos.like}
                    className="flex flex-col items-center gap-1 group cursor-pointer"
                  >
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                        currentVideo.userHasLiked
                          ? 'bg-rose-600 text-white border-rose-400 shadow-lg'
                          : 'bg-black/55 text-white border-white/25 hover:bg-black/75'
                      }`}
                    >
                      <Heart className={`w-5 h-5 ${currentVideo.userHasLiked ? 'fill-current' : ''}`} />
                    </div>
                    <span className="text-[11px] font-bold text-white tabular-nums">
                      {currentVideo.likesCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleShareVideo(currentVideo)}
                    aria-label={t.videos.shareVideo}
                    className="flex flex-col items-center gap-1 group cursor-pointer"
                  >
                    <div className="w-11 h-11 rounded-full bg-black/55 hover:bg-black/75 border border-white/25 flex items-center justify-center backdrop-blur-md transition-colors text-white">
                      <Share2 className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-200">{t.common.share}</span>
                  </button>

                  {videos.length > 1 && (
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-white/15">
                      <button
                        type="button"
                        onClick={prevVideo}
                        aria-label="Previous video"
                        className="w-9 h-9 rounded-full bg-black/55 hover:bg-black/80 border border-white/20 flex items-center justify-center text-white cursor-pointer"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={nextVideo}
                        aria-label="Next video"
                        className="w-9 h-9 rounded-full bg-black/55 hover:bg-black/80 border border-white/20 flex items-center justify-center text-white cursor-pointer"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Bottom Caption & Linked Product Card */}
                <div className="relative z-10 p-4 space-y-3 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none">
                  <div className="pr-14 pointer-events-auto">
                    <h2 className="text-sm font-bold text-white leading-snug line-clamp-2">
                      {currentVideo.title}
                    </h2>
                    {currentVideo.description && (
                      <p className="text-xs text-slate-300 line-clamp-2 mt-1 leading-relaxed">
                        {currentVideo.description}
                      </p>
                    )}
                  </div>

                  {linkedProduct && (
                    <div className="pointer-events-auto p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 flex items-center justify-between gap-3">
                      <div
                        onClick={() => onNavigate('product', { productId: linkedProduct.id })}
                        className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"
                      >
                        <div className="w-11 h-11 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                          <ProductImage
                            product={linkedProduct}
                            size="sm"
                            showBadge={false}
                            className="max-h-full max-w-full"
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-mono text-emerald-300 tracking-wider block">
                            {t.videos.featuredProduct}
                          </span>
                          <h4 className="text-xs font-bold text-white truncate">{linkedProduct.name}</h4>
                          <span className="text-xs font-black text-amber-400">
                            {formatPrice(linkedProduct.price)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleAddToCart}
                          className="px-3 py-2 bg-[#0b5c37] hover:bg-[#08482b] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>{t.videos.addToCart}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigate('product', { productId: linkedProduct.id })}
                          className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors cursor-pointer"
                          title={t.videos.viewProduct}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Playlist / Video Selector Rail */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">{t.videos.pageTitle}</h3>
                <span className="text-xs text-slate-400 font-mono">{videos.length}</span>
              </div>

              <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
                {videos.map((vid, idx) => {
                  const isActive = idx === activeIndex;
                  return (
                    <div
                      key={vid.id}
                      onClick={() => setActiveIndex(idx)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                        isActive
                          ? 'bg-emerald-950/60 border-[#0b5c37] ring-1 ring-emerald-500/40'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="w-20 h-14 rounded-xl bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative">
                        {vid.thumbnailUrl ? (
                          <img
                            src={vid.thumbnailUrl}
                            alt={vid.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Video className="w-5 h-5 text-slate-500" />
                        )}
                        <span className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <Play className="w-4 h-4 text-white fill-white/80" />
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-white line-clamp-1">{vid.title}</h4>
                        {vid.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{vid.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-300">
                          <span className="inline-flex items-center gap-1">
                            <Heart className={`w-3 h-3 ${vid.userHasLiked ? 'fill-rose-500 text-rose-500' : 'text-slate-400'}`} />
                            <span>{vid.likesCount}</span>
                          </span>
                          {vid.product?.name && (
                            <span className="text-emerald-400 truncate max-w-[140px]">
                              {vid.product.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <ShareModal payload={sharePayload} onClose={() => setSharePayload(null)} />
    </div>
  );
};
