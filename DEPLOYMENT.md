# Ekomart Production Deployment Guide

This guide details the complete production setup, required environment variables, and deployment instructions for hosting the **Ekomart Modern E-Commerce Platform**.

---

## 1. System Architecture

Ekomart is engineered as a modern full-stack application:
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, responsive component architecture.
- **Backend / API**: Node.js & Express server (`server.ts`) hosting secure payment verification endpoints (`/api/paypal/*`, `/api/payments/*`, `/api/admin/*`).
- **Database & Auth**: Supabase PostgreSQL with Row Level Security (RLS) policies and Role-Based Access Control (RBAC).
- **Payment Gateways**:
  - **PayPal v2 REST API**: Authoritative backend order creation and capture verification.
  - **Google Pay / UPI QR**: Manual bank reconciliation workflow with admin payment approval.

---

## 2. Required & Optional Environment Variables

Create a `.env` file or populate these variables in your hosting provider's secrets panel:

| Variable | Required | Description | Example / Default |
| :--- | :---: | :--- | :--- |
| `PORT` | Optional | Web server listening port | `3000` |
| `NODE_ENV` | Optional | Environment mode | `production` |
| `VITE_SUPABASE_URL` | **Yes** | Your Supabase project API URL | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | Supabase public anonymous API key | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Supabase secret key (Server-side only) | `eyJhbGciOi...` |
| `PAYPAL_CLIENT_ID` | Optional | PayPal REST App Client ID (`sb` for sandbox) | `sb` or `AfA8...` |
| `PAYPAL_CLIENT_SECRET` | Optional | PayPal REST App Client Secret | `EAwA...` |
| `PAYPAL_ENVIRONMENT` | Optional | PayPal environment | `sandbox` or `live` |

> 🔒 **Security Notice**: Never commit `.env` containing production keys into version control.

---

## 3. Database Setup (Supabase PostgreSQL)

1. Create a project at [https://supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase project dashboard.
3. Open `supabase/schema.sql` from this codebase and execute it.
4. The script provisions:
   - `public.categories` and `public.products` tables.
   - `public.inventory` table with atomic decrement triggers.
   - `public.profiles` table with automatic signup triggers and role management (`customer` vs `admin`).
   - `public.carts` and `public.cart_items` for synchronized cross-device carts.
   - `public.orders`, `public.order_items`, and `public.order_shipment_updates` for Amazon-style order tracking.
   - `public.payment_records` for financial audit logs.
   - Complete Row Level Security (RLS) policies guaranteeing customer isolation.

---

## 4. Production Build & Run

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build the Frontend Assets
```bash
npm run build
```
This generates the optimized production bundle inside the `/dist` directory.

### Step 3: Run the Full-Stack Server
```bash
npm start
```
The Express server will automatically serve the compiled frontend bundle from `/dist` and listen on port `3000` (or `process.env.PORT`).

---

## 5. Deployment Options

### Option A: Google Cloud Run / Docker
A standard Node.js Docker container can be built with:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
```

### Option B: Railway / Render
1. Connect your repository.
2. Set Build Command: `npm run build`
3. Set Start Command: `npm start`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_ENVIRONMENT` (set to `live` for real transactions)

---

## 6. Verification Checklist

- [x] **Storefront & Navigation**: All 8 customer pages and routing work smoothly.
- [x] **Catalog & Filters**: Real-time category, brand, rating, and price filters.
- [x] **Shopping Cart**: Cart totals, quantities, persistent storage, and coupon discounts (`EKOMART10`, `SAVE20`).
- [x] **Payments**:
  - PayPal v2 REST backend verification.
  - Google Pay UPI QR scan and 12-digit UTR reference capture.
- [x] **Amazon-Style Tracking**: 8 canonical statuses (`order_placed`, `confirmed`, `processing`, `shipped`, `out_for_delivery`, `delivered`, `cancelled`, `refunded`), carrier tracking numbers, and delivery ETA banners.
- [x] **Admin Dashboard**: Role-based access control, order management, payment verification, and product catalog management.
