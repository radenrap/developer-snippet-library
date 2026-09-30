import type { ToasterProps } from 'sonner';
import { Toaster as Sonner } from 'sonner';

/**
 * Provider toast (sonner).
 *
 * Versi bawaan shadcn membaca tema lewat `next-themes`. Aplikasi Vite ini tidak
 * memakai ThemeProvider, jadi tema di-set eksplisit ke "dark" (index.html
 * memasang class `dark` pada <html>) dan next-themes tidak diperlukan.
 */
export function Toaster(props: ToasterProps) {
  return <Sonner theme="dark" position="top-right" className="toaster group" {...props} />;
}
