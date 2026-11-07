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
  images?: string[]; // 4 views: [Front/Main, Back, Left Side, Right Side]
  image?: string; // Main primary image URL
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

export type PaymentStatus =
  | 'awaiting_payment'
  | 'screenshot_submitted'
  | 'ai_analyzed'
  | 'pending_admin_verification'
  | 'verified'
  | 'rejected'
  | 'failed'
  | 'refunded'
  | 'pending_verification'
  | 'pending';

export type UpiProvider =
  | 'all_upi'
  | 'gpay_upi'
  | 'phonepe_upi'
  | 'paytm_upi'
  | 'bhim_upi'
  | 'other_upi';

export interface AIScreenshotAnalysis {
  screenshot_status: 'valid_success' | 'payment_failed' | 'tampered' | 'unclear' | 'not_a_receipt';
  extracted_utr: string;
  extracted_amount: number | null;
  extracted_merchant: string;
  extracted_app: string;
  extracted_timestamp: string;
  amount_matches: boolean;
  merchant_matches: boolean;
  suspicious_indicators: string[];
  confidence_score: number; // 0 - 100
  recommended_action: 'DETAILS_MATCH' | 'REVIEW_REQUIRED' | 'POSSIBLE_FRAUD';
  ai_summary: string;
  analyzed_at?: string;
}

export interface MerchantPaymentSettings {
  merchant_upi_id: string;
  merchant_name: string;
  merchant_upi_number: string;
  qr_image_url: string;
  enable_dynamic_qr: boolean;
  instructions?: string;
  updated_at?: string;
}

export interface PaymentRecord {
  id?: string;
  order_id?: string;
  payment_method: string;
  amount: number;
  currency: string;
  payment_status: PaymentStatus;
  transaction_reference?: string | null;
  screenshot_url?: string | null;
  ai_analysis?: AIScreenshotAnalysis | null;
  ai_confidence_score?: number | null;
  ai_recommendation?: string | null;
  suspicious_indicators?: string[] | null;
  verified_at?: string | null;
  verified_by?: string | null;
  rejection_reason?: string | null;
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
  paymentMethod?: string;
  paymentStatus?: PaymentStatus;
  transactionReference?: string | null;
  screenshotUrl?: string | null;
  aiAnalysis?: AIScreenshotAnalysis | null;
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
