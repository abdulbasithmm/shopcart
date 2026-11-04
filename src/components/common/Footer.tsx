import React, { useState } from 'react';
import {
  Globe,
  Lock,
  ShieldCheck,
  Truck,
  RotateCcw,
  Headphones,
  Check,
  ChevronUp,
} from 'lucide-react';
import { PageView } from '../../types';
import { useToast } from '../../context/ToastContext';
import { AmazonLogo } from './AmazonLogo';

interface FooterProps {
  onNavigate: (page: PageView, params?: { category?: string }) => void;
  onOpenSupabaseModal?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenSupabaseModal }) => {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      showToast('Please enter a valid email address', 'error');
      return;
    }
    setSubscribed(true);
    showToast('Subscribed! Welcome to Shop Cart updates.', 'success');
    setEmail('');
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="mt-16 text-white font-sans">
      {/* Back to top button */}
      <button
        onClick={scrollToTop}
        className="w-full py-3.5 bg-[#37475a] hover:bg-[#485769] text-center text-xs text-white font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        aria-label="Back to top"
      >
        <ChevronUp className="w-4 h-4 text-slate-300" />
        <span>Back to top</span>
      </button>

      {/* Main Multi-Column Links Section */}
      <div className="bg-[#232f3e] border-b border-[#3a4553] text-[#ddd]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-xs leading-relaxed">
            {/* Column 1 */}
            <div>
              <h4 className="font-bold text-white text-sm mb-3">Get to Know Us</h4>
              <ul className="space-y-2 text-[#ccc]">
                <li>
                  <button
                    onClick={() => onNavigate('home')}
                    className="hover:underline transition-colors text-left"
                  >
                    About Shop Cart
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('shop')}
                    className="hover:underline transition-colors text-left"
                  >
                    Careers
                  </button>
                </li>
                <li>
                  <span className="hover:underline cursor-pointer">Press Releases</span>
                </li>
                <li>
                  <span className="hover:underline cursor-pointer">Shop Cart Innovation</span>
                </li>
                <li className="pt-2">
                  <button
                    onClick={() => onNavigate('admin-login')}
                    className="text-[#38bdf8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Staff & Admin Portal</span>
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 2 */}
            <div>
              <h4 className="font-bold text-white text-sm mb-3">Connect with Us</h4>
              <ul className="space-y-2 text-[#ccc]">
                <li><span className="hover:underline cursor-pointer">Facebook</span></li>
                <li><span className="hover:underline cursor-pointer">Twitter / X</span></li>
                <li><span className="hover:underline cursor-pointer">Instagram</span></li>
                <li className="pt-2">
                  <span className="text-[11px] text-slate-400">Newsletter:</span>
                  {subscribed ? (
                    <div className="flex items-center gap-1 text-[#22c55e] text-[11px] font-medium mt-1">
                      <Check className="w-3.5 h-3.5" /> Subscribed
                    </div>
                  ) : (
                    <form onSubmit={handleSubscribe} className="flex gap-1 mt-1">
                      <input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-2 py-1 bg-white text-slate-900 rounded text-xs focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-[#0b5c37] hover:bg-[#08482b] text-white rounded text-xs font-bold shrink-0 transition-colors"
                      >
                        Join
                      </button>
                    </form>
                  )}
                </li>
              </ul>
            </div>

            {/* Column 3 */}
            <div>
              <h4 className="font-bold text-white text-sm mb-3">Make Money with Us</h4>
              <ul className="space-y-2 text-[#ccc]">
                <li><span className="hover:underline cursor-pointer">Sell on Shop Cart</span></li>
                <li><span className="hover:underline cursor-pointer">Sell under Shop Cart Accelerator</span></li>
                <li><span className="hover:underline cursor-pointer">Protect and Build Your Brand</span></li>
                <li><span className="hover:underline cursor-pointer">Shop Cart Global Selling</span></li>
                <li><span className="hover:underline cursor-pointer">Become an Affiliate</span></li>
                <li><span className="hover:underline cursor-pointer">Fulfilment by Shop Cart</span></li>
              </ul>
            </div>

            {/* Column 4 */}
            <div>
              <h4 className="font-bold text-white text-sm mb-3">Let Us Help You</h4>
              <ul className="space-y-2 text-[#ccc]">
                <li>
                  <button
                    onClick={() => onNavigate('account')}
                    className="hover:underline transition-colors text-left"
                  >
                    Your Account
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('account')}
                    className="hover:underline transition-colors text-left"
                  >
                    Returns Centre
                  </button>
                </li>
                <li>
                  <span className="hover:underline cursor-pointer">100% Purchase Protection</span>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('contact')}
                    className="hover:underline transition-colors text-left"
                  >
                    Help & Customer Service
                  </button>
                </li>
                <li className="pt-2">
                  <button
                    onClick={() => onOpenSupabaseModal?.()}
                    className="text-[#38bdf8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>⚡ Supabase Database Setup</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Amazon Logo & Country/Language row */}
          <div className="mt-10 pt-8 border-t border-[#3a4553] flex flex-wrap items-center justify-center gap-6 text-xs text-[#ccc]">
            <div
              onClick={() => onNavigate('home')}
              className="cursor-pointer"
              title="Go to Home"
            >
              <AmazonLogo variant="light" className="h-7 w-auto" />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-[#848688] rounded text-xs text-white hover:border-white transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>English</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-[#848688] rounded text-xs text-white hover:border-white transition-colors"
              >
                <span>🇮🇳</span>
                <span>India</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-footer Directory (Deep Charcoal #131a22) */}
      <div className="bg-[#131a22] text-[#999] py-8 text-[11px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8 text-[#aaa]">
            <div>
              <p className="font-bold text-white hover:underline cursor-pointer">AbeBooks</p>
              <p className="text-[#888]">Books, art & collectibles</p>
            </div>
            <div>
              <p className="font-bold text-white hover:underline cursor-pointer">Shop Cart Cloud</p>
              <p className="text-[#888]">Scalable Cloud Computing Services</p>
            </div>
            <div>
              <p className="font-bold text-white hover:underline cursor-pointer">Audible</p>
              <p className="text-[#888]">Download Audio Books</p>
            </div>
            <div>
              <p className="font-bold text-white hover:underline cursor-pointer">IMDb</p>
              <p className="text-[#888]">Movies, TV & Celebrities</p>
            </div>
            <div>
              <p className="font-bold text-white hover:underline cursor-pointer">Shopbop</p>
              <p className="text-[#888]">Designer Fashion Brands</p>
            </div>
            <div>
              <p className="font-bold text-white hover:underline cursor-pointer">Shop Cart Business</p>
              <p className="text-[#888]">Everything For Your Business</p>
            </div>
            <div>
              <p className="font-bold text-white hover:underline cursor-pointer">Prime Now</p>
              <p className="text-[#888]">2-Hour Delivery on Everyday Items</p>
            </div>
            <div>
              <p className="font-bold text-white hover:underline cursor-pointer">Shop Cart Music</p>
              <p className="text-[#888]">100 million songs, ad-free</p>
            </div>
          </div>

          <div className="pt-6 border-t border-[#232f3e] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#888]">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="hover:underline cursor-pointer">Conditions of Use & Sale</span>
              <span>·</span>
              <span className="hover:underline cursor-pointer">Privacy Notice</span>
              <span>·</span>
              <span className="hover:underline cursor-pointer">Interest-Based Ads</span>
            </div>
            <p>© 1996-2026, Shop Cart Inc. or its affiliates</p>
          </div>
        </div>
      </div>
    </footer>
  );
};
