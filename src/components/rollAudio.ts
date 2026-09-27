'use client';

import type { Tier } from './api';

/**
 * Case-opening sound, synthesised with Web Audio (no sample files): a CS:GO-style run of crisp clicks that slow down, a riser and a
 * heartbeat under the reel, a drum roll just before the stop, then a reveal that depends on the tier — a sad "womp" for Micro up to a
 * full fanfare with crash and crowd for ★ Top. Everything goes through one gain + limiter, so a higher tier is richer, not louder.
 */

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
      master.gain.value = 0.55;
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
  if (master && context) master.gain.setValueAtTime(value ? 0.55 : 0, context.currentTime);
  if (value) unlockRollAudio();
}

function ready() { return enabled && context && master && context.state === 'running' && !document.hidden; }

function track(source: AudioScheduledSourceNode, start: number, stop: number, cleanup: AudioNode[]) {
  active.add(source);
  source.onended = () => { active.delete(source); source.disconnect(); for (const node of cleanup) node.disconnect(); };
  source.start(start);
  source.stop(stop);
}

function envelope(volume: number, start: number, duration: number, attack: number) {
  const gain = context!.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(master!);
  return gain;
}

type ToneOptions = { type?: OscillatorType; attack?: number; vibrato?: { rate: number; depth: number; after?: number }; lowpass?: [number, number] };

function tone(frequency: number, endFrequency: number, duration: number, volume: number, delay = 0, options: ToneOptions = {}) {
  if (!ready() || !context) return;
  const start = context.currentTime + delay;
  const source = context.createOscillator();
  source.type = options.type ?? 'sine';
  source.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== frequency) source.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  const gain = envelope(volume, start, duration, options.attack ?? 0.002);
  const cleanup: AudioNode[] = [gain];
  let input: AudioNode = gain;
  if (options.lowpass) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(options.lowpass[0], start);
    filter.frequency.linearRampToValueAtTime(options.lowpass[1], start + duration * 0.35);
    filter.frequency.linearRampToValueAtTime(options.lowpass[0], start + duration);
    filter.connect(gain);
    cleanup.push(filter);
    input = filter;
  }
  source.connect(input);
  if (options.vibrato) {
    const lfo = context.createOscillator();
    const depth = context.createGain();
    lfo.frequency.value = options.vibrato.rate;
    depth.gain.setValueAtTime(0, start);
    depth.gain.linearRampToValueAtTime(options.vibrato.depth, start + (options.vibrato.after ?? 0) + 0.12);
    lfo.connect(depth);
    depth.connect(source.frequency);
    track(lfo, start, start + duration + 0.03, [depth]);
  }
  track(source, start, start + duration + 0.03, cleanup);
}

function noise(frequency: number, endFrequency: number, duration: number, volume: number, delay = 0, attack = 0.002, q = 1.4, type: BiquadFilterType = 'bandpass') {
  if (!ready() || !context || !noiseBuffer) return;
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(frequency, start);
  filter.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  const gain = envelope(volume, start, duration, attack);
  source.connect(filter);
  filter.connect(gain);
  track(source, start, start + duration + 0.03, [filter, gain]);
}

/** A crowd-like swell: band-passed noise with a fast, uneven amplitude flutter. */
function cheer(duration: number, volume: number, delay = 0) {
  if (!ready() || !context || !noiseBuffer) return;
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1300;
  filter.Q.value = 0.7;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + duration * 0.25);
  gain.gain.linearRampToValueAtTime(volume * 0.8, start + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  const flutter = context.createOscillator();
  const flutterDepth = context.createGain();
  flutter.frequency.value = 7.3;
  flutterDepth.gain.value = volume * 0.35;
  flutter.connect(flutterDepth);
  flutterDepth.connect(gain.gain);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master!);
  track(flutter, start, start + duration, [flutterDepth]);
  track(source, start, start + duration + 0.03, [filter, gain]);
}

const brass = (frequency: number, duration: number, volume: number, delay: number) =>
  tone(frequency, frequency, duration, volume, delay, { type: 'sawtooth', attack: 0.025, lowpass: [900, 2600] });
const bell = (frequency: number, duration: number, volume: number, delay: number) => {
  tone(frequency, frequency, duration, volume, delay, { type: 'triangle', attack: 0.003 });
  tone(frequency * 2.01, frequency * 2.01, duration * 0.6, volume * 0.35, delay, { attack: 0.002 });
};
const crash = (volume: number, delay: number, duration = 1.6) => noise(9000, 3500, duration, volume, delay, 0.003, 0.6, 'highpass');
const impact = (volume: number, delay = 0) => { tone(95, 32, 0.9, volume, delay, { attack: 0.004 }); noise(2600, 500, 0.16, volume * 0.8, delay); };

export function playRollStart() {
  stopRollAudio();
  lastTick = 0;
  // The case unlatches: a metal clack, a low thump and air rushing in.
  noise(3000, 1200, 0.07, 0.75);
  noise(2200, 900, 0.06, 0.5, 0.06);
  tone(150, 45, 0.3, 0.5);
  noise(700, 4200, 0.35, 0.22, 0.05, 0.08);
}

/** Under the whole spin: a rising riser, a low drone and a heartbeat that speeds up as the reel slows. */
export function playRollBed(durationMs = 4700) {
  const seconds = durationMs / 1000;
  noise(220, 2600, seconds, 0.075, 0, seconds * 0.8, 1.6);
  tone(55, 82, seconds, 0.06, 0, { type: 'sawtooth', attack: seconds * 0.6, lowpass: [180, 320] });
  let at = 0.5;
  let gap = 0.95;
  while (at < seconds - 0.2) {
    const weight = at / seconds;
    tone(62, 40, 0.16, 0.22 + weight * 0.25, at);
    tone(55, 36, 0.14, 0.15 + weight * 0.18, at + 0.16);
    at += gap;
    gap = Math.max(0.36, gap * 0.86);
  }
}

/** One crisp click per card that crosses the marker; slow clicks get a little more body, like the last teeth of a ratchet. */
export function playRollTick() {
  const now = performance.now();
  const gap = lastTick ? now - lastTick : 40;
  if (gap < 30) return;
  lastTick = now;
  const weight = Math.min(1, gap / 260);
  const pitch = 0.98 + Math.random() * 0.04;
  noise(4200 * pitch, 2600, 0.018 + weight * 0.02, 0.5 + weight * 0.2, 0, 0.0008, 3);
  tone(1500 * pitch, 900, 0.02, 0.08 + weight * 0.05, 0, { type: 'square' });
  tone(210, 110, 0.03 + weight * 0.04, 0.1 + weight * 0.15);
}

/** The reel has stopped: a drum roll that swells, then a beat of silence before the reveal. */
export function playRollSuspense(durationMs = 700) {
  const seconds = durationMs / 1000;
  const roll = seconds - 0.12;
  for (let at = 0; at < roll; at += 0.045) noise(1900, 1500, 0.04, 0.12 + (at / roll) * 0.4, at, 0.001, 1.2);
  tone(280, 920, roll, 0.05, 0, { type: 'triangle', attack: roll * 0.8 });
}

export function playRollReveal(tier: Tier) {
  switch (tier) {
    case 'micro':
      // "Lỏm": the classic sad trombone, womp womp womp wooomp.
      noise(1600, 500, 0.08, 0.35);
      tone(120, 60, 0.18, 0.3);
      [293.66, 277.18, 261.63].forEach((f, i) => brass(f, 0.34, 0.13, 0.12 + i * 0.36));
      tone(246.94, 238, 1.15, 0.14, 1.2, { type: 'sawtooth', attack: 0.03, lowpass: [700, 1500], vibrato: { rate: 5.5, depth: 7, after: 0.25 } });
      break;
    case 'small':
      // Plain: a latch and a shrug of two soft notes.
      noise(2300, 800, 0.09, 0.42);
      tone(150, 60, 0.24, 0.34);
      tone(659.25, 659.25, 0.14, 0.07, 0.1, { type: 'square', lowpass: [1400, 2000] });
      tone(554.37, 550, 0.26, 0.07, 0.25, { type: 'square', lowpass: [1400, 2000] });
      break;
    case 'mid':
      // Nice: a solid hit and a bright major arpeggio.
      impact(0.4);
      [523.25, 659.25, 783.99].forEach((f, i) => bell(f, 0.9, 0.12, 0.05 + i * 0.08));
      bell(1046.5, 1.2, 0.1, 0.32);
      break;
    case 'large':
      // Xịn: fanfare + crash.
      impact(0.45);
      crash(0.14, 0.02, 1.4);
      [392, 523.25, 659.25].forEach((f, i) => brass(f, 0.16, 0.12, 0.08 + i * 0.13));
      brass(783.99, 0.9, 0.14, 0.47);
      bell(1567.98, 1.3, 0.06, 0.5);
      noise(1200, 6000, 0.6, 0.08, 0.3, 0.2);
      break;
    case 'top':
      // ★ Top: boom, crash, "ta-ta-ta-taaa", a held chord, sparkles and a crowd.
      tone(70, 28, 1.6, 0.5, 0, { attack: 0.004 });
      noise(3000, 400, 0.22, 0.45);
      crash(0.18, 0.02, 2.4);
      [523.25, 523.25, 523.25].forEach((f, i) => brass(f, 0.13, 0.13, 0.12 + i * 0.14));
      brass(659.25, 0.5, 0.14, 0.56);
      [523.25, 659.25, 783.99, 1046.5].forEach((f) => brass(f, 1.7, 0.075, 1.08));
      crash(0.12, 1.08, 2);
      for (let i = 0; i < 18; i++) { const f = 2000 + Math.random() * 3200; tone(f, f * 1.02, 0.18, 0.04, 0.5 + i * 0.07); }
      cheer(3, 0.16, 0.9);
      break;
  }
}
