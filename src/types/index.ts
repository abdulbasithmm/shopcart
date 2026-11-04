export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviewsCount: number;
  inStock: boolean;
  stockCount: number;
  isFeatured?: boolean;
  isBestSeller?: boolean;
  isSpecialOffer?: boolean;
  isNewArrival?: boolean;
  claimedPercentage?: number;
  discountPercentage?: number;
  badge?: string;
  shortDescription: string;
  fullDescription: string;
  features: string[];
  specs: Record<string, string>;
  colors: { name: string; hex: string }[];
  sizes?: string[];
  visualType:
    | 'headphones'
    | 'smartwatch'
    | 'coat'
    | 'lamp'
    | 'serum'
    | 'chair'
    | 'speaker'
    | 'carafe'
    | 'backpack'
    | 'cream'
    | 'glasses'
    | 'shelf'
    | 'book'
    | 'coffee'
    | 'earbuds'
    | 'shoes'
    | 'cooker'
    | 'blender'
    | 'mobile'
    | 'laptop'
    | 'toys'
    | 'sports'
    | string;
  accentColor: string;
  tags: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedColor?: string;
  selectedSize?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  role?: 'customer' | 'admin';
  emailConfirmed?: boolean;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

export interface Review {
  id: string;
  productId: string;
  userId?: string;
  author: string;
  avatar?: string;
  rating: number;
  date: string;
  title: string;
  comment: string;
  verified: boolean;
  helpful?: number;
}

export type OrderStatus =
  | 'order_placed'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface ShipmentUpdate {
  id: string;
  orderId?: string;
  status: OrderStatus;
  title: string;
  description?: string;
  location?: string;
  timestamp: string;
}

export interface OrderItem {
  id?: string;
  order_id?: string;
  product_id?: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  selected_color?: string | null;
  selected_size?: string | null;
  product?: Product;
}

export interface PaymentRecord {
  id?: string;
  order_id?: string;
  payment_method: 'paypal' | 'gpay_qr' | 'credit_card' | 'cash_on_delivery';
  amount: number;
  currency: string;
  payment_status: 'pending' | 'verified' | 'failed' | 'refunded';
  transaction_reference?: string | null;
  created_at?: string;
  raw_details?: Record<string, any>;
}

export interface Order {
  id: string;
  order_number: string;
  user_id?: string | null;
  guest_email?: string | null;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  tax_amount: number;
  total_amount: number;
  coupon_code?: string | null;
  shipping_address: {
    fullName: string;
    street: string;
    apartment?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string;
  };
  customer_notes?: string | null;
  tracking_number?: string | null;
  carrier?: string | null;
  estimated_delivery_date?: string | null;
  shipment_updates?: ShipmentUpdate[];
  order_items?: OrderItem[];
  payment_records?: PaymentRecord[];
  paymentMethod?: 'paypal' | 'gpay_qr' | 'credit_card' | 'cash_on_delivery';
  paymentStatus?: 'pending' | 'verified' | 'failed' | 'refunded';
  transactionReference?: string | null;
  created_at: string;
  updated_at?: string;
}

export type PageView =
  | 'home'
  | 'shop'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'contact'
  | 'login'
  | 'register'
  | 'account'
  | 'forgot-password'
  | 'reset-password'
  | 'admin'
  | 'admin-login'
  | 'access-denied';

export interface FilterOptions {
  category: string;
  minPrice: number;
  maxPrice: number;
  sortBy: 'featured' | 'price-low' | 'price-high' | 'rating' | 'newest';
  searchQuery: string;
  inStockOnly: boolean;
  minRating: number;
}
