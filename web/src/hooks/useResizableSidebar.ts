/**
 * @file      useResizableSidebar.ts – ziehbare Sidebar-Breite (Standard 40 %, gespeichert in localStorage)
 * @layer     Web · View-Hilfe
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'planner.sidebarRatio';
const DEFAULT_RATIO = 0.4;
const MIN_PX = 320;
const MAX_RATIO = 0.7;

function readRatio(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 && v < 1 ? v : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}

export function useResizableSidebar() {
  const [ratio, setRatio] = useState(readRatio);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const w = window.innerWidth;
      const px = Math.min(Math.max(e.clientX, MIN_PX), w * MAX_RATIO);
      setRatio(px / w);
    };
    const up = () => setDragging(false);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging]);

  useEffect(() => {
    if (dragging) return;
    try { localStorage.setItem(KEY, String(ratio)); } catch { /* ignore */ }
  }, [ratio, dragging]);

  const startDrag = useCallback((e: React.PointerEvent) => { e.preventDefault(); setDragging(true); }, []);
  const reset = useCallback(() => setRatio(DEFAULT_RATIO), []);

  return { width: `max(${MIN_PX}px, ${(ratio * 100).toFixed(2)}vw)`, dragging, startDrag, reset };
}
