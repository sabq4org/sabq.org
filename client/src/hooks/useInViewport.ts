import { useState, useEffect, useRef, RefObject } from 'react';

interface UseInViewportOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

export function useInViewport<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewportOptions = {}
): [RefObject<T>, boolean] {
  const { threshold = 0, rootMargin = '100px', once = true } = options;
  const ref = useRef<T>(null);
  const [isInViewport, setIsInViewport] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (isInViewport && once) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInViewport(true);
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          setIsInViewport(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, once, isInViewport]);

  return [ref, isInViewport];
}
