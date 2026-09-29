'use client';

import { useEffect } from 'react';
import { IDLE_MS, playIdleSound, preloadRollSounds, stopIdleSound, unlockRollAudio } from './rollAudio';

const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * Plays the idle sound once after IDLE_MS without input and stops it on the next input. Browsers only allow sound after the
 * visitor has clicked or typed, so the first click/key also unlocks audio (unless the visitor switched sound off).
 */
export function useIdleSound() {
  useEffect(() => {
    void preloadRollSounds();
    let last = Date.now();
    let played = false;
    const onActivity = (event: Event) => {
      last = Date.now();
      if (played) { stopIdleSound(); played = false; }
      if (event.type === 'pointerdown' || event.type === 'keydown') unlockRollAudio();
    };
    for (const type of ACTIVITY) window.addEventListener(type, onActivity, { passive: true, capture: true });
    const check = window.setInterval(() => {
      if (played || Date.now() - last < IDLE_MS) return;
      played = playIdleSound(); // not ready yet (still decoding, tab hidden…) → try again next second
    }, 1000);
    return () => {
      window.clearInterval(check);
      for (const type of ACTIVITY) window.removeEventListener(type, onActivity, { capture: true });
      stopIdleSound();
    };
  }, []);
}
