import React, { useState } from 'react';
import {
  Globe,
  Truck,
  RotateCcw,
  Headphones,
  Check,
  ChevronUp,
} from 'lucide-react';
import { PageView } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { AmazonLogo } from './AmazonLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { LanguageSwitcher } from '../navigation/LanguageSwitcher';

interface FooterProps {
  onNavigate: (page: PageView, params?: { category?: string }) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const { showToast } = useToast();
  const { t } = useLanguage();
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
    <footer className="mt-4 sm:mt-8 lg:mt-12 text-white font-sans w-full">
      {/* Back to top button */}
      <button
        onClick={scrollToTop}
        className="w-full py-3 bg-[#37475a] hover:bg-[#485769] text-center text-xs text-white font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        aria-label={t.common.backToTop}
      >
        <ChevronUp className="w-4 h-4 text-slate-300" />
        <span>{t.common.backToTop}</span>
      </button>

      {/* Main Multi-Column Links Section */}
      <div className="bg-[#232f3e] border-b border-[#3a4553] text-[#ddd]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-8 text-xs leading-relaxed">
            {/* Column 1 */}
            <div>
              <h4 className="font-bold text-white text-sm mb-3">{t.footer.getToKnowUs}</h4>
              <ul className="space-y-2 text-[#ccc]">
                <li>
                  <button
                    onClick={() => onNavigate('home')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    {t.footer.aboutShopCart}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('shop')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Careers &amp; Team
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => showToast('Shop Cart Press Centre: Eco-friendly packaging and carbon-neutral deliveries announced.', 'info')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Press Releases
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => showToast('Shop Cart Innovation: Exploring next-generation logistics and contactless returns.', 'info')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Shop Cart Innovation
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 2 */}
            <div>
              <h4 className="font-bold text-white text-sm mb-3">{t.footer.connectWithUs}</h4>
              <ul className="space-y-2 text-[#ccc]">
                <li>
                  <button
                    onClick={() => showToast('Connecting to Shop Cart Facebook Community...', 'info')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Facebook
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => showToast('Connecting to Shop Cart X / Twitter (@shopcart)...', 'info')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Twitter / X
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => showToast('Connecting to Shop Cart Instagram (@shopcart.in)...', 'info')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Instagram
                  </button>
                </li>
                <li className="pt-2">
                  <span className="text-[11px] text-slate-400">{t.footer.newsletter}:</span>
                  {subscribed ? (
                    <div className="flex items-center gap-1 text-[#22c55e] text-[11px] font-medium mt-1">
                      <Check className="w-3.5 h-3.5" /> {t.footer.subscribed}
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
                        className="px-2.5 py-1 bg-[#0b5c37] hover:bg-[#08482b] text-white rounded text-xs font-bold shrink-0 transition-colors cursor-pointer"
                      >
                        {t.footer.join}
                      </button>
                    </form>
                  )}
                </li>
              </ul>
            </div>

            {/* Column 3 */}
            <div>
              <h4 className="font-bold text-white text-sm mb-3">{t.footer.makeMoneyWithUs}</h4>
              <ul className="space-y-2 text-[#ccc]">
                <li>
                  <button
                    onClick={() => onNavigate('contact')}
                    className="hover:underline transition-colors text-left cursor-pointer text-emerald-400 font-semibold"
                  >
                    Partner with Shop Cart
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('contact')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Merchant Onboarding Guide
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('contact')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Protect and Build Your Brand
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('contact')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Shop Cart Global Selling
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('contact')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Become an Affiliate
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('contact')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Fulfilment by Shop Cart
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 4 */}
            <div>
              <h4 className="font-bold text-white text-sm mb-3">{t.footer.letUsHelpYou}</h4>
              <ul className="space-y-2 text-[#ccc]">
                <li>
                  <button
                    onClick={() => onNavigate('account')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Your Account
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('account')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Returns Centre
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => showToast('Shop Cart A-to-z Guarantee: 100% Purchase Protection on all products.', 'success')}
                    className="hover:underline transition-colors text-left cursor-pointer text-amber-300"
                  >
                    100% Purchase Protection
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('contact')}
                    className="hover:underline transition-colors text-left cursor-pointer"
                  >
                    Help &amp; Customer Service
                  </button>
                </li>
                <li className="pt-2 border-t border-[#3a4553]/60 text-[11px] space-y-1 text-[#bbb]">
                  <p className="text-white font-semibold">{t.footer.supportDesk}:</p>
                  <p><a href="tel:+919496660968" className="hover:text-emerald-400 text-white font-mono">+91 9496660968</a></p>
                  <p className="text-[10px] text-slate-400">{t.footer.hoursLabel}: 9:00 AM – 10:00 PM</p>
                  <p><a href="mailto:basithmm08@gmail.com" className="hover:text-emerald-400 text-[#ccc]">basithmm08@gmail.com</a></p>
                  <p className="text-[10px] text-slate-400">Kondotty, Malappuram, Kerala</p>
                </li>
              </ul>
            </div>
          </div>

          {/* Logo & Country/Language row */}
          <div className="mt-10 pt-8 border-t border-[#3a4553] flex flex-wrap items-center justify-center gap-6 text-xs text-[#ccc]">
            <div
              onClick={() => onNavigate('home')}
              className="cursor-pointer"
              title="Go to Home"
            >
              <AmazonLogo variant="light" className="h-7 w-auto" />
            </div>

            <div className="flex items-center gap-3 flex-wrap justify-center">
              <LanguageSwitcher variant="footer" />
              <div className="flex items-center gap-1.5 px-3 py-1.5 border border-[#848688] rounded text-xs text-white">
                <span>IN</span>
                <span>India (₹ INR)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-footer Directory (Deep Charcoal #131a22) */}
      <div className="bg-[#131a22] text-[#999] pt-6 pb-20 md:py-8 text-[11px]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8 text-[#aaa]">
            <div onClick={() => onNavigate('shop', { category: 'Books' })} className="cursor-pointer hover:text-white">
              <p className="font-bold text-white hover:underline">AbeBooks</p>
              <p className="text-[#888]">Books, art &amp; collectibles</p>
            </div>
            <div onClick={() => onNavigate('contact')} className="cursor-pointer hover:text-white">
              <p className="font-bold text-white hover:underline">Shop Cart Cloud</p>
              <p className="text-[#888]">Scalable Cloud Computing Services</p>
            </div>
            <div onClick={() => onNavigate('shop', { category: 'Electronics' })} className="cursor-pointer hover:text-white">
              <p className="font-bold text-white hover:underline">Audible</p>
              <p className="text-[#888]">Download Audio Books</p>
            </div>
            <div onClick={() => onNavigate('home')} className="cursor-pointer hover:text-white">
              <p className="font-bold text-white hover:underline">IMDb</p>
              <p className="text-[#888]">Movies, TV &amp; Celebrities</p>
            </div>
            <div onClick={() => onNavigate('shop', { category: 'Fashion' })} className="cursor-pointer hover:text-white">
              <p className="font-bold text-white hover:underline">Shopbop</p>
              <p className="text-[#888]">Designer Fashion Brands</p>
            </div>
            <div onClick={() => onNavigate('shop')} className="cursor-pointer hover:text-white">
              <p className="font-bold text-white hover:underline">Shop Cart Business</p>
              <p className="text-[#888]">Bulk orders &amp; wholesale savings</p>
            </div>
            <div onClick={() => onNavigate('shop')} className="cursor-pointer hover:text-white">
              <p className="font-bold text-white hover:underline">Prime Now</p>
              <p className="text-[#888]">2-Hour Delivery on Everyday Items</p>
            </div>
            <div onClick={() => onNavigate('shop', { category: 'Electronics' })} className="cursor-pointer hover:text-white">
              <p className="font-bold text-white hover:underline">Shop Cart Music</p>
              <p className="text-[#888]">100 million songs, ad-free</p>
            </div>
          </div>

          <div className="pt-6 border-t border-[#232f3e] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#888]">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <PWAInstallButton variant="footer" className="text-slate-400 hover:text-white" />
              <span>·</span>
              <button onClick={() => showToast('Conditions of Use: All orders are subject to Shop Cart standard customer terms.', 'info')} className="hover:underline cursor-pointer">Conditions of Use &amp; Sale</button>
              <span>·</span>
              <button onClick={() => showToast('Privacy Notice: Your personal information is encrypted and never shared.', 'info')} className="hover:underline cursor-pointer">Privacy Notice</button>
              <span>·</span>
              <button onClick={() => showToast('Interest-Based Ads: You can customize your cookie preferences in account settings.', 'info')} className="hover:underline cursor-pointer">Interest-Based Ads</button>
            </div>
            <p>{t.footer.copyright}</p>
          </div>
        </div>
      </div>
    </footer>
  );
};
