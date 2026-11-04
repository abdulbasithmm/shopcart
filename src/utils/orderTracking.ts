import { OrderStatus, ShipmentUpdate } from '../types';

export interface StatusMeta {
  key: OrderStatus;
  label: string;
  badgeLabel: string;
  color: 'emerald' | 'blue' | 'amber' | 'purple' | 'rose' | 'slate';
  bgClass: string;
  textClass: string;
  borderClass: string;
  description: string;
}

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  'order_placed',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refunded',
];

/**
 * Normalizes any legacy or external status string to one of the 8 canonical OrderStatus types
 */
export function normalizeOrderStatus(rawStatus?: string | null): OrderStatus {
  if (!rawStatus) return 'order_placed';
  const s = rawStatus.toLowerCase().trim().replace(/[\s-]+/g, '_');

  if (s === 'pending' || s === 'placed' || s === 'order_placed') return 'order_placed';
  if (s === 'confirmed') return 'confirmed';
  if (s === 'processing' || s === 'in_progress') return 'processing';
  if (s === 'shipped' || s === 'dispatched' || s === 'in_transit') return 'shipped';
  if (s === 'out_for_delivery' || s === 'outfordelivery') return 'out_for_delivery';
  if (s === 'delivered' || s === 'completed') return 'delivered';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'refunded' || s === 'returned') return 'refunded';

  return 'order_placed';
}

/**
 * Get display metadata for any order status
 */
export function getStatusMeta(rawStatus?: string | null): StatusMeta {
  const status = normalizeOrderStatus(rawStatus);

  switch (status) {
    case 'order_placed':
      return {
        key: 'order_placed',
        label: 'Order Placed',
        badgeLabel: 'Order Placed',
        color: 'amber',
        bgClass: 'bg-amber-500/10',
        textClass: 'text-amber-500',
        borderClass: 'border-amber-500/30',
        description: 'Your order has been submitted and is awaiting confirmation.',
      };
    case 'confirmed':
      return {
        key: 'confirmed',
        label: 'Confirmed',
        badgeLabel: 'Confirmed',
        color: 'blue',
        bgClass: 'bg-blue-500/10',
        textClass: 'text-blue-500',
        borderClass: 'border-blue-500/30',
        description: 'Order confirmed and scheduled for fulfillment at warehouse.',
      };
    case 'processing':
      return {
        key: 'processing',
        label: 'Processing',
        badgeLabel: 'Processing',
        color: 'purple',
        bgClass: 'bg-purple-500/10',
        textClass: 'text-purple-500',
        borderClass: 'border-purple-500/30',
        description: 'Items are being picked, quality checked, and packaged.',
      };
    case 'shipped':
      return {
        key: 'shipped',
        label: 'Shipped',
        badgeLabel: 'Shipped',
        color: 'blue',
        bgClass: 'bg-sky-500/10',
        textClass: 'text-sky-500',
        borderClass: 'border-sky-500/30',
        description: 'Package has left the fulfillment facility and is in transit.',
      };
    case 'out_for_delivery':
      return {
        key: 'out_for_delivery',
        label: 'Out for Delivery',
        badgeLabel: 'Out for Delivery',
        color: 'amber',
        bgClass: 'bg-emerald-500/10',
        textClass: 'text-[#0b5c37]',
        borderClass: 'border-[#0b5c37]/30',
        description: 'Courier has loaded your package on the delivery vehicle.',
      };
    case 'delivered':
      return {
        key: 'delivered',
        label: 'Delivered',
        badgeLabel: 'Delivered',
        color: 'emerald',
        bgClass: 'bg-emerald-500/10',
        textClass: 'text-emerald-500',
        borderClass: 'border-emerald-500/30',
        description: 'Package handed to resident or left safely at delivery location.',
      };
    case 'cancelled':
      return {
        key: 'cancelled',
        label: 'Cancelled',
        badgeLabel: 'Cancelled',
        color: 'rose',
        bgClass: 'bg-rose-500/10',
        textClass: 'text-rose-500',
        borderClass: 'border-rose-500/30',
        description: 'This order was cancelled and will not be shipped.',
      };
    case 'refunded':
      return {
        key: 'refunded',
        label: 'Refunded',
        badgeLabel: 'Refunded',
        color: 'slate',
        bgClass: 'bg-slate-500/10',
        textClass: 'text-slate-400',
        borderClass: 'border-slate-500/30',
        description: 'Payment was returned to the customer payment method.',
      };
  }
}

/**
 * Amazon 5-Stage Tracking Milestones
 */
export interface AmazonTrackingMilestone {
  index: number;
  key: OrderStatus;
  label: string;
  sublabel: string;
}

export const AMAZON_TRACKING_MILESTONES: AmazonTrackingMilestone[] = [
  { index: 0, key: 'order_placed', label: 'Ordered', sublabel: 'Order Placed' },
  { index: 1, key: 'confirmed', label: 'Confirmed', sublabel: 'Ready to Ship' },
  { index: 2, key: 'shipped', label: 'Shipped', sublabel: 'In Transit' },
  { index: 3, key: 'out_for_delivery', label: 'Out for Delivery', sublabel: 'Today' },
  { index: 4, key: 'delivered', label: 'Delivered', sublabel: 'Package Arrived' },
];

/**
 * Returns the milestone step index (0 to 4) for an order status.
 * Returns -1 if cancelled or refunded.
 */
export function getAmazonStepIndex(rawStatus?: string | null): number {
  const status = normalizeOrderStatus(rawStatus);

  if (status === 'cancelled' || status === 'refunded') {
    return -1;
  }
  if (status === 'order_placed') return 0;
  if (status === 'confirmed') return 1;
  if (status === 'processing') return 1; // Processing is between confirmed and shipped
  if (status === 'shipped') return 2;
  if (status === 'out_for_delivery') return 3;
  if (status === 'delivered') return 4;

  return 0;
}

/**
 * Formats estimated delivery date Amazon-style, e.g. "Arriving Friday, Nov 6"
 */
export function formatEstimatedDelivery(
  estimatedDateStr?: string | null,
  orderPlacedDateStr?: string | null,
  isDelivered?: boolean
): { headline: string; subtext: string; dateFormatted: string } {
  let targetDate: Date;

  if (estimatedDateStr) {
    targetDate = new Date(estimatedDateStr);
  } else if (orderPlacedDateStr) {
    const placed = new Date(orderPlacedDateStr);
    targetDate = new Date(placed);
    targetDate.setDate(placed.getDate() + 3);
  } else {
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);
  }

  // Format month, day, weekday
  const weekday = targetDate.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dateFormatted = `${weekday}, ${monthDay}`;

  if (isDelivered) {
    return {
      headline: `Delivered ${weekday}, ${monthDay}`,
      subtext: 'Package was left at recipient front door or mailroom',
      dateFormatted,
    };
  }

  return {
    headline: `Arriving ${weekday}, ${monthDay}`,
    subtext: 'Expected by 8:00 PM · Tracked with Shop Cart Express',
    dateFormatted,
  };
}

/**
 * Generates initial shipment update events for a newly placed order
 */
export function createInitialShipmentUpdates(
  orderPlacedDate: Date = new Date(),
  isPaid: boolean = false
): ShipmentUpdate[] {
  const updates: ShipmentUpdate[] = [
    {
      id: `evt-${Date.now()}-1`,
      status: 'order_placed',
      title: 'Order Placed',
      description: 'We have received your order details and payment submission.',
      location: 'Shop Cart Fulfillment Network',
      timestamp: orderPlacedDate.toISOString(),
    },
  ];

  if (isPaid) {
    const confirmedTime = new Date(orderPlacedDate.getTime() + 10 * 60 * 1000); // 10 mins later
    updates.push({
      id: `evt-${Date.now()}-2`,
      status: 'confirmed',
      title: 'Order Confirmed & Payment Verified',
      description: 'Your payment was authorized and warehouse allocation has commenced.',
      location: 'Central Distribution Center, Seattle WA',
      timestamp: confirmedTime.toISOString(),
    });
  }

  return updates;
}
