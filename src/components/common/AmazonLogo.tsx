import React from 'react';

interface ShopCartLogoProps {
  className?: string;
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
}

export const AmazonLogo: React.FC<ShopCartLogoProps> = ({
  className = '',
  variant = 'dark',
  size = 'md',
}) => {
  const isDark = variant === 'dark';
  const primaryTextColor = isDark ? '#111827' : '#ffffff';
  const greenAccent = '#0b5c37';
  const lightGreen = '#10b981';

  const heightMap = {
    sm: 'h-6',
    md: 'h-8 sm:h-9',
    lg: 'h-10 sm:h-12',
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 select-none cursor-pointer ${heightMap[size]} ${className}`}
      aria-label="Shop Cart"
    >
      <svg
        viewBox="0 0 155 38"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto"
      >
        {/* Shopping Cart Bag / Cart Glyph */}
        <path
          d="M 6 12 L 11 12 L 15 26 L 27 26 L 30 15 L 13 15"
          stroke={isDark ? greenAccent : lightGreen}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="17"
          cy="29"
          r="2"
          fill={isDark ? greenAccent : lightGreen}
        />
        <circle
          cx="25"
          cy="29"
          r="2"
          fill={isDark ? greenAccent : lightGreen}
        />

        {/* "shop" text */}
        <text
          x="35"
          y="24"
          fill={primaryTextColor}
          fontSize="21"
          fontWeight="800"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="-0.5px"
        >
          shop
        </text>

        {/* "cart" text */}
        <text
          x="83"
          y="24"
          fill={isDark ? greenAccent : lightGreen}
          fontSize="21"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="-0.5px"
        >
          cart
        </text>

        {/* Green curved upward smile / swoosh under "shop cart" */}
        <path
          d="M 40 31 C 70 37, 105 37, 126 29"
          stroke={isDark ? greenAccent : lightGreen}
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Green arrow tip */}
        <path
          d="M 122 26 L 129 29.5 L 125 34 Z"
          fill={isDark ? greenAccent : lightGreen}
        />

        {/* .in subscript */}
        <text
          x="129"
          y="20"
          fill={isDark ? '#6b7280' : '#9ca3af'}
          fontSize="10"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          .in
        </text>
      </svg>
    </div>
  );
};

export const ShopCartLogo = AmazonLogo;
