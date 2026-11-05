import React, { useState } from 'react';
import {
  X,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Calendar,
  CreditCard,
  Copy,
  Check,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  ExternalLink,
  Phone,
  Mail,
  ShoppingBag,
} from 'lucide-react';
import { Order, OrderItem } from '../../types';
import { PRODUCTS } from '../../data/mockData';
import { formatPrice } from '../../utils/format';
import {
  getStatusMeta,
  getAmazonStepIndex,
  AMAZON_TRACKING_MILESTONES,
  formatEstimatedDelivery,
} from '../../utils/orderTracking';
import { ProductImage } from '../common/ProductImage';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';

interface OrderTrackingModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onBuyAgain?: (item: OrderItem) => void;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  order,
  isOpen,
  onClose,
  onBuyAgain,
}) => {
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(false);

  if (!isOpen || !order) return null;

  const currentStep = getAmazonStepIndex(order.status);
  const isCancelled = order.status === 'cancelled';
  const isRefunded = order.status === 'refunded';
  const isDelivered = order.status === 'delivered';

  const statusMeta = getStatusMeta(order.status);
  const deliveryInfo = formatEstimatedDelivery(
    order.estimated_delivery_date,
    order.created_at,
    isDelivered
  );

  const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const trackingNum = order.tracking_number || `SC-TRK-${order.order_number.replace(/\D/g, '').slice(-8) || '84729104'}`;
  const carrierName = order.carrier || 'Shop Cart Express';

  const handleCopy = (text: string, type: 'tracking' | 'orderId') => {
    navigator.clipboard.writeText(text);
    if (type === 'tracking') {
      setCopiedTracking(true);
      setTimeout(() => setCopiedTracking(false), 2000);
      showToast('Tracking number copied to clipboard', 'info');
    } else {
      setCopiedOrderId(true);
      setTimeout(() => setCopiedOrderId(false), 2000);
      showToast('Order ID copied to clipboard', 'info');
    }
  };

  const handleQuickReorder = (item: OrderItem) => {
    if (onBuyAgain) {
      onBuyAgain(item);
    } else {
      const prod = item.product || PRODUCTS.find((p) => p.id === item.product_id || p.name === item.product_name);
      if (prod) {
        addToCart(prod, item.quantity, item.selected_color || undefined, item.selected_size || undefined);
        showToast(`Added ${item.product_name} to cart!`, 'success');
      } else {
        showToast(`Added ${item.product_name} to cart!`, 'success');
      }
    }
  };

  // Sort shipment updates latest first
  const sortedUpdates = [...(order.shipment_updates || [])].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl my-6 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* 1. Modal Top Bar */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0b5c37] flex items-center justify-center text-white shadow-md shadow-emerald-900/10">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-mono tracking-wider font-bold text-emerald-500">
                  Order Tracking
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-xs text-slate-300">Placed on {orderDate}</span>
              </div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>#{order.order_number}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(order.order_number, 'orderId')}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Copy Order ID"
                >
                  {copiedOrderId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Scrollable Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-800 flex-1">
          {/* A. Estimated Delivery Banner (Amazon-Style) */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 rounded-2xl shadow-sm border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isDelivered
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : isCancelled || isRefunded
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-[#0b5c37]/30'
                  }`}
                >
                  {statusMeta.label}
                </span>
                <span className="text-xs text-slate-400">Carrier: {carrierName}</span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                {isCancelled
                  ? 'Order Cancelled'
                  : isRefunded
                  ? 'Payment Refunded'
                  : deliveryInfo.headline}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                {isCancelled || isRefunded ? statusMeta.description : deliveryInfo.subtext}
              </p>
            </div>

            {/* Tracking Number Tag */}
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-700/80 shrink-0 text-right">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Tracking Number</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-xs font-bold text-emerald-500">{trackingNum}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(trackingNum, 'tracking')}
                  className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Copy Tracking Number"
                >
                  {copiedTracking ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* B. Amazon 5-Stage Tracking Progress Timeline */}
          {!isCancelled && !isRefunded ? (
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                  Package Progress
                </span>
                <span className="text-xs font-semibold text-[#0b5c37]">
                  {statusMeta.label}
                </span>
              </div>

              {/* Progress Bar with Steps */}
              <div className="relative pt-2 pb-1">
                {/* Background Line */}
                <div className="absolute top-5 left-4 right-4 h-1 bg-slate-200 -translate-y-1/2 z-0" />

                {/* Active Colored Fill Line */}
                <div
                  className="absolute top-5 left-4 h-1 bg-gradient-to-r from-emerald-500 to-emerald-500 -translate-y-1/2 z-0 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, (currentStep / (AMAZON_TRACKING_MILESTONES.length - 1)) * 92))}%`,
                  }}
                />

                {/* Milestone Nodes */}
                <div className="relative z-10 flex justify-between">
                  {AMAZON_TRACKING_MILESTONES.map((step, idx) => {
                    const isCompleted = currentStep > idx;
                    const isActive = currentStep === idx;
                    const isPending = currentStep < idx;

                    return (
                      <div key={step.key} className="flex flex-col items-center text-center max-w-[80px]">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-xs ${
                            isCompleted
                              ? 'bg-emerald-600 text-white font-bold'
                              : isActive
                              ? 'bg-[#0b5c37] text-white ring-4 ring-emerald-200 animate-pulse'
                              : 'bg-white text-slate-300 border-2 border-slate-300'
                          }`}
                        >
                          {isCompleted ? (
                            <Check className="w-4 h-4 stroke-[3]" />
                          ) : isActive ? (
                            <Truck className="w-4 h-4" />
                          ) : (
                            <span className="text-xs font-bold font-mono">{idx + 1}</span>
                          )}
                        </div>

                        <div className="mt-2.5">
                          <p
                            className={`text-xs font-bold tracking-tight leading-tight ${
                              isActive
                                ? 'text-[#0b5c37]'
                                : isCompleted
                                ? 'text-slate-900'
                                : 'text-slate-400'
                            }`}
                          >
                            {step.label}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">
                            {step.sublabel}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Cancelled or Refunded Banner */
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-3 text-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold">Order Progression Halted: {statusMeta.label}</h4>
                <p className="text-xs text-rose-700 leading-relaxed">
                  {statusMeta.description} For assistance with this order or refund inquiries, please contact Shop Cart Customer Support.
                </p>
              </div>
            </div>
          )}

          {/* C. Shipment Activity Log History */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
              Shipment Activity Log ({sortedUpdates.length})
            </h4>

            <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-white">
              {sortedUpdates.length === 0 ? (
                <div className="p-4 text-xs text-slate-400 text-center">
                  Tracking event details will appear as the courier scans your package.
                </div>
              ) : (
                sortedUpdates.map((evt, idx) => {
                  const evtDate = new Date(evt.timestamp);
                  const formattedTime = evtDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  });
                  const formattedDate = evtDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  });

                  return (
                    <div key={evt.id || idx} className="p-3.5 flex items-start gap-3.5 text-xs">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#0b5c37] flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
                        {idx === 0 ? <Truck className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-slate-900">{evt.title}</p>
                          <span className="text-[11px] font-mono text-slate-400 shrink-0">
                            {formattedDate} · {formattedTime}
                          </span>
                        </div>
                        {evt.description && (
                          <p className="text-slate-500 text-[11px] mt-0.5">{evt.description}</p>
                        )}
                        {evt.location && (
                          <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{evt.location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* D. Shipping & Payment Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Delivery Address */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <MapPin className="w-4 h-4 text-[#0b5c37]" />
                <span>Shipping Destination</span>
              </div>
              <div className="text-slate-600 space-y-0.5 pt-1">
                <p className="font-bold text-slate-900">
                  {order.shipping_address?.fullName || order.guest_email || 'Customer'}
                </p>
                <p>{order.shipping_address?.street || order.shipping_address?.apartment}</p>
                <p>
                  {order.shipping_address?.city}, {order.shipping_address?.state}{' '}
                  {order.shipping_address?.postalCode}
                </p>
                <p>{order.shipping_address?.country}</p>
                {order.shipping_address?.phone && (
                  <p className="text-slate-500 flex items-center gap-1 pt-1">
                    <Phone className="w-3 h-3" />
                    <span>{order.shipping_address.phone}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Payment Summary */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <CreditCard className="w-4 h-4 text-[#0b5c37]" />
                <span>Payment &amp; Invoice</span>
              </div>
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Method:</span>
                  <span className="font-semibold text-slate-800 uppercase text-[11px]">
                    {order.paymentMethod === 'paypal' ? 'PayPal Gateway' : 'Google Pay UPI QR'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Status:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      order.paymentStatus === 'verified'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {order.paymentStatus === 'verified' ? 'Paid & Verified' : 'Pending Verification'}
                  </span>
                </div>
                {order.transactionReference && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Ref / UTR:</span>
                    <span className="font-mono text-slate-700 truncate max-w-[140px]">
                      {order.transactionReference}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                  <span className="text-slate-900">Total Charged:</span>
                  <span className="text-[#0b5c37] font-extrabold tabular-nums">
                    {formatPrice(Number(order.total_amount))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* E. Ordered Products List with "Buy Again" */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
              Ordered Items ({order.order_items?.length || 0})
            </h4>

            <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden bg-white">
              {(order.order_items || []).map((it, idx) => {
                const prod = it.product || PRODUCTS.find((p) => p.id === it.product_id || p.name === it.product_name);

                return (
                  <div key={idx} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                        {prod ? (
                          <ProductImage
                            product={prod}
                            size="sm"
                            showBadge={false}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-mono font-bold text-xs text-slate-500">
                            {it.product_name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                    <div>
                      <h5 className="font-bold text-xs text-slate-900">{it.product_name}</h5>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Qty: {it.quantity} · {formatPrice(Number(it.unit_price))} each
                        {it.selected_color && ` · Color: ${it.selected_color}`}
                        {it.selected_size && ` · Size: ${it.selected_size}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <span className="font-extrabold text-sm text-slate-900 tabular-nums">
                      {formatPrice(Number(it.total_price || it.unit_price * it.quantity))}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleQuickReorder(it)}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#08482b] font-bold text-xs rounded-xl border border-emerald-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Buy Again</span>
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        {/* 3. Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Guaranteed Delivery Protection by Shop Cart</span>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
          >
            Close Tracking
          </button>
        </div>
      </div>
    </div>
  );
};
