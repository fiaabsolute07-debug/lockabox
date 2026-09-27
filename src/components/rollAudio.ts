'use client';

import type { Tier } from './api';

const STORAGE_KEY = 'lab_roll_sound';
let context: AudioContext | undefined;
let master: GainNode | undefined;
let noiseBuffer: AudioBuffer | undefined;
let enabled = true;
let lastTick = 0;
const active = new Set<AudioScheduledSourceNode>();

export function rollSoundEnabled() {
  try { enabled = localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { /* Session preference still works. */ }
  return enabled;
}

export function stopRollAudio() {
  for (const source of active) { try { source.stop(); } catch { /* Already stopped. */ } }
  active.clear();
}

// Unlock before awaiting the roll API, while still inside the user's gesture.
export function unlockRollAudio() {
  if (!rollSoundEnabled()) return;
  try {
    if (!context || context.state === 'closed') {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      master.connect(limiter);
      limiter.connect(context.destination);
      noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      document.addEventListener('visibilitychange', () => { if (document.hidden) stopRollAudio(); });
    }
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
  } catch { /* Unsupported audio must never block opening a case. */ }
}

export function setRollSoundEnabled(value: boolean) {
  enabled = value;
  try { localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off'); } catch { /* Keep session preference. */ }
  if (!value) stopRollAudio();
  if (master && context) master.gain.setValueAtTime(value ? 0.5 : 0, context.currentTime);
  if (value) unlockRollAudio();
}

function ready() { return enabled && context && master && context.state === 'running' && !document.hidden; }

function connectVoice(source: AudioScheduledSourceNode, volume: number, duration: number, delay: number, attack: number, filter?: AudioNode) {
  if (!context || !master) return;
  const start = context.currentTime + delay;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  if (filter) { source.connect(filter); filter.connect(gain); } else source.connect(gain);
  gain.connect(master);
  active.add(source);
  source.onended = () => { active.delete(source); source.disconnect(); filter?.disconnect(); gain.disconnect(); };
  source.start(start);
  source.stop(start + duration + 0.025);
}

function tone(frequency: number, endFrequency: number, duration: number, volume: number, delay = 0, attack = 0.002) {
  if (!ready() || !context) return;
  const source = context.createOscillator();
  source.frequency.setValueAtTime(frequency, context.currentTime + delay);
  source.frequency.exponentialRampToValueAtTime(endFrequency, context.currentTime + delay + duration);
  connectVoice(source, volume, duration, delay, attack);
}

function noise(frequency: number, endFrequency: number, duration: number, volume: number, delay = 0, attack = 0.002, q = 1.4) {
  if (!ready() || !context || !noiseBuffer) return;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(frequency, context.currentTime + delay);
  filter.frequency.exponentialRampToValueAtTime(endFrequency, context.currentTime + delay + duration);
  connectVoice(source, volume, duration, delay, attack, filter);
}

export function playRollStart() {
  stopRollAudio();
  lastTick = 0;
  // A latch releasing, a low case thump, then a short pneumatic sweep.
  noise(2600, 1100, 0.09, 0.7);
  tone(180, 48, 0.24, 0.48);
  noise(900, 3800, 0.25, 0.22, 0.04, 0.07);
}

export function playRollBed() {
  // Subtle motor texture grows into tension, then fades before the final latch.
  noise(180, 820, 4.45, 0.09, 0, 2.8, 2);
  tone(48, 85, 4.35, 0.055, 0, 2.7);
}

export function playRollTick() {
  const now = performance.now();
  const gap = lastTick ? now - lastTick : 40;
  if (gap < 32) return;
  lastTick = now;
  // Slower teeth have more weight; timing still comes from actual card crossings.
  const weight = Math.min(1, gap / 240);
  const pitch = 0.97 + Math.random() * 0.06;
  noise(2900 * pitch, 1500, 0.035 + weight * 0.035, 0.42 + weight * 0.18, 0, 0.001, 1.8);
  tone(780 * pitch, 380, 0.045, 0.13);
  tone(190, 90, 0.045 + weight * 0.025, 0.15 + weight * 0.12);
}

export function playRollReveal(tier: Tier) {
  // Only the revealed tier changes the sound. Higher tiers add texture and
  // sustain, not a sudden jump in volume; the shared limiter caps the mix.
  switch (tier) {
    case 'micro':
      // Dry, compact latch with a short, low thud.
      noise(1700, 650, 0.075, 0.42);
      tone(130, 65, 0.16, 0.34);
      break;
    case 'small':
      // A firmer double latch with a little metal resonance.
      noise(2300, 800, 0.10, 0.46);
      tone(155, 58, 0.25, 0.38);
      noise(2800, 1300, 0.055, 0.18, 0.045);
      tone(480, 465, 0.32, 0.075, 0.02);
      break;
    case 'mid':
      // Weighty impact and two ringing metal overtones.
      noise(2500, 750, 0.14, 0.48);
      tone(170, 48, 0.42, 0.43);
      noise(3200, 1000, 0.50, 0.11, 0.025, 0.04);
      tone(620, 610, 0.65, 0.11, 0.025);
      tone(977, 960, 0.48, 0.065, 0.045);
      break;
    case 'large':
      // A cinematic bass hit, rising air and a wider, longer metallic bloom.
      noise(2800, 700, 0.17, 0.48);
      tone(180, 42, 0.62, 0.44);
      noise(1100, 4200, 0.48, 0.12, 0.025, 0.14);
      tone(440, 438, 1.0, 0.095, 0.04, 0.025);
      tone(660, 658, 0.95, 0.09, 0.10, 0.025);
      tone(1108, 1100, 0.85, 0.06, 0.17, 0.025);
      noise(4300, 2100, 0.85, 0.055, 0.18, 0.09);
      break;
    case 'top':
      // Deep impact, an ascending crystalline flourish, then a golden tail.
      noise(3100, 650, 0.20, 0.46);
      tone(200, 38, 0.80, 0.44);
      noise(850, 5200, 0.58, 0.12, 0.035, 0.20);
      tone(220, 219, 1.15, 0.08, 0.045, 0.03);
      tone(554.37, 552, 1.35, 0.095, 0.08, 0.025);
      tone(830.61, 828, 1.25, 0.08, 0.17, 0.025);
      tone(1108.73, 1105, 1.15, 0.065, 0.26, 0.025);
      tone(1661.22, 1655, 1.20, 0.04, 0.36, 0.025);
      noise(5400, 2400, 1.35, 0.045, 0.25, 0.15);
      break;
  }
}
