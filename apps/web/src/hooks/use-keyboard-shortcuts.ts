import { useEffect } from 'react';

interface KeyboardShortcutHandlers {
  onFocusSearch: () => void;
  onCreate: () => void;
}

/**
 * Shortcut keyboard global:
 *   `/`            -> fokus ke kolom pencarian
 *   `Cmd/Ctrl + K` -> buka dialog buat snippet
 *
 * `/` diabaikan ketika pengguna sedang mengetik di input/textarea/contenteditable
 * agar tidak mencuri karakter. `Cmd/Ctrl+K` tetap aktif di mana pun, dan
 * `preventDefault()` dipakai karena browser memakai kombinasi itu untuk fokus
 * ke address bar / pencarian.
 */
export function useKeyboardShortcuts({ onFocusSearch, onCreate }: KeyboardShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isTyping =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onCreate();

        return;
      }

      if (event.key === '/' && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onFocusSearch();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCreate, onFocusSearch]);
}
