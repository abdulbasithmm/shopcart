import React, { useState } from 'react';
import { Download, Smartphone, Share, PlusSquare, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'compact' | 'footer';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header', className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  if (isInstalled) {
    if (justInstalled) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full">
          <CheckCircle2 className="w-3.5 h-3.5" /> Installed
        </span>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) setJustInstalled(true);
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      // Direct user to browser install or show info
      setShowIOSModal(true);
    }
  };

  // If not installable and not iOS and not explicit banner, show a universal install helper button
  const label = isIOS ? 'Install App' : 'Get App';

  return (
    <>
      {variant === 'header' && (
        <button
          onClick={handleInstallClick}
          title="Install ShopCart App on your device"
          className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0b5c37] bg-emerald-50/90 hover:bg-emerald-100 hover:text-[#074728] border border-emerald-200/80 rounded-full transition-all duration-200 shadow-xs cursor-pointer ${className}`}
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
          <span className="font-semibold">{label}</span>
        </button>
      )}

      {variant === 'compact' && (
        <button
          onClick={handleInstallClick}
          className={`flex items-center justify-center gap-2 w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#0b5c37] hover:bg-[#074728] rounded-xl shadow-xs transition-colors cursor-pointer ${className}`}
        >
          <Download className="w-4 h-4" />
          <span>Install ShopCart App</span>
        </button>
      )}

      {variant === 'banner' && (
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-emerald-900 to-[#0b5c37] text-white rounded-2xl shadow-sm ${className}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">ShopCart App</p>
              <p className="text-sm font-semibold">Install our fast app for instant UPI checkout & tracking</p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
          >
            Install Free
          </button>
        </div>
      )}

      {variant === 'footer' && (
        <button
          onClick={handleInstallClick}
          className={`flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-[#0b5c37] transition-colors cursor-pointer ${className}`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install ShopCart Progressive Web App</span>
        </button>
      )}

      {/* Guided Install Modal for iOS & Desktop Fallback */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute right-4 top-4 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-[#0b5c37] flex items-center justify-center text-white shadow-md">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Install ShopCart</h3>
                <p className="text-xs text-slate-500">Fast, instant checkout without app store delays</p>
              </div>
            </div>

            {isIOS ? (
              <div className="space-y-3.5 text-xs text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex items-start gap-2.5">
                  <div className="p-1 rounded-md bg-white border border-slate-200 text-blue-600 shrink-0">
                    <Share className="w-4 h-4" />
                  </div>
                  <p>
                    1. Tap the <strong className="text-slate-900">Share</strong> button in the bottom Safari toolbar.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="p-1 rounded-md bg-white border border-slate-200 text-slate-700 shrink-0">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <p>
                    2. Scroll down and tap <strong className="text-slate-900">Add to Home Screen</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="p-1 rounded-md bg-white border border-slate-200 text-emerald-600 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <p>
                    3. Tap <strong className="text-slate-900">Add</strong> in top-right corner to launch ShopCart full-screen.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p>
                  To install <strong>ShopCart</strong> on your device:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Chrome / Android</strong>: Click the install icon in the address bar or open menu (⋮) → "Install App".</li>
                  <li><strong>Edge / Windows / Mac</strong>: Click the install button in the right side of the address bar.</li>
                  <li>Once installed, enjoy full-screen browsing and instant UPI access.</li>
                </ul>
              </div>
            )}

            <button
              onClick={() => setShowIOSModal(false)}
              className="mt-5 w-full py-2.5 text-xs font-bold text-white bg-[#0b5c37] hover:bg-[#074728] rounded-xl transition-colors shadow-sm"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </>
  );
};
