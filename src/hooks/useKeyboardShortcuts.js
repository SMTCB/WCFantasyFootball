import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export function useKeyboardShortcuts(onHelpOpen) {
  const navigate = useNavigate();
  const lastKeyRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip shortcuts when typing in input/textarea
      if (e.target.matches('input, textarea, [contenteditable="true"]')) return;

      // ? for help (single key)
      if (e.key === '?') {
        e.preventDefault();
        if (onHelpOpen) onHelpOpen();
        return;
      }

      // g + letter combo (with timeout for sequence)
      if (e.key === 'g' || e.key === 'G') {
        lastKeyRef.current = 'g';
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          lastKeyRef.current = null;
        }, 800);
        return;
      }

      // If last key was 'g', process the combo
      if (lastKeyRef.current === 'g') {
        lastKeyRef.current = null;
        clearTimeout(timeoutRef.current);

        const key = e.key.toLowerCase();
        if (key === 's') {
          e.preventDefault();
          navigate('/');
        } else if (key === 'l') {
          e.preventDefault();
          navigate('/league');
        } else if (key === 'm') {
          e.preventDefault();
          navigate('/market');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeoutRef.current);
    };
  }, [navigate, onHelpOpen]);
}
