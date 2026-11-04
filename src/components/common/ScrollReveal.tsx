import React, { useEffect, useRef, useState } from 'react';

export type AnimationType = 'fade-up' | 'fade-in' | 'slide-left' | 'slide-right' | 'zoom-in';

interface ScrollRevealProps {
  children: React.ReactNode;
  animation?: AnimationType;
  delay?: number; // Delay in milliseconds
  duration?: number; // Duration in milliseconds
  threshold?: number;
  className?: string;
  as?: React.ElementType;
}

export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  animation = 'fade-up',
  delay = 0,
  duration = 550,
  threshold = 0.12,
  className = '',
  as: Component = 'div',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // If user prefers reduced motion, render immediately without animations
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mediaQuery.matches) {
        setIsVisible(true);
        return;
      }
    }

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (elementRef.current) {
              observer.unobserve(elementRef.current);
            }
          }
        });
      },
      {
        threshold,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    const el = elementRef.current;
    if (el) {
      observer.observe(el);
    }

    return () => {
      if (el) {
        observer.unobserve(el);
      }
    };
  }, [threshold]);

  const getInitialStyle = (): React.CSSProperties => {
    const baseTransition = `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`;

    if (isVisible) {
      return {
        opacity: 1,
        transform: 'none',
        transition: baseTransition,
        willChange: 'opacity, transform',
      };
    }

    let transform = 'none';
    switch (animation) {
      case 'fade-up':
        transform = 'translate3d(0, 24px, 0)';
        break;
      case 'slide-left':
        transform = 'translate3d(-28px, 0, 0)';
        break;
      case 'slide-right':
        transform = 'translate3d(28px, 0, 0)';
        break;
      case 'zoom-in':
        transform = 'scale3d(0.95, 0.95, 1)';
        break;
      case 'fade-in':
      default:
        transform = 'none';
        break;
    }

    return {
      opacity: 0,
      transform,
      transition: baseTransition,
      willChange: 'opacity, transform',
    };
  };

  return (
    <Component
      ref={elementRef as any}
      style={getInitialStyle()}
      className={className}
    >
      {children}
    </Component>
  );
};
