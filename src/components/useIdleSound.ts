'use client';

import { useEffect } from 'react';
import { IDLE_MS, playIdleSound, preloadRollSounds, stopIdleSound, unlockRollAudio } from './rollAudio';

/**
 * Plays the idle sound once after the visitor has been on another tab for IDLE_MS, to call them back, and stops it when
 * they return. Browsers only allow sound after the visitor has clicked or typed, so the first click/key also unlocks audio
 * (unless the visitor switched sound off).
 */
export function useIdleSound() {
  useEffect(() => {
    void preloadRollSounds();
    let timer: number | undefined;
    const onUnlock = () => unlockRollAudio();
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (document.hidden) timer = window.setTimeout(() => { playIdleSound(); }, IDLE_MS);
      else stopIdleSound();
    };
    window.addEventListener('pointerdown', onUnlock, { passive: true, capture: true });
    window.addEventListener('keydown', onUnlock, { capture: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onUnlock, { capture: true });
      window.removeEventListener('keydown', onUnlock, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      stopIdleSound();
    };
  }, []);
}
