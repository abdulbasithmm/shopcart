import React, { useState } from 'react';
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
  Building,
  Loader2,
} from 'lucide-react';
import { PageView } from '../types';
import { FAQ_ITEMS } from '../data/mockData';
import { useToast } from '../context/ToastContext';
import { ScrollReveal } from '../components/common/ScrollReveal';

interface ContactPageProps {
  onNavigate: (page: PageView) => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({ onNavigate }) => {
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    topic: 'order_inquiry',
    orderNumber: '',
    message: '',
  });

  const [isSending, setIsSending] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      showToast('Please fill out all required fields', 'error');
      return;
    }

    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setIsSubmitted(true);
      showToast('Message sent! Our support team will reply within 4 hours.', 'success');
    }, 600);
  };

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <button onClick={() => onNavigate('home')} className="hover:text-[#0b5c37] cursor-pointer">
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-900 font-semibold">Contact Concierge &amp; FAQs</span>
      </nav>

      {/* Header Banner */}
      <ScrollReveal animation="fade-up" className="text-center max-w-2xl mx-auto space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[#0b5c37]">
          Customer Concierge
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          How Can We Help You Today?
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          Whether you have an order question, need technical advice on acoustic headphones, or wish to explore commercial partnerships, we are here 24/7.
        </p>
      </ScrollReveal>

      {/* Support Info Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <ScrollReveal animation="fade-up" delay={50} className="p-6 bg-white rounded-3xl border border-slate-200/90 shadow-2xs space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#0b5c37] flex items-center justify-center">
            <Phone className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Toll-Free Phone</h3>
          <p className="text-xs text-slate-600">Mon-Fri: 6am - 8pm IST<br />Sat-Sun: 8am - 5pm IST</p>
          <p className="text-xs font-bold text-[#0b5c37]">+91 1800 200 4882</p>
        </ScrollReveal>

        <ScrollReveal animation="fade-up" delay={100} className="p-6 bg-white rounded-3xl border border-slate-200/90 shadow-2xs space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#0b5c37] flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Email Inquiries</h3>
          <p className="text-xs text-slate-600">Direct response within 4 hours guaranteed.</p>
          <p className="text-xs font-bold text-[#0b5c37]">support@shopcart.in</p>
        </ScrollReveal>

        <ScrollReveal animation="fade-up" delay={150} className="p-6 bg-white rounded-3xl border border-slate-200/90 shadow-2xs space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#0b5c37] flex items-center justify-center">
            <MapPin className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Distribution Centre</h3>
          <p className="text-xs text-slate-600">Cyber City, Tower B, Phase II<br />Gurugram, HR 122002</p>
          <p className="text-xs font-bold text-[#0b5c37]">India Hub</p>
        </ScrollReveal>

        <ScrollReveal animation="fade-up" delay={200} className="p-6 bg-white rounded-3xl border border-slate-200/90 shadow-2xs space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#0b5c37] flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Instant Live Chat</h3>
          <p className="text-xs text-slate-600">Real acoustic and lifestyle experts online now.</p>
          <span className="inline-block text-[11px] font-bold text-[#08482b] bg-emerald-100 px-2 py-0.5 rounded-full">
            ● Average wait: 2 mins
          </span>
        </ScrollReveal>
      </div>

      {/* 2-Column: Contact Form & FAQ Accordion */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Column: Form */}
        <ScrollReveal animation="slide-left" className="lg:col-span-6 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-2xs space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Send Us a Direct Message</h2>
            <p className="text-xs text-slate-500 mt-1">
              Fill out this form and a specialist will review your inquiry immediately.
            </p>
          </div>

          {isSubmitted ? (
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-[#0b5c37] mx-auto" />
              <h3 className="text-sm font-bold text-emerald-950">Thank you, {formData.name}!</h3>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Your message has been assigned Ticket <strong>#TKT-{Math.floor(1000 + Math.random() * 9000)}</strong>. A team member will reply to <strong>{formData.email}</strong> shortly.
              </p>
              <button
                onClick={() => {
                  setIsSubmitted(false);
                  setFormData({ name: '', email: '', topic: 'order_inquiry', orderNumber: '', message: '' });
                }}
                className="mt-2 text-xs font-bold text-[#08482b] underline cursor-pointer"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Your Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Morgan"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. alex@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Inquiry Topic</label>
                  <select
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                  >
                    <option value="order_inquiry">Order Status &amp; Tracking</option>
                    <option value="return_exchange">Return / Exchange Request</option>
                    <option value="product_question">Product Specifications</option>
                    <option value="wholesale">Corporate &amp; Wholesale Inquiries</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Order # (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. EKO-10492"
                    value={formData.orderNumber}
                    onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Your Message *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="How can our customer team assist you?"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#0b5c37]"
                />
              </div>

              <button
                type="submit"
                disabled={isSending}
                className="w-full py-3.5 bg-[#0b5c37] hover:bg-[#08482b] text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Transmitting Message...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Transmit Message</span>
                  </>
                )}
              </button>
            </form>
          )}
        </ScrollReveal>

        {/* Right Column: FAQ Accordion */}
        <ScrollReveal animation="slide-right" className="lg:col-span-6 space-y-6">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[#0b5c37]" />
            <h2 className="text-xl font-bold text-slate-900">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((faq, index) => (
              <div
                key={index}
                className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(index)}
                  className="w-full p-4 text-left flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-slate-900 hover:text-[#0b5c37] transition-colors cursor-pointer"
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                      openFaqIndex === index ? 'rotate-180 text-[#0b5c37]' : ''
                    }`}
                  />
                </button>
                {openFaqIndex === index && (
                  <div className="px-4 pb-4 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3 animate-in fade-in-50 duration-200">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
};
