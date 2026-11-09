# ShopCart — Android TWA & Google Play Store Publishing Guide

This guide details the complete end-to-end instructions for converting **ShopCart** into a native Android application using Google's **Trusted Web Activity (TWA)** and publishing it to the **Google Play Store**.

---

## 1. Architecture Overview

A **Trusted Web Activity (TWA)** wraps the high-performance PWA in a native Android shell via Chrome Custom Tabs:
- **Zero URL Bar**: Once Digital Asset Links are verified, the browser address bar disappears completely, providing a 100% native full-screen experience.
- **Direct Play Store Distribution**: Users download the app directly from the Google Play Store.
- **Auto-Updating**: Frontend code updates deploy instantly via Vercel without requiring re-submission or app store approval.
- **Native Android Features**: Splash screen, app icons, shortcuts, push notifications, and orientation locking.

---

## 2. Prerequisites

1. **Node.js 18+** installed on your workstation.
2. **Java Development Kit (JDK 17 or 21)** installed (`java -version`).
3. **Android SDK Command-Line Tools** (or Android Studio).
4. **Google Play Console Developer Account** ($25 one-time registration fee).

---

## 3. Step-by-Step Build Instructions

### Step 1: Install Bubblewrap CLI
Google provides the official `bubblewrap` CLI to automate TWA generation:
```bash
npm install -g @bubblewrap/cli
```

### Step 2: Initialize or Use Pre-Configured Manifest
This repository already includes the pre-configured `twa-manifest.json`.

To generate the Android Studio project from this manifest, run:
```bash
bubblewrap build
```

*Note: If prompted to create an Android Keystore (signing key), Bubblewrap will generate `android.keystore` and store the alias and password securely.*

To generate a key manually with `keytool`:
```bash
keytool -genkey -v -keystore shopcart-release.keystore -alias shopcart -keyalg RSA -keysize 2048 -validity 10000
```
Keep this keystore and password secure; it is required for all future updates.

### Step 3: Extract the SHA-256 Fingerprint
Print your keystore's SHA-256 certificate fingerprint:
```bash
keytool -list -v -keystore android.keystore -alias shopcart
```
Locate the line starting with `SHA256:`. Example:
`14:6D:E9:7D:0F:52:AB:3B:56:87:C5:3A:5B:4E:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45`

### Step 4: Configure Digital Asset Links (`.well-known/assetlinks.json`)
Open `public/.well-known/assetlinks.json` in this repository and replace the placeholder with your actual SHA-256 fingerprint:
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.shopcart.app",
      "sha256_cert_fingerprints": [
        "YOUR_SHA256_FINGERPRINT_HERE"
      ]
    }
  }
]
```
Deploy this file to production so it is accessible at:
`https://shopcart-olive.vercel.app/.well-known/assetlinks.json`

Verify verification via Google's Asset Link tool:
```bash
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://shopcart-olive.vercel.app&relation=delegate_permission/common.handle_all_urls"
```

---

## 4. Google Play Console Publishing

1. **Log in to Google Play Console**:
   Visit [https://play.google.com/console](https://play.google.com/console).

2. **Create New App**:
   - App Name: `ShopCart: Online Shopping`
   - Default Language: `English (United States)` or `English (India)`
   - App or Game: `App`
   - Free or Paid: `Free`

3. **Opt into Google Play App Signing**:
   - Under **Setup → App Integrity**, ensure Play App Signing is enabled.
   - Copy the **App Signing Key Certificate SHA-256 Fingerprint** provided by Google Play and add it as an additional entry in `public/.well-known/assetlinks.json`.

4. **Upload Android App Bundle (.aab)**:
   - Navigate to **Production** (or **Internal Testing**).
   - Click **Create New Release**.
   - Upload the generated `app-release-bundle.aab` output from Bubblewrap.

5. **Store Listing Details**:
   - **Short Description (≤ 80 chars)**: Fast online shopping with instant UPI checkout & real-time delivery tracking.
   - **Full Description**:
     ```
     ShopCart is your modern online shopping destination for electronics, fashion, lifestyle products, and home essentials.
     
     Key Features:
     • Curated catalog with verified ratings and high-resolution multi-angle galleries.
     • Instant UPI Checkout with Google Pay, PhonePe, Paytm, and BHIM UPI.
     • Zero payment processing fees on UPI transfers.
     • Live order tracking with 5-stage shipment progress and carrier ETA.
     • Secure account management and saved delivery addresses.
     • Lightning-fast, lightweight shopping experience.
     ```
   - **App Icon**: 512x512 PNG (`public/pwa-512x512.png`).
   - **Feature Graphic**: 1024x500 PNG/JPEG.
   - **Screenshots**: Upload phone and tablet screenshots of the Homepage, Product Page, and Checkout.

6. **Submit for Review**:
   Complete Content Rating questionnaire, Target Audience, and Privacy Policy URL, then submit the release for review.
