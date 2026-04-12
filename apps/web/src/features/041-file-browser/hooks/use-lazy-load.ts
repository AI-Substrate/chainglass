/**
 * useLazyLoad — IntersectionObserver hook for lazy loading gallery cards.
 *
 * Returns a ref to attach to the card element and a boolean indicating
 * whether the element is (or has been) visible in the viewport.
 * Once visible, stays true (no unloading).
 *
 * Plan 077: Folder Content Preview (T002)
 */

'use client';

import { useEffect, useRef, useState } from 'react';

export interface UseLazyLoadOptions {
  rootMargin?: string;
  threshold?: number;
}

export function useLazyLoad(options: UseLazyLoadOptions = {}) {
  const { rootMargin = '200px', threshold = 0 } = options;
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, threshold, isVisible]);

  return { ref, isVisible };
}
