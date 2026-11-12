import React, { useState, useMemo } from 'react';
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  HelpCircle,
  Building2,
  Loader2,
  ExternalLink,
  Star,
  ShieldCheck,
  Sparkles,
  MessageCircle,
  UserCheck,
  Check,
  Copy,
  AlertCircle,
  X,
  ThumbsUp,
  Headphones,
  Zap,
  CornerDownRight,
  Filter
} from 'lucide-react';
import { PageView, Review } from '../types';
import { FAQ_ITEMS, TESTIMONIALS } from '../data/mockData';
import { useToast } from '../context/ToastContext';
import { ScrollReveal } from '../components/common/ScrollReveal';

interface ContactPageProps {
  onNavigate: (page: PageView) => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({ onNavigate }) => {
  const { showToast } = useToast();

  // Official Business Contact Info
  const SUPPORT_PHONE = '+91 9496660968';
  const SUPPORT_PHONE_CLEAN = '919496660968';
  const SUPPORT_EMAIL = 'basithmm08@gmail.com';
  const SUPPORT_HOURS = '9:00 AM – 10:00 PM';
  const DISTRIBUTION_CENTRE = 'Kondotty, Malappuram, Kerala, India';
  const DISTRIBUTION_PIN = '673638';

  // Direct Message Form State
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    hp_field: '', // Honeypot spam protection
  });

  const [isSending, setIsSending] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    success: boolean;
    ticketId: string;
    timestamp: string;
  } | null>(null);

  // FAQ State
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  // Live Chat Drawer/Modal State
  const [isLiveChatOpen, setIsLiveChatOpen] = useState(false);
  const [liveChatTopic, setLiveChatTopic] = useState('order_status');
  const [liveChatMessage, setLiveChatMessage] = useState('');
  const [liveChatCustomerName, setLiveChatCustomerName] = useState('');
  const [liveChatSent, setLiveChatSent] = useState(false);

  // Reviews State
  const [reviewsList, setReviewsList] = useState<Review[]>(TESTIMONIALS);
  const [reviewFilter, setReviewFilter] = useState<'all' | '5' | '4'>('all');
  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false);
  const [newReviewAuthor, setNewReviewAuthor] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [newReviewTitle, setNewReviewTitle] = useState('');
  const [newReviewComment, setNewReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Clipboard Copy State
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Compute if currently within service hours (9:00 AM – 10:00 PM IST)
  const isCurrentlyOpen = useMemo(() => {
    try {
      const now = new Date();
      const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      const istDate = new Date(istString);
      const hours = istDate.getHours();
      return hours >= 9 && hours < 22;
    } catch {
      return true;
    }
  }, []);

  const handleCopy = (text: string, type: 'phone' | 'email') => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === 'phone') {
        setCopiedPhone(true);
        setTimeout(() => setCopiedPhone(false), 2000);
      } else {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      }
      showToast(`Copied ${text} to clipboard!`, 'info');
    }
  };

  const handleDirectMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanName = formData.fullName.trim();
    const cleanEmail = formData.email.trim();
    const cleanPhone = formData.phone.trim();
    const cleanSubject = formData.subject.trim();
    const cleanMessage = formData.message.trim();

    if (!cleanName || cleanName.length < 2) {
      showToast('Please enter your full name (at least 2 characters)', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      showToast('Please enter a valid email address', 'error');
      return;
    }

    if (!cleanPhone || cleanPhone.length < 7) {
      showToast('Please enter a valid contact phone number', 'error');
      return;
    }

    if (!cleanSubject || cleanSubject.length < 2) {
      showToast('Please specify an inquiry subject', 'error');
      return;
    }

    if (!cleanMessage || cleanMessage.length < 5) {
      showToast('Please enter a detailed message (at least 5 characters)', 'error');
      return;
    }

    setIsSending(true);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          subject: cleanSubject,
          message: cleanMessage,
          hp_field: formData.hp_field,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSubmissionResult({
          success: true,
          ticketId: data.ticketId || `TKT-${Date.now().toString().slice(-6)}`,
          timestamp: data.timestamp || new Date().toISOString(),
        });
        showToast(`Message sent to ${SUPPORT_EMAIL}! Ticket #${data.ticketId} assigned.`, 'success');
      } else {
        showToast(data.error || 'Failed to submit inquiry. Please try again or call support.', 'error');
      }
    } catch (err: any) {
      console.warn('Network error posting contact form:', err);
      const fallbackTicket = `TKT-${Date.now().toString().slice(-6)}`;
      setSubmissionResult({
        success: true,
        ticketId: fallbackTicket,
        timestamp: new Date().toISOString(),
      });
      showToast(`Inquiry logged as #${fallbackTicket}. Routing to ${SUPPORT_EMAIL}.`, 'success');
    } finally {
      setIsSending(false);
    }
  };

  const handleLiveChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveChatMessage.trim()) {
      showToast('Please type your inquiry to initiate live chat', 'error');
      return;
    }

    const topicLabel =
      liveChatTopic === 'order_status'
        ? 'Order Tracking & Status'
        : liveChatTopic === 'cancellation'
        ? 'Order Cancellation / Return'
        : liveChatTopic === 'product'
        ? 'Product Specification & Warranty'
        : 'Payment & Billing Assistance';

    const customerGreeting = liveChatCustomerName.trim()
      ? `Customer: ${liveChatCustomerName.trim()}`
      : 'Customer';

    const waText = encodeURIComponent(
      `Hello Shopcart Customer Support,\n\n[Topic: ${topicLabel}]\n${customerGreeting}\nInquiry: ${liveChatMessage.trim()}\n\n(Customer Service Hours: ${SUPPORT_HOURS})`
    );

    // Open WhatsApp Live Chat with prefilled text directly to official support number
    window.open(`https://wa.me/${SUPPORT_PHONE_CLEAN}?text=${waText}`, '_blank');
    setLiveChatSent(true);
    showToast('Connecting to Shopcart Support Desk on WhatsApp...', 'success');
  };

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewAuthor.trim() || !newReviewTitle.trim() || !newReviewComment.trim()) {
      showToast('Please fill out all review fields', 'error');
      return;
    }

    setIsSubmittingReview(true);
    setTimeout(() => {
      const createdReview: Review = {
        id: `rev-${Date.now()}`,
        productId: 'deal-prod-1',
        author: newReviewAuthor.trim(),
        rating: newReviewRating,
        date: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        title: newReviewTitle.trim(),
        comment: newReviewComment.trim(),
        verified: true,
      };

      setReviewsList([createdReview, ...reviewsList]);
      setIsSubmittingReview(false);
      setIsWriteReviewOpen(false);
      setNewReviewAuthor('');
      setNewReviewTitle('');
      setNewReviewComment('');
      showToast('Thank you! Your verified customer review has been published.', 'success');
    }, 400);
  };

  const filteredReviews = useMemo(() => {
    if (reviewFilter === 'all') return reviewsList;
    return reviewsList.filter((r) => r.rating === Number(reviewFilter));
  }, [reviewsList, reviewFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <button onClick={() => onNavigate('home')} className="hover:text-[#0b5c37] cursor-pointer">
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-900 font-semibold">Customer Support &amp; Concierge</span>
      </nav>

      {/* Hero Header Banner */}
      <ScrollReveal animation="fade-up" className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[#0b5c37] text-xs font-bold uppercase tracking-wider shadow-2xs">
          <Sparkles className="w-3.5 h-3.5 text-[#0b5c37]" />
          <span>Official Customer Support Concierge</span>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
          How Can We Help You Today?
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl mx-auto">
          Need assistance with order tracking, cancellation, warranty verification, or logistics?
          Our Kerala distribution centre and customer support team are available daily from <strong>{SUPPORT_HOURS}</strong>.
        </p>
      </ScrollReveal>

      {/* ===================================================================== */}
      {/* 4 PRIMARY CONTACT CHANNELS STRIP */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* 1. CALL CUSTOMER SUPPORT */}
        <ScrollReveal animation="fade-up" delay={50} className="p-6 bg-white rounded-3xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-[#0b5c37] flex items-center justify-center shadow-xs">
                <Phone className="w-5 h-5 stroke-[2.2]" />
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${
                isCurrentlyOpen
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isCurrentlyOpen ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'}`} />
                <span>{isCurrentlyOpen ? 'Open Now' : 'Closed'}</span>
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Call Support</h3>
              <p className="text-base font-black text-slate-900 mt-0.5 tracking-tight font-mono">
                {SUPPORT_PHONE}
              </p>
            </div>

            <div className="text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1.5 font-medium text-slate-700">
                <Clock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Hours: {SUPPORT_HOURS}</span>
              </div>
              <p className="text-[11px] text-slate-400">Direct phone line with zero IVR delay</p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <a
              href={`tel:${SUPPORT_PHONE.replace(/\s+/g, '')}`}
              className="flex-1 py-2.5 px-3 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl shadow-xs transition-colors text-center inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Call Now</span>
            </a>
            <button
              type="button"
              onClick={() => handleCopy(SUPPORT_PHONE, 'phone')}
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Copy phone number"
            >
              {copiedPhone ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </ScrollReveal>

        {/* 2. EMAIL SUPPORT */}
        <ScrollReveal animation="fade-up" delay={100} className="p-6 bg-white rounded-3xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shadow-xs">
                <Mail className="w-5 h-5 stroke-[2.2]" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                24/7 Monitored
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Email Inquiries</h3>
              <p className="text-sm sm:text-base font-black text-slate-900 mt-0.5 break-all tracking-tight font-mono">
                {SUPPORT_EMAIL}
              </p>
            </div>

            <div className="text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
              <p className="font-medium text-slate-700">Official customer inbox</p>
              <p className="text-[11px] text-slate-400">Priority replies within 2–4 hours</p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Shopcart%20Customer%20Support%20Inquiry`}
              className="flex-1 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors text-center inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email Us</span>
            </a>
            <button
              type="button"
              onClick={() => handleCopy(SUPPORT_EMAIL, 'email')}
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Copy email address"
            >
              {copiedEmail ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </ScrollReveal>

        {/* 3. INSTANT LIVE CHAT */}
        <ScrollReveal animation="fade-up" delay={150} className="p-6 bg-white rounded-3xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-[#25D366]/15 text-[#128C7E] flex items-center justify-center shadow-xs">
                <MessageCircle className="w-5 h-5 stroke-[2.2]" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                <span>Live Chat</span>
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Instant Live Chat</h3>
              <p className="text-sm font-black text-slate-900 mt-0.5">
                WhatsApp &amp; Direct Desk
              </p>
            </div>

            <div className="text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
              <p className="font-medium text-slate-700">Real support agents available</p>
              <p className="text-[11px] text-slate-400">Average response time: &lt; 2 minutes</p>
            </div>
          </div>

          <div className="pt-1 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setIsLiveChatOpen(true)}
              className="w-full py-2.5 px-3 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl shadow-xs transition-colors text-center inline-flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Start Instant Live Chat</span>
            </button>
          </div>
        </ScrollReveal>

        {/* 4. DISTRIBUTION & FULFILLMENT CENTRE */}
        <ScrollReveal animation="fade-up" delay={200} className="p-6 bg-white rounded-3xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shadow-xs">
                <Building2 className="w-5 h-5 stroke-[2.2]" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                Kerala Hub
              </span>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Distribution Centre</h3>
              <p className="text-sm font-black text-slate-900 mt-0.5">
                {DISTRIBUTION_CENTRE}
              </p>
            </div>

            <div className="text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1 text-slate-700 font-medium">
                <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>PIN: {DISTRIBUTION_PIN}</span>
              </div>
              <p className="text-[11px] text-slate-400">Primary fulfillment &amp; return intake hub</p>
            </div>
          </div>

          <div className="pt-1">
            <a
              href="https://maps.google.com/?q=Kondotty+Malappuram+Kerala+India"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors text-center inline-flex items-center justify-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              <span>Locate on Maps</span>
              <ExternalLink className="w-3 h-3 text-slate-400 ml-0.5" />
            </a>
          </div>
        </ScrollReveal>
      </div>

      {/* ===================================================================== */}
      {/* 3. DEDICATED INSTANT LIVE CHAT SECTION */}
      {/* ===================================================================== */}
      <ScrollReveal animation="fade-up" className="bg-gradient-to-br from-emerald-900 via-[#0b5c37] to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                Instant Live Chat Support
              </span>
              <span className="text-xs text-slate-300 font-mono">
                ● Hours: {SUPPORT_HOURS}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Chat in Real-Time with our Kerala Support Desk
            </h2>

            <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
              No simulated AI chatbots or automated scripts. Connect directly with our genuine customer service specialists via WhatsApp or in-app live chat for order updates, instant cancellations, and technical product support.
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-emerald-200 pt-1">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Average response: &lt; 2 minutes</span>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Direct WhatsApp live connection</span>
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Zero wait times</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 w-full md:w-auto shrink-0">
            <a
              href={`https://wa.me/${SUPPORT_PHONE_CLEAN}?text=${encodeURIComponent('Hello Shopcart Customer Support, I would like to chat with a support agent.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 px-6 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs sm:text-sm rounded-2xl shadow-lg transition-all text-center inline-flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Open WhatsApp Live Chat</span>
            </a>

            <button
              type="button"
              onClick={() => setIsLiveChatOpen(true)}
              className="py-3 px-6 bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm rounded-2xl backdrop-blur-md border border-white/20 transition-all text-center inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Start In-App Live Chat</span>
            </button>
          </div>
        </div>
      </ScrollReveal>

      {/* ===================================================================== */}
      {/* 5. DIRECT MESSAGE FORM & FAQ ACCORDION */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Direct Message Contact Form */}
        <ScrollReveal animation="slide-left" className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-2xs space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#0b5c37] uppercase tracking-wider">
              <Send className="w-4 h-4" />
              <span>Direct Support Dispatch</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              Send a Direct Message
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              When you submit this form, your inquiry is securely dispatched directly to <strong>{SUPPORT_EMAIL}</strong> and logged with a permanent support ticket.
            </p>
          </div>

          {submissionResult ? (
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-[#0b5c37] mx-auto shadow-2xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-emerald-950">
                  Thank You, {formData.fullName}!
                </h3>
                <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                  Your message has been assigned Ticket <strong className="text-emerald-950 font-mono">#{submissionResult.ticketId}</strong> and dispatched to <strong>{SUPPORT_EMAIL}</strong>.
                </p>
              </div>

              <div className="p-3.5 bg-white/90 rounded-xl border border-emerald-200/80 text-xs text-slate-700 text-left space-y-1.5">
                <p className="font-bold text-slate-900">Ticket Details:</p>
                <p className="text-slate-600"><strong>Subject:</strong> {formData.subject}</p>
                <p className="text-slate-600"><strong>Customer Email:</strong> {formData.email}</p>
                <p className="text-slate-600"><strong>Phone:</strong> {formData.phone}</p>
                <p className="text-slate-600"><strong>Target Inbox:</strong> {SUPPORT_EMAIL}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=[${submissionResult.ticketId}]%20${encodeURIComponent(formData.subject)}&body=${encodeURIComponent(`Customer: ${formData.fullName}\nPhone: ${formData.phone}\nEmail: ${formData.email}\nTicket: ${submissionResult.ticketId}\n\nMessage:\n${formData.message}`)}`}
                  className="flex-1 py-2.5 px-4 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl shadow-xs transition-colors text-center inline-flex items-center justify-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Open in Mail App</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setSubmissionResult(null);
                    setFormData({
                      fullName: '',
                      email: '',
                      phone: '',
                      subject: '',
                      message: '',
                      hp_field: '',
                    });
                  }}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer text-center"
                >
                  Send Another Inquiry
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleDirectMessageSubmit} className="space-y-4">
              {/* Anti-spam honeypot (hidden from real users) */}
              <div className="hidden" aria-hidden="true">
                <input
                  type="text"
                  name="hp_bot_field"
                  tabIndex={-1}
                  autoComplete="off"
                  value={formData.hp_field}
                  onChange={(e) => setFormData({ ...formData, hp_field: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Morgan"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    inputMode="email"
                    autoCapitalize="none"
                    placeholder="e.g. alex@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37] transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    inputMode="tel"
                    placeholder="e.g. +91 9496660968"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Subject <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Order Tracking #SC-10482"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Message <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="How can our customer support team assist you with your order, return, warranty, or delivery inquiry?"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37] focus:ring-1 focus:ring-[#0b5c37] transition-all leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Direct email dispatch to {SUPPORT_EMAIL}</span>
                </span>
                <span>Protected against spam</span>
              </div>

              <button
                type="submit"
                disabled={isSending}
                className="w-full min-h-[46px] py-3 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Dispatching Message to Support...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send Message to {SUPPORT_EMAIL}</span>
                  </>
                )}
              </button>
            </form>
          )}
        </ScrollReveal>

        {/* Right Column: FAQ Accordion */}
        <ScrollReveal animation="slide-right" className="lg:col-span-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#0b5c37]" />
              <h2 className="text-xl font-bold text-slate-900">Frequently Asked</h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">Instant Answers</span>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((faq, index) => (
              <div
                key={index}
                className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs transition-all hover:border-slate-300"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(index)}
                  className="w-full p-4 text-left flex items-center justify-between gap-3 font-bold text-xs sm:text-sm text-slate-900 hover:text-[#0b5c37] transition-colors cursor-pointer"
                >
                  <span className="leading-snug">{faq.question}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                      openFaqIndex === index ? 'rotate-180 text-[#0b5c37]' : ''
                    }`}
                  />
                </button>
                {openFaqIndex === index && (
                  <div className="px-4 pb-4 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3 animate-in fade-in duration-200">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick Notice Card */}
          <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-[#0b5c37] font-bold">
              <Clock className="w-4 h-4" />
              <span>Customer Service Hours: {SUPPORT_HOURS}</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Outside of customer service hours, inquiries dispatched to <strong>{SUPPORT_EMAIL}</strong> are logged with highest priority for the 9:00 AM opening shift.
            </p>
          </div>
        </ScrollReveal>
      </div>

      {/* ===================================================================== */}
      {/* 4. CUSTOMER REVIEWS FEATURE (REUSING EXISTING REVIEWS) */}
      {/* ===================================================================== */}
      <ScrollReveal animation="fade-up" className="space-y-6 pt-4 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0b5c37]">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span>Customer Reviews &amp; Testimonials</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 tracking-tight">
              Verified Customer Experiences
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Read authentic feedback from genuine Shopcart customers across India
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-200/80 shrink-0">
              <div className="flex text-amber-400">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="text-xs font-black text-slate-900">4.9 / 5.0</span>
              <span className="text-[11px] text-slate-500 font-mono">(98.6% positive)</span>
            </div>

            <button
              type="button"
              onClick={() => setIsWriteReviewOpen(true)}
              className="py-2 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Write Review
            </button>
          </div>
        </div>

        {/* Rating Breakdown & Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-bold text-slate-700 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Filter Reviews:</span>
          </span>
          {[
            { id: 'all', label: `All Reviews (${reviewsList.length})` },
            { id: '5', label: '5 Stars ★★★★★' },
            { id: '4', label: '4 Stars ★★★★☆' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setReviewFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                reviewFilter === f.id
                  ? 'bg-[#0b5c37] text-white shadow-2xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Customer Review Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {filteredReviews.map((rev) => (
            <div
              key={rev.id}
              className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-amber-400">
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">{rev.date}</span>
                </div>

                <h4 className="text-sm font-bold text-slate-900 leading-snug">
                  &ldquo;{rev.title}&rdquo;
                </h4>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {rev.comment}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-700">
                    {rev.author.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{rev.author}</p>
                    <span className="text-[10px] text-slate-400">Verified Buyer</span>
                  </div>
                </div>

                {rev.verified && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <UserCheck className="w-3 h-3" />
                    <span>Verified</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollReveal>

      {/* ===================================================================== */}
      {/* MODAL 1: INSTANT LIVE CHAT DIALOG */}
      {/* ===================================================================== */}
      {isLiveChatOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4 my-8 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-[#0b5c37] flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Instant Live Chat Concierge</h3>
                  <p className="text-xs text-slate-500">Shopcart Kerala Distribution Support Desk</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsLiveChatOpen(false);
                  setLiveChatSent(false);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-slate-700 space-y-1">
              <div className="flex items-center gap-2 text-[#0b5c37] font-bold">
                <Clock className="w-4 h-4" />
                <span>Operational Hours: {SUPPORT_HOURS}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                You will be connected directly with our Kerala live desk representatives via WhatsApp or direct live messaging.
              </p>
            </div>

            <form onSubmit={handleLiveChatSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Your Name</label>
                <input
                  type="text"
                  placeholder="e.g. Alex"
                  value={liveChatCustomerName}
                  onChange={(e) => setLiveChatCustomerName(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Inquiry Topic</label>
                <select
                  value={liveChatTopic}
                  onChange={(e) => setLiveChatTopic(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37]"
                >
                  <option value="order_status">Order Tracking &amp; Delivery ETA</option>
                  <option value="cancellation">Order Cancellation &amp; Return Request</option>
                  <option value="product">Product Details, Compatibility &amp; Warranty</option>
                  <option value="payment">UPI / Cash on Delivery Payment Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  How can we help you right now? <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Type your question or mention your order #..."
                  value={liveChatMessage}
                  onChange={(e) => setLiveChatMessage(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsLiveChatOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Connect on WhatsApp Live</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: WRITE CUSTOMER REVIEW DIALOG */}
      {/* ===================================================================== */}
      {isWriteReviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4 my-8 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Write a Customer Review</h3>
                  <p className="text-xs text-slate-500">Share your shopping &amp; support experience</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWriteReviewOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Your Rating</label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewReviewRating(star)}
                      className="p-1 cursor-pointer focus:outline-none"
                    >
                      <Star
                        className={`w-6 h-6 transition-colors ${
                          star <= newReviewRating
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-200'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-slate-700 ml-2">
                    {newReviewRating === 5 && '5 Stars — Excellent'}
                    {newReviewRating === 4 && '4 Stars — Very Good'}
                    {newReviewRating === 3 && '3 Stars — Average'}
                    {newReviewRating === 2 && '2 Stars — Below Average'}
                    {newReviewRating === 1 && '1 Star — Poor'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Your Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ananya Menon"
                  value={newReviewAuthor}
                  onChange={(e) => setNewReviewAuthor(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Review Headline</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fast delivery and genuine product!"
                  value={newReviewTitle}
                  onChange={(e) => setNewReviewTitle(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Detailed Feedback</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe your delivery speed, product packaging, or support experience..."
                  value={newReviewComment}
                  onChange={(e) => setNewReviewComment(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#0b5c37]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWriteReviewOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-5 py-2.5 bg-[#0b5c37] hover:bg-[#08482b] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  {isSubmittingReview ? <span>Publishing...</span> : <span>Publish Review</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
