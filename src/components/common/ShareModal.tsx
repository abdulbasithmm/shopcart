import React, { useState } from 'react';
import { X, Share2, Mail, MessageCircle, Send, Copy, Check } from 'lucide-react';
import { SharePayload } from '../../utils/share';
import { useLanguage } from '../../context/LanguageContext';

interface ShareModalProps {
  payload: SharePayload | null;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ payload, onClose }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  if (!payload) return null;

  const encodedUrl = encodeURIComponent(payload.url);
  const encodedText = encodeURIComponent(`${payload.title} — ${payload.text}`);
  const encodedTitle = encodeURIComponent(payload.title);

  const shareChannels = [
    {
      id: 'whatsapp',
      label: t.share.whatsapp,
      href: `https://wa.me/?text=${encodeURIComponent(`${payload.title}\n${payload.text}\n${payload.url}`)}`,
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
      icon: <MessageCircle className="w-5 h-5" />,
    },
    {
      id: 'telegram',
      label: t.share.telegram,
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      bg: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
      icon: <Send className="w-5 h-5" />,
    },
    {
      id: 'facebook',
      label: t.share.facebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      bg: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
      icon: <Share2 className="w-5 h-5" />,
    },
    {
      id: 'x',
      label: t.share.xTwitter,
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      bg: 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200',
      icon: <span className="font-black text-base leading-none">𝕏</span>,
    },
    {
      id: 'email',
      label: t.share.email,
      href: `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(`${payload.text}\n\n${payload.url}`)}`,
      bg: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
      icon: <Mail className="w-5 h-5" />,
    },
  ];

  const handleCopyFallback = async () => {
    try {
      await navigator.clipboard.writeText(payload.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure in restricted context
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-[#0b5c37]" />
              <span>{t.share.title}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{payload.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600">{t.share.subtitle}</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {shareChannels.map((ch) => (
            <a
              key={ch.id}
              href={ch.href}
              target={ch.id === 'email' ? undefined : '_blank'}
              rel={ch.id === 'email' ? undefined : 'noopener noreferrer'}
              onClick={onClose}
              className={`min-h-[48px] p-3 rounded-xl border font-semibold text-xs flex items-center gap-2.5 transition-colors ${ch.bg}`}
            >
              {ch.icon}
              <span>{ch.label}</span>
            </a>
          ))}
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
          <span className="text-[11px] text-slate-400 truncate font-mono">{payload.url}</span>
          <button
            type="button"
            onClick={handleCopyFallback}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? t.share.linkCopied : t.share.copyLink}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
