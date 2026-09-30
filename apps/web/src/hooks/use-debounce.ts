import { useEffect, useState } from 'react';

/**
 * Menunda perubahan nilai selama `delay` ms.
 * Dipakai search bar supaya tiap ketikan tidak memicu request ke API.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}
