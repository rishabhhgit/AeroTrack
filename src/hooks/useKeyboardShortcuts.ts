import { useEffect } from 'react';

export const useKeyboardShortcuts = (shortcuts: Record<string, () => void>) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key: string[] = [];
      if (e.ctrlKey) key.push('ctrl');
      if (e.shiftKey) key.push('shift');
      if (e.altKey) key.push('alt');
      if (e.metaKey) key.push('meta');
      const mainKey = e.key.toLowerCase();
      if (!['control', 'shift', 'alt', 'meta'].includes(mainKey)) {
        key.push(mainKey);
      }
      const combo = key.join('+');
      if (shortcuts[combo]) {
        e.preventDefault();
        shortcuts[combo]();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};
