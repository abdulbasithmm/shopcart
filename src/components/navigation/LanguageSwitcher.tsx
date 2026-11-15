import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { LANGUAGE_OPTIONS } from '../../i18n';
import { SupportedLanguage } from '../../types';

interface LanguageSwitcherProps {
  variant?: 'header' | 'floating' | 'drawer' | 'footer';
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'header',
  className = '',
}) => {
  const { language, setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const currentOption = LANGUAGE_OPTIONS.find((opt) => opt.code === language) || LANGUAGE_OPTIONS[0];

  const handleSelect = async (code: SupportedLanguage) => {
    setIsOpen(false);
    await setLanguage(code);
  };

  if (variant === 'drawer') {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Globe className="w-3.5 h-3.5 text-[#0b5c37]" />
          <span>{t.common.language}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = language === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => handleSelect(opt.code)}
                className={`min-h-[42px] px-2 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center ${
                  active
                    ? 'bg-[#0b5c37] text-white border-[#0b5c37] shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <span className="text-[11px] font-black">{opt.shortLabel}</span>
                <span className="text-[10px] opacity-90 truncate max-w-full">{opt.nativeName}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={t.common.selectLanguage}
        aria-expanded={isOpen}
        className={
          variant === 'floating'
            ? 'flex items-center gap-1.5 px-3 min-h-[40px] bg-white/95 hover:bg-white text-slate-900 border border-slate-200/90 rounded-lg shadow-sm text-xs font-bold transition-colors cursor-pointer backdrop-blur-xs'
            : variant === 'footer'
            ? 'flex items-center gap-1.5 px-3 min-h-[38px] border border-[#848688] hover:border-white rounded text-xs text-white transition-colors cursor-pointer'
            : 'flex items-center gap-1.5 px-2.5 min-h-[40px] hover:bg-slate-100 rounded-md transition-colors cursor-pointer text-xs font-bold text-slate-800 border border-transparent hover:border-slate-200'
        }
      >
        <Globe className={`w-3.5 h-3.5 shrink-0 ${variant === 'footer' ? 'text-slate-300' : 'text-[#0b5c37]'}`} />
        <span>{currentOption.shortLabel}</span>
        <span className="hidden sm:inline font-medium opacity-80">· {currentOption.nativeName}</span>
        <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className={`absolute right-0 w-48 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-50 text-xs text-slate-800 ${
            variant === 'footer' ? 'bottom-full mb-2' : 'top-full mt-1.5'
          }`}
        >
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
            {t.common.selectLanguage}
          </div>
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = language === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(opt.code)}
                className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer min-h-[38px] ${
                  active
                    ? 'bg-emerald-50 text-[#0b5c37] font-bold'
                    : 'hover:bg-slate-50 text-slate-700 font-medium'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                    {opt.shortLabel}
                  </span>
                  <span className="truncate">{opt.nativeName}</span>
                </div>
                {active && <Check className="w-3.5 h-3.5 text-[#0b5c37] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
