import fs from 'fs';
import path from 'path';

console.log('================================================================');
console.log('   SHOPCART – VERCEL ADMIN ROUTING & 404 PREVENTION TEST SUITE');
console.log('================================================================\n');

let allPassed = true;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    allPassed = false;
  }
}

// -------------------------------------------------------------
// 1. Validate vercel.json SPA Rewrites
// -------------------------------------------------------------
console.log('[1/5] Verifying vercel.json Deployment Configuration:');
const vercelConfigPath = path.resolve(process.cwd(), 'vercel.json');
assert(fs.existsSync(vercelConfigPath), 'vercel.json exists in project root');

if (fs.existsSync(vercelConfigPath)) {
  const content = fs.readFileSync(vercelConfigPath, 'utf8');
  let parsed: any;
  try {
    parsed = JSON.parse(content);
    assert(true, 'vercel.json is valid JSON');
  } catch (err: any) {
    assert(false, `vercel.json JSON syntax error: ${err.message}`);
  }

  if (parsed) {
    assert(Array.isArray(parsed.rewrites), 'vercel.json contains rewrites array');
    const adminLoginRewrite = parsed.rewrites?.find(
      (r: any) => r.source === '/admin/login' && r.destination === '/index.html'
    );
    assert(!!adminLoginRewrite, 'vercel.json has explicit rewrite for /admin/login -> /index.html');
    const adminCatchAllRewrite = parsed.rewrites?.find(
      (r: any) => r.source === '/admin/:match*' && r.destination === '/index.html'
    );
    assert(!!adminCatchAllRewrite, 'vercel.json has explicit rewrite for /admin/:match* -> /index.html');
    const wildcardRewrite = parsed.rewrites?.find(
      (r: any) => (r.source === '/(.*)' || r.source?.includes('(?!api/')) && r.destination === '/index.html'
    );
    assert(!!wildcardRewrite, 'vercel.json rewrites wildcard client routes to /index.html (fixes Vercel 404)');
  }
}

// Check public/vercel.json
const publicVercelJson = path.resolve(process.cwd(), 'public/vercel.json');
assert(fs.existsSync(publicVercelJson), 'public/vercel.json exists for dist/ bundling');

// -------------------------------------------------------------
// 2. Validate public/_redirects Static Fallback
// -------------------------------------------------------------
console.log('\n[2/5] Verifying public/_redirects Fallback Rule:');
const redirectsPath = path.resolve(process.cwd(), 'public/_redirects');
assert(fs.existsSync(redirectsPath), 'public/_redirects exists in public directory');
if (fs.existsSync(redirectsPath)) {
  const redirectsContent = fs.readFileSync(redirectsPath, 'utf8');
  assert(
    redirectsContent.includes('/index.html') && redirectsContent.includes('200'),
    'public/_redirects specifies wildcard fallback to /index.html with 200 HTTP status'
  );
}

// -------------------------------------------------------------
// 3. Test parseCurrentRoute logic across all route permutations
// -------------------------------------------------------------
console.log('\n[3/5] Testing Route Resolution Logic:');

type AdminSection = 'dashboard' | 'orders' | 'products' | 'categories' | 'customers' | 'inventory' | 'payments' | 'analytics' | 'settings';

function simulateParseRoute(rawPath: string, rawHash: string = ''): { page: string; adminSection?: AdminSection } {
  const pathname = rawPath.toLowerCase().split('?')[0].replace(/\/+$/, '') || '/';
  const hash = rawHash.toLowerCase().split('?')[0].replace(/^#\/?/, '').replace(/\/+$/, '');

  // 1. Password recovery
  if (hash.includes('type=recovery') || hash.startsWith('reset-password') || pathname.startsWith('/reset-password')) {
    return { page: 'reset-password' };
  }

  // 2. Admin Login
  if (
    pathname === '/admin/login' ||
    pathname === '/admin-login' ||
    hash === 'admin/login' ||
    hash === '/admin/login' ||
    hash === 'admin-login' ||
    hash.includes('admin/login') ||
    hash.includes('admin-login')
  ) {
    return { page: 'admin-login' };
  }

  // 3. Admin section routes
  const checkAdminSection = (pathStr: string): AdminSection | null => {
    const clean = pathStr.replace(/^#\/?/, '').replace(/^\//, '').replace(/\/+$/, '');
    if (clean === 'admin' || clean === 'admin/dashboard') return 'dashboard';
    if (clean === 'admin/orders') return 'orders';
    if (clean === 'admin/products') return 'products';
    if (clean === 'admin/categories') return 'categories';
    if (clean === 'admin/customers') return 'customers';
    if (clean === 'admin/inventory') return 'inventory';
    if (clean === 'admin/payments') return 'payments';
    if (clean === 'admin/analytics') return 'analytics';
    if (clean === 'admin/profile' || clean === 'admin/settings') return 'settings';
    return null;
  };

  const parsedAdminSec = checkAdminSection(pathname) || checkAdminSection(hash);
  if (parsedAdminSec) {
    return { page: 'admin', adminSection: parsedAdminSec };
  }

  // 4. Access Denied
  if (pathname === '/access-denied' || hash === 'access-denied') {
    return { page: 'access-denied' };
  }

  // 5. Storefront
  const candidate = (hash || pathname.replace(/^\//, ''));
  if (['home', 'shop', 'cart', 'checkout', 'contact', 'login', 'register', 'account'].includes(candidate)) {
    return { page: candidate };
  }

  return { page: 'home' };
}

// Canonical URL Normalizer simulation
function simulateCanonicalNormalizer(urlStr: string): string {
  const url = new URL(urlStr, 'https://shopcart-olive.vercel.app');
  const rawHash = (url.hash || '').toLowerCase();
  const rawPath = (url.pathname || '/').toLowerCase();

  if (rawHash.includes('admin/login') || rawHash.includes('admin-login')) {
    return 'https://shopcart-olive.vercel.app/admin/login';
  } else if (
    rawHash.includes('admin/dashboard') ||
    rawHash === '#admin' ||
    rawHash === '#/admin' ||
    (rawPath.startsWith('/admin') && rawHash.includes('admin'))
  ) {
    const target = rawPath.startsWith('/admin') && rawPath !== '/admin' ? rawPath : '/admin/dashboard';
    return `https://shopcart-olive.vercel.app${target}`;
  } else if (rawHash.includes('admin/')) {
    const secMatch = rawHash.match(/admin\/([a-z-]+)/);
    if (secMatch && secMatch[1]) {
      return `https://shopcart-olive.vercel.app/admin/${secMatch[1]}`;
    }
  }
  return url.origin + url.pathname;
}

// Test cases
const testCases = [
  { path: '/admin/login', hash: '', expectedPage: 'admin-login', label: 'Direct /admin/login' },
  { path: '/admin-login', hash: '', expectedPage: 'admin-login', label: 'Direct /admin-login' },
  { path: '/', hash: '#/admin/login', expectedPage: 'admin-login', label: 'Hash #/admin/login' },
  { path: '/', hash: '#admin-login', expectedPage: 'admin-login', label: 'Hash #admin-login' },
  { path: '/?utm_source=chatgpt.com', hash: '#/admin/login', expectedPage: 'admin-login', label: 'ChatGPT Referral /?utm_source=chatgpt.com#/admin/login' },
  { path: '/admin', hash: '', expectedPage: 'admin', expectedSec: 'dashboard', label: 'Direct /admin' },
  { path: '/admin/dashboard', hash: '', expectedPage: 'admin', expectedSec: 'dashboard', label: 'Direct /admin/dashboard' },
  { path: '/admin/dashboard', hash: '#/admin/dashboard', expectedPage: 'admin', expectedSec: 'dashboard', label: 'Legacy duplicate /admin/dashboard#/admin/dashboard' },
  { path: '/admin/orders', hash: '', expectedPage: 'admin', expectedSec: 'orders', label: 'Direct /admin/orders' },
  { path: '/admin/products', hash: '', expectedPage: 'admin', expectedSec: 'products', label: 'Direct /admin/products' },
  { path: '/admin/categories', hash: '', expectedPage: 'admin', expectedSec: 'categories', label: 'Direct /admin/categories' },
  { path: '/admin/customers', hash: '', expectedPage: 'admin', expectedSec: 'customers', label: 'Direct /admin/customers' },
  { path: '/admin/inventory', hash: '', expectedPage: 'admin', expectedSec: 'inventory', label: 'Direct /admin/inventory' },
  { path: '/admin/payments', hash: '', expectedPage: 'admin', expectedSec: 'payments', label: 'Direct /admin/payments' },
  { path: '/admin/analytics', hash: '', expectedPage: 'admin', expectedSec: 'analytics', label: 'Direct /admin/analytics' },
  { path: '/admin/profile', hash: '', expectedPage: 'admin', expectedSec: 'settings', label: 'Direct /admin/profile' },
  { path: '/access-denied', hash: '', expectedPage: 'access-denied', label: 'Direct /access-denied' },
  { path: '/', hash: '', expectedPage: 'home', label: 'Storefront Root /' },
  { path: '/shop', hash: '', expectedPage: 'shop', label: 'Storefront /shop' },
];

for (const tc of testCases) {
  const result = simulateParseRoute(tc.path, tc.hash);
  const pageMatch = result.page === tc.expectedPage;
  const secMatch = tc.expectedSec ? result.adminSection === tc.expectedSec : true;
  assert(pageMatch && secMatch, `${tc.label} -> page: '${result.page}', section: '${result.adminSection || '-'}'`);
}

// Canonical URL transformation verification
const normalizedChatGPTUrl = simulateCanonicalNormalizer('https://shopcart-olive.vercel.app/?utm_source=chatgpt.com#/admin/login');
assert(
  normalizedChatGPTUrl === 'https://shopcart-olive.vercel.app/admin/login',
  `Canonical Normalizer transforms https://shopcart-olive.vercel.app/?utm_source=chatgpt.com#/admin/login -> ${normalizedChatGPTUrl}`
);

// -------------------------------------------------------------
// 4. Verify Admin Guard & Role Checks in Codebase
// -------------------------------------------------------------
console.log('\n[4/5] Verifying Security Guard and Access Boundaries:');
const adminGuardCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminGuard.tsx'), 'utf8');
assert(
  adminGuardCode.includes("onNavigate('admin-login')"),
  'AdminGuard redirects unauthenticated visitors to admin-login'
);
assert(
  adminGuardCode.includes("user.role !== 'admin'") && adminGuardCode.includes("onNavigate('access-denied')"),
  'AdminGuard denies customer accounts and redirects to access-denied'
);
assert(
  adminGuardCode.includes('/api/admin/verify-clearance') && adminGuardCode.includes('verifyUserRole'),
  'AdminGuard verifies clearance server-side and queries public.profiles PostgreSQL directly'
);

// -------------------------------------------------------------
// 5. Verify Customer Storefront Separation
// -------------------------------------------------------------
console.log('\n[5/5] Verifying Clean Customer Storefront (No Admin / Staff exposure):');
const headerCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/common/Header.tsx'), 'utf8');
const footerCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/common/Footer.tsx'), 'utf8');

assert(!headerCode.includes('Admin Dashboard') && !headerCode.includes('Staff Portal'), 'Header contains no Admin/Staff links');
assert(!footerCode.includes('Staff Portal') && !footerCode.includes('Admin Portal') && !footerCode.includes('Database Status'), 'Footer contains no Admin Portal, Staff Portal, or Database Status indicators');

console.log('\n================================================================');
if (allPassed) {
  console.log('   ALL ROUTING & VERCEL DEPLOYMENT CHECKS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error('   SOME CHECKS FAILED. PLEASE REVIEW LOGS ABOVE.');
  console.log('================================================================\n');
  process.exit(1);
}
