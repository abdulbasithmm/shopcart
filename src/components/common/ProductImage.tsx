import React from 'react';
import { Product } from '../../types';

interface ProductImageProps {
  product: Product;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showBadge?: boolean;
  selectedColor?: string;
  imageUrl?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  product,
  className = '',
  size = 'md',
  showBadge = true,
  selectedColor,
  imageUrl,
}) => {
  const [imgError, setImgError] = React.useState(false);
  const activeColor = selectedColor || product.colors?.[0]?.hex || '#0f172a';
  const effectiveImageUrl = !imgError ? (imageUrl || (product.images && product.images[0]) || product.image) : null;

  // Specific bespoke vector art for each product category & type
  const renderVisual = () => {
    switch (product.visualType) {
      // 1. TWS Wireless Earbuds (boAt Airdopes 141 Pro)
      case 'earbuds':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            <defs>
              <linearGradient id="earbud-case" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="60%" stopColor="#f1f5f9" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>
              <linearGradient id="earbud-stem" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#cbd5e1" />
              </linearGradient>
            </defs>
            {/* Open Charging Case Base */}
            <path
              d="M 60 100 C 60 90, 72 88, 100 88 C 128 88, 140 90, 140 100 L 140 135 C 140 160, 126 172, 100 172 C 74 172, 60 160, 60 135 Z"
              fill="url(#earbud-case)"
              stroke="#cbd5e1"
              strokeWidth="2"
            />
            {/* Open Case Cavity */}
            <ellipse cx="100" cy="98" rx="35" ry="12" fill="#0f172a" />
            <ellipse cx="100" cy="99" rx="33" ry="10" fill="#1e293b" />
            <circle cx="85" cy="99" r="8" fill="#090d16" />
            <circle cx="115" cy="99" r="8" fill="#090d16" />

            {/* Left Earbud standing up */}
            <g transform="translate(72, 40)">
              {/* Stem */}
              <rect x="10" y="30" width="8" height="42" rx="4" fill="url(#earbud-stem)" stroke="#cbd5e1" strokeWidth="1" />
              {/* Earbud head & silicon tip */}
              <circle cx="14" cy="24" r="14" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
              <ellipse cx="8" cy="24" rx="7" ry="10" fill="#e2e8f0" />
              <circle cx="14" cy="22" r="3" fill="#3b82f6" opacity="0.8" />
              {/* Charging contacts */}
              <circle cx="14" cy="68" r="1.5" fill="#d97706" />
            </g>

            {/* Right Earbud standing up */}
            <g transform="translate(104, 40)">
              {/* Stem */}
              <rect x="10" y="30" width="8" height="42" rx="4" fill="url(#earbud-stem)" stroke="#cbd5e1" strokeWidth="1" />
              {/* Earbud head & silicon tip */}
              <circle cx="14" cy="24" r="14" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
              <ellipse cx="20" cy="24" rx="7" ry="10" fill="#e2e8f0" />
              <circle cx="14" cy="22" r="3" fill="#3b82f6" opacity="0.8" />
              {/* Charging contacts */}
              <circle cx="14" cy="68" r="1.5" fill="#d97706" />
            </g>

            {/* LED Status Indicator on case */}
            <circle cx="100" cy="130" r="2.5" fill="#10b981" />
            <text x="100" y="148" fill="#94a3b8" fontSize="7" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">boAt</text>
          </svg>
        );

      // 2. Smartwatch (Noise ColorFit Pro 4 - Green / Slate)
      case 'smartwatch':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            <defs>
              <linearGradient id="smartwatch-strap" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1e3a2b" />
                <stop offset="50%" stopColor="#2d5a42" />
                <stop offset="100%" stopColor="#1e3a2b" />
              </linearGradient>
              <linearGradient id="watch-case-bezel" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#475569" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
            </defs>
            {/* Top strap */}
            <path d="M 76 15 L 124 15 L 120 65 L 80 65 Z" fill="url(#smartwatch-strap)" rx="4" />
            {/* Bottom strap with pin buckle holes */}
            <path d="M 80 135 L 120 135 L 124 185 L 76 185 Z" fill="url(#smartwatch-strap)" rx="4" />
            <circle cx="100" cy="150" r="2.5" fill="#0f172a" />
            <circle cx="100" cy="162" r="2.5" fill="#0f172a" />
            <circle cx="100" cy="174" r="2.5" fill="#0f172a" />

            {/* Watch Bezel Case */}
            <rect x="64" y="56" width="72" height="88" rx="22" fill="url(#watch-case-bezel)" stroke="#64748b" strokeWidth="2" />
            {/* Crown button */}
            <rect x="136" y="80" width="5" height="16" rx="2" fill="#94a3b8" />

            {/* AMOLED Screen */}
            <rect x="70" y="62" width="60" height="76" rx="16" fill="#020617" />

            {/* Smartwatch UI Display (10:09 clock matching screenshot!) */}
            <text x="100" y="92" fill="#ffffff" fontSize="20" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">10</text>
            <text x="100" y="112" fill="#ffffff" fontSize="20" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">09</text>
            {/* Activity rings */}
            <circle cx="83" cy="126" r="5" stroke="#ef4444" strokeWidth="2" fill="none" />
            <circle cx="100" cy="126" r="5" stroke="#10b981" strokeWidth="2" fill="none" />
            <circle cx="117" cy="126" r="5" stroke="#06b6d4" strokeWidth="2" fill="none" />
          </svg>
        );

      // 3. Backpack (Safari Fusion Backpack For Travel & Laptop)
      case 'backpack':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            <defs>
              <linearGradient id="backpack-fabric" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="50%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#020617" />
              </linearGradient>
            </defs>
            {/* Top carrying handle */}
            <path d="M 85 45 C 85 30, 115 30, 115 45" stroke="#334155" strokeWidth="6" strokeLinecap="round" />
            {/* Main backpack body */}
            <path
              d="M 62 70 C 62 48, 80 42, 100 42 C 120 42, 138 48, 138 70 L 144 155 C 144 172, 134 178, 100 178 C 66 178, 56 172, 56 155 Z"
              fill="url(#backpack-fabric)"
              stroke="#334155"
              strokeWidth="2"
            />
            {/* Front Zip Pocket Curve */}
            <path
              d="M 68 110 C 68 95, 82 92, 100 92 C 118 92, 132 95, 132 110 L 134 165 C 134 172, 126 174, 100 174 C 74 174, 66 172, 66 165 Z"
              fill="#1e293b"
              stroke="#475569"
              strokeWidth="1.5"
            />
            {/* Zipper Lines */}
            <path d="M 70 80 Q 100 74 130 80" stroke="#64748b" strokeWidth="2" strokeDasharray="3 2" />
            <path d="M 74 112 Q 100 106 126 112" stroke="#64748b" strokeWidth="2" strokeDasharray="3 2" />
            {/* Safari Brand Badge */}
            <rect x="92" y="142" width="16" height="6" rx="2" fill="#ea580c" />
            <text x="100" y="146.5" fill="#ffffff" fontSize="4" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">SAFARI</text>
            {/* Side water bottle mesh */}
            <path d="M 54 125 L 56 155 C 56 162, 60 164, 64 164 L 62 125 Z" fill="#0f172a" stroke="#334155" strokeWidth="1" />
          </svg>
        );

      // 4. Running Shoes (Sparx Men's Running Shoes - Navy Blue & White)
      case 'shoes':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            <defs>
              <linearGradient id="shoe-navy" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e3a8a" />
                <stop offset="50%" stopColor="#172554" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
            </defs>
            {/* Back shoe shadow / pair */}
            <path
              d="M 50 115 C 60 85, 95 90, 110 105 L 140 120 C 145 125, 135 135, 120 135 L 55 135 Z"
              fill="#0f172a"
              opacity="0.4"
            />
            {/* Front Shoe Upper */}
            <path
              d="M 40 120 C 40 100, 60 92, 75 92 C 85 92, 95 102, 110 112 L 155 126 C 168 130, 172 138, 168 144 L 40 144 Z"
              fill="url(#shoe-navy)"
              stroke="#1e3a8a"
              strokeWidth="1.5"
            />
            {/* White Aerodynamic Sole */}
            <path
              d="M 36 142 L 170 142 C 172 145, 170 152, 162 155 L 42 155 C 34 155, 34 146, 36 142 Z"
              fill="#ffffff"
              stroke="#cbd5e1"
              strokeWidth="1.5"
            />
            <path d="M 50 150 Q 100 146 155 150" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
            {/* Laces & Eyelets */}
            <path d="M 78 98 L 88 106 M 84 94 L 94 102 M 90 90 L 100 98" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            {/* Sparx Sporty Side Swoosh */}
            <path d="M 70 122 Q 105 110 135 128" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
        );

      // 5. Pressure Cooker (Prestige Deluxe Alpha Pressure Cooker)
      case 'cooker':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            <defs>
              <linearGradient id="steel-body" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#e2e8f0" />
                <stop offset="35%" stopColor="#ffffff" />
                <stop offset="70%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#94a3b8" />
              </linearGradient>
            </defs>
            {/* Pressure Weight Valve on Lid */}
            <rect x="96" y="58" width="8" height="14" rx="2" fill="#0f172a" />
            <circle cx="100" cy="56" r="3" fill="#cbd5e1" />

            {/* Lid Dome */}
            <path
              d="M 68 85 C 68 70, 132 70, 132 85 Z"
              fill="url(#steel-body)"
              stroke="#94a3b8"
              strokeWidth="1.5"
            />
            <rect x="64" y="84" width="72" height="6" rx="2" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />

            {/* Main Cooker Body */}
            <path
              d="M 66 90 L 134 90 L 130 148 C 130 162, 118 168, 100 168 C 82 168, 70 162, 70 148 Z"
              fill="url(#steel-body)"
              stroke="#94a3b8"
              strokeWidth="2"
            />
            {/* Induction Base Rim */}
            <rect x="74" y="164" width="52" height="6" rx="2" fill="#475569" />

            {/* Long Bakelite Black Handle (Right) */}
            <path d="M 132 86 L 175 86 C 182 86, 184 96, 175 96 L 132 96 Z" fill="#0f172a" />
            <circle cx="170" cy="91" r="2.5" fill="#e2e8f0" />

            {/* Body Handle Left */}
            <path d="M 68 96 L 50 96 C 45 96, 45 108, 50 108 L 68 108 Z" fill="#0f172a" />

            {/* Prestige Red Brand Badge */}
            <rect x="85" y="116" width="30" height="12" rx="3" fill="#dc2626" />
            <text x="100" y="125" fill="#ffffff" fontSize="5.5" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">Prestige</text>
          </svg>
        );

      // 6. Kitchen Blender (Hero Section Philips Forest Green Blender)
      case 'blender':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            <defs>
              <linearGradient id="blender-base" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1e3a2b" />
                <stop offset="50%" stopColor="#2d5a42" />
                <stop offset="100%" stopColor="#1e3a2b" />
              </linearGradient>
              <linearGradient id="glass-jar" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.4" />
                <stop offset="30%" stopColor="#ffffff" stopOpacity="0.8" />
                <stop offset="70%" stopColor="#f1f5f9" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0.6" />
              </linearGradient>
            </defs>
            {/* Blender Lid */}
            <rect x="82" y="28" width="36" height="8" rx="3" fill="#1e3a2b" />
            <circle cx="100" cy="26" r="4" fill="#0f172a" />

            {/* Glass Jar Body */}
            <path
              d="M 80 36 L 120 36 L 114 115 L 86 115 Z"
              fill="url(#glass-jar)"
              stroke="#94a3b8"
              strokeWidth="1.5"
            />
            {/* Measuring Marks */}
            <line x1="88" y1="55" x2="96" y2="55" stroke="#64748b" strokeWidth="1" />
            <line x1="88" y1="70" x2="100" y2="70" stroke="#64748b" strokeWidth="1" />
            <line x1="88" y1="85" x2="96" y2="85" stroke="#64748b" strokeWidth="1" />
            <line x1="88" y1="100" x2="100" y2="100" stroke="#64748b" strokeWidth="1" />

            {/* Handle on right */}
            <path d="M 118 45 C 132 45, 134 105, 114 105" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" fill="none" />

            {/* Green Motor Base */}
            <path
              d="M 84 115 L 116 115 L 122 175 L 78 175 Z"
              fill="url(#blender-base)"
              stroke="#1e3a2b"
              strokeWidth="2"
            />
            {/* Rotary Speed Dial */}
            <circle cx="100" cy="144" r="10" fill="#0f172a" stroke="#cbd5e1" strokeWidth="1.5" />
            <circle cx="100" cy="144" r="4" fill="#cbd5e1" />
            <text x="100" y="166" fill="#cbd5e1" fontSize="5" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">PHILIPS</text>
          </svg>
        );

      // 7. Mobile Phone
      case 'mobile':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            <rect x="68" y="25" width="64" height="150" rx="14" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
            <rect x="72" y="30" width="56" height="140" rx="10" fill="url(#mobile-screen)" />
            <defs>
              <linearGradient id="mobile-screen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
            </defs>
            {/* Punch hole camera */}
            <circle cx="100" cy="38" r="3" fill="#0f172a" />
            {/* Home bar */}
            <rect x="88" y="164" width="24" height="2" rx="1" fill="#ffffff" opacity="0.8" />
          </svg>
        );

      // 8. Laptop
      case 'laptop':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            <defs>
              <linearGradient id="laptop-screen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ec4899" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
            {/* Screen Lid */}
            <rect x="45" y="45" width="110" height="75" rx="6" fill="#0f172a" stroke="#64748b" strokeWidth="2" />
            <rect x="50" y="50" width="100" height="65" rx="3" fill="url(#laptop-screen)" />
            <circle cx="100" cy="48" r="1.5" fill="#94a3b8" />
            {/* Keyboard Base */}
            <path d="M 30 120 L 170 120 L 160 148 L 40 148 Z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1.5" />
            <rect x="85" y="124" width="30" height="2" rx="1" fill="#64748b" />
          </svg>
        );

      // 9. Teddy Bear (Toys & Games)
      case 'toys':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            {/* Ears */}
            <circle cx="70" cy="55" r="16" fill="#b45309" />
            <circle cx="70" cy="55" r="9" fill="#fde68a" />
            <circle cx="130" cy="55" r="16" fill="#b45309" />
            <circle cx="130" cy="55" r="9" fill="#fde68a" />
            {/* Head */}
            <circle cx="100" cy="80" r="32" fill="#d97706" />
            {/* Muzzle */}
            <ellipse cx="100" cy="90" rx="16" ry="12" fill="#fef3c7" />
            <ellipse cx="100" cy="86" rx="6" ry="4" fill="#451a03" />
            <line x1="100" y1="90" x2="100" y2="96" stroke="#451a03" strokeWidth="2" strokeLinecap="round" />
            {/* Eyes */}
            <circle cx="88" cy="76" r="4" fill="#0f172a" />
            <circle cx="112" cy="76" r="4" fill="#0f172a" />
            {/* Body */}
            <ellipse cx="100" cy="135" rx="36" ry="38" fill="#d97706" />
            <ellipse cx="100" cy="136" rx="24" ry="26" fill="#fde68a" />
            {/* Paws */}
            <circle cx="60" cy="150" r="14" fill="#b45309" />
            <circle cx="140" cy="150" r="14" fill="#b45309" />
          </svg>
        );

      // 10. Sports (Soccer Ball)
      case 'sports':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            <circle cx="100" cy="100" r="54" fill="#ffffff" stroke="#0f172a" strokeWidth="3" />
            {/* Central Pentagon */}
            <polygon points="100,82 118,95 111,116 89,116 82,95" fill="#0f172a" />
            {/* Seams & surrounding patches */}
            <line x1="100" y1="82" x2="100" y2="58" stroke="#0f172a" strokeWidth="2.5" />
            <line x1="118" y1="95" x2="142" y2="86" stroke="#0f172a" strokeWidth="2.5" />
            <line x1="111" y1="116" x2="132" y2="136" stroke="#0f172a" strokeWidth="2.5" />
            <line x1="89" y1="116" x2="68" y2="136" stroke="#0f172a" strokeWidth="2.5" />
            <line x1="82" y1="95" x2="58" y2="86" stroke="#0f172a" strokeWidth="2.5" />
          </svg>
        );

      // 11. Beauty (Bottles)
      case 'beauty':
      case 'serum':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            {/* Pump Bottle 1 (Green) */}
            <rect x="65" y="60" width="30" height="95" rx="8" fill="#065f46" stroke="#047857" strokeWidth="1.5" />
            <rect x="75" y="44" width="10" height="16" fill="#cbd5e1" />
            <path d="M 72 44 L 88 44 L 86 36 L 68 38 Z" fill="#0f172a" />
            <rect x="70" y="85" width="20" height="40" rx="2" fill="#ffffff" opacity="0.9" />

            {/* Jar Bottle 2 (Amber) */}
            <rect x="105" y="90" width="40" height="65" rx="10" fill="#d97706" stroke="#b45309" strokeWidth="1.5" />
            <rect x="102" y="78" width="46" height="12" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
            <rect x="112" y="105" width="26" height="30" rx="2" fill="#ffffff" opacity="0.9" />
          </svg>
        );

      // 12. Green Armchair (Home & Kitchen)
      case 'chair':
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            {/* Wooden legs */}
            <line x1="68" y1="145" x2="60" y2="175" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
            <line x1="132" y1="145" x2="140" y2="175" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
            {/* Sofa back cushion */}
            <rect x="58" y="75" width="84" height="60" rx="14" fill="#065f46" stroke="#047857" strokeWidth="2" />
            {/* Tufting buttons */}
            <circle cx="80" cy="95" r="2.5" fill="#022c22" />
            <circle cx="100" cy="95" r="2.5" fill="#022c22" />
            <circle cx="120" cy="95" r="2.5" fill="#022c22" />
            {/* Seat cushion */}
            <rect x="52" y="115" width="96" height="32" rx="10" fill="#047857" stroke="#022c22" strokeWidth="1.5" />
            {/* Armrests */}
            <rect x="42" y="100" width="16" height="40" rx="8" fill="#065f46" stroke="#047857" strokeWidth="1.5" />
            <rect x="142" y="100" width="16" height="40" rx="8" fill="#065f46" stroke="#047857" strokeWidth="1.5" />
          </svg>
        );

      // Headphones (Cream / Beige Studio Edition from Hero Banner)
      case 'headphones':
      default:
        return (
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md" fill="none">
            <defs>
              <linearGradient id="headband-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e2e8f0" />
                <stop offset="50%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#94a3b8" />
              </linearGradient>
            </defs>
            {/* Headband arch */}
            <path
              d="M 50 110 C 50 45, 150 45, 150 110"
              stroke="url(#headband-grad)"
              strokeWidth="14"
              strokeLinecap="round"
            />
            {/* Inner cushion */}
            <path
              d="M 58 95 C 60 58, 140 58, 142 95"
              stroke="#f1f5f9"
              strokeWidth="6"
              strokeLinecap="round"
            />
            {/* Left Fork */}
            <path d="M 46 100 L 46 125" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
            <path d="M 154 100 L 154 125" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
            {/* Left Earcup */}
            <rect x="36" y="112" width="22" height="48" rx="10" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
            <rect x="42" y="118" width="10" height="36" rx="5" fill="#e2e8f0" />
            {/* Right Earcup */}
            <rect x="142" y="112" width="22" height="48" rx="10" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
            <rect x="148" y="118" width="10" height="36" rx="5" fill="#e2e8f0" />
            {/* Gold acoustic ring */}
            <circle cx="47" cy="136" r="3" fill="#d97706" />
            <circle cx="153" cy="136" r="3" fill="#d97706" />
          </svg>
        );
    }
  };

  const sizeClasses = {
    sm: 'h-28',
    md: 'h-44 md:h-52',
    lg: 'h-60 md:h-72',
    xl: 'h-72 md:h-88',
  };

  return (
    <div
      className={`relative w-full ${sizeClasses[size]} bg-white rounded-lg overflow-hidden flex items-center justify-center p-3 transition-transform duration-200 group-hover:scale-[1.02] ${className}`}
    >
      {/* Inner visual canvas */}
      <div className="w-full h-full flex items-center justify-center">
        {effectiveImageUrl ? (
          <img
            src={effectiveImageUrl}
            alt={product.name}
            className="w-full h-full object-contain select-none"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          renderVisual()
        )}
      </div>
    </div>
  );
};
