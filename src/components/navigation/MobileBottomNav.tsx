import React from 'react';
import {
  Play,
  LayoutGrid,
  Home,
  ShoppingCart,
  User,
} from 'lucide-react';
import { PageView } from '../../types';
import { useCart } from '../../context/CartContext';

interface MobileBottomNavProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentPage,
  onNavigate,
}) => {
  const { cartCount } = useCart();

  // Hidden on admin pages, login/register or desktop (md:hidden)
  const isAdminOrAuth =
    currentPage === 'admin' ||
    currentPage === 'admin-login' ||
    currentPage === 'access-denied';

  if (isAdminOrAuth) {
    return null;
  }

  // 5 exact items ordered left-to-right: Play | Categories | Home | Cart | Account
  const navItems = [
    {
      id: 'play' as PageView,
      label: 'Play',
      icon: Play,
      badge: null,
      isCenter: false,
    },
    {
      id: 'categories' as PageView,
      label: 'Categories',
      icon: LayoutGrid,
      badge: null,
      isCenter: false,
    },
    {
      id: 'home' as PageView,
      label: 'Home',
      icon: Home,
      badge: null,
      isCenter: true,
    },
    {
      id: 'cart' as PageView,
      label: 'Cart',
      icon: ShoppingCart,
      badge: cartCount > 0 ? (cartCount > 99 ? '99+' : cartCount) : null,
      isCenter: false,
    },
    {
      id: 'account' as PageView,
      label: 'Account',
      icon: User,
      badge: null,
      isCenter: false,
    },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="grid grid-cols-5 h-14 items-center px-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const IconComponent = item.icon;

          if (item.isCenter) {
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="relative flex flex-col items-center justify-center -mt-4 group cursor-pointer focus:outline-none"
                aria-label={item.label}
              >
                {/* Visual Emphasis Elevated Center Ring */}
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
                    isActive
                      ? 'bg-[#2874f0] text-white shadow-[#2874f0]/30 scale-105'
                      : 'bg-white text-slate-700 border-2 border-[#2874f0] hover:bg-blue-50'
                  }`}
                >
                  <IconComponent className={`w-5 h-5 stroke-[2.2] transition-transform ${isActive ? 'scale-110' : ''}`} />
                </div>
                <span
                  className={`text-[10px] font-bold mt-0.5 tracking-tight transition-colors ${
                    isActive ? 'text-[#2874f0]' : 'text-slate-600'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="relative flex flex-col items-center justify-center py-1 transition-colors duration-150 cursor-pointer focus:outline-none"
              aria-label={item.label}
            >
              <div className="relative">
                <IconComponent
                  className={`w-5 h-5 stroke-[1.8] transition-all duration-200 ${
                    isActive
                      ? 'text-[#2874f0] stroke-[2.4] scale-110'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                />
                {/* Dynamic count badge for Cart */}
                {item.badge !== null && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 bg-[#ff6161] text-white font-black text-[9px] rounded-full flex items-center justify-center shadow-xs animate-in zoom-in-75">
                    {item.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-semibold tracking-tight transition-colors mt-0.5 ${
                  isActive ? 'text-[#2874f0] font-bold' : 'text-slate-500'
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-6 h-0.5 bg-[#2874f0] rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
