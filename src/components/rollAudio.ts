'use client';

import type { Tier } from './api';

/**
 * Case-opening sound modelled on how CS:GO's case opening is structured: a latch when the case opens, one dry tick per item that
 * crosses the marker (constant pitch, so the slowdown is heard in the rhythm, not in the pitch), no music under the reel, and a
 * rarity reveal that is a bell "shing" with a reverb tail, richer and longer for rarer tiers (blue → purple → pink → red → gold).
 *
 * Everything is synthesised with Web Audio: Valve's own sound files are not used (they are Valve's copyright). To use licensed
 * files instead, put them in /public/sounds with a manifest.json such as
 *   { "open": "open.mp3", "tick": "tick.mp3", "reveal-micro": "blue.mp3", "reveal-small": "purple.mp3",
 *     "reveal-mid": "pink.mp3", "reveal-large": "red.mp3", "reveal-top": "gold.mp3" }
 * Any event with a file plays the file; the others keep the synthesised sound.
 * Special events have no synthesised version and play instead of the tier sound: "micro-streak" (cat-laugh.mp3)
 * after MICRO_STREAK Micro pulls in a row, "doge" (bonk.mp3) when the pulled coin's symbol or name contains "doge",
 * "first-mid" (yippee.mp3) when the first roll after the page loads is a purple Mid, and on gold ★ Top pulls either
 * "top-airhorn" (airhorn.mp3, TOP_AIRHORN_CHANCE) or "top-wow" (anime-wow.mp3, TOP_WOW_CHANCE) from one draw.
 * "idle" (idle.mp3) plays once after IDLE_MS without input and stops on the next input (see useIdleSound).
 */

/** File-only reveal sounds that replace the tier sound for special pulls; silent fallback when no file is listed. */
export type SpecialSound = 'micro-streak' | 'doge' | 'first-mid' | 'top-airhorn' | 'top-wow';
type SoundEvent = 'open' | 'tick' | `reveal-${Tier}` | SpecialSound | 'idle';

const STORAGE_KEY = 'lab_roll_sound';
const MASTER = 0.55;
let context: AudioContext | undefined;
let master: GainNode | undefined;
let reverb: GainNode | undefined;
let noiseBuffer: AudioBuffer | undefined;
let enabled = true;
let lastTick = 0;
let filesRequested = false;
const files = new Map<SoundEvent, AudioBuffer>();
const active = new Set<AudioScheduledSourceNode>();

export function rollSoundEnabled() {
  try { enabled = localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { /* Session preference still works. */ }
  return enabled;
}

export function stopRollAudio() {
  for (const source of active) { try { source.stop(); } catch { /* Already stopped. */ } }
  active.clear();
}

/** A short synthetic room (decaying stereo noise) for the bells' tail. */
function makeReverb(ctx: AudioContext) {
  const seconds = 1.8;
  const impulse = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  const send = ctx.createGain();
  send.gain.value = 0.32;
  send.connect(convolver);
  convolver.connect(master!);
  return send;
}

let fileBytes: Promise<Map<SoundEvent, ArrayBuffer>> | undefined;

/** Fetches the optional licensed files (see the header comment) ahead of the first roll. Needs no AudioContext, so it can run
 * on page load; the first click then only has to decode, and a special sound is ready even on a fast first reveal. */
export function preloadRollSounds() {
  fileBytes ??= (async () => {
    const out = new Map<SoundEvent, ArrayBuffer>();
    try {
      const response = await fetch('/sounds/manifest.json', { cache: 'no-store' });
      if (!response.ok) return out;
      const manifest = (await response.json()) as Partial<Record<SoundEvent, string>>;
      await Promise.all(Object.entries(manifest).map(async ([event, file]) => {
        if (typeof file !== 'string' || !/^[\w.-]+\.(mp3|ogg|wav|m4a)$/.test(file)) return;
        const r = await fetch(`/sounds/${file}`);
        if (r.ok) out.set(event as SoundEvent, await r.arrayBuffer());
      }));
    } catch { /* Missing manifest = synthesised sound only. */ }
    return out;
  })();
  return fileBytes;
}

let filesDecoded: Promise<unknown> | undefined;

function loadFiles(ctx: AudioContext) {
  if (filesRequested) return;
  filesRequested = true;
  filesDecoded = decodeFiles(ctx);
}

async function decodeFiles(ctx: AudioContext) {
  // Decode in parallel so a short file (bonk) is never stuck behind a long one (idle).
  await Promise.all([...(await preloadRollSounds())].map(async ([event, bytes]) => {
    try { files.set(event, await ctx.decodeAudioData(bytes.slice(0))); } catch { /* This event keeps its synthesised sound. */ }
  }));
}

// Unlock before awaiting the roll API, while still inside the user's gesture.
export function unlockRollAudio() {
  if (!rollSoundEnabled()) return;
  try {
    if (!context || context.state === 'closed') {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = MASTER;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 10;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.2;
      master.connect(limiter);
      limiter.connect(context.destination);
      reverb = makeReverb(context);
      noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      document.addEventListener('visibilitychange', () => { if (document.hidden) stopRollAudio(); });
      void loadFiles(context);
    }
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
  } catch { /* Unsupported audio must never block opening a case. */ }
}

export function setRollSoundEnabled(value: boolean) {
  enabled = value;
  try { localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off'); } catch { /* Keep session preference. */ }
  if (!value) stopRollAudio();
  if (master && context) master.gain.setValueAtTime(value ? MASTER : 0, context.currentTime);
  if (value) unlockRollAudio();
}

function ready() { return enabled && context && master && context.state === 'running' && !document.hidden; }

function track(source: AudioScheduledSourceNode, start: number, stop: number, cleanup: AudioNode[]) {
  active.add(source);
  source.onended = () => { active.delete(source); source.disconnect(); for (const node of cleanup) node.disconnect(); };
  source.start(start);
  source.stop(stop);
}

/** Plays a licensed file for this event if one was provided; returns undefined to fall back to the synthesised sound. */
function playFile(event: SoundEvent, volume = 1): AudioBufferSourceNode | undefined {
  const buffer = files.get(event);
  if (!buffer || !ready() || !context) return undefined;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(master!);
  track(source, context.currentTime, context.currentTime + buffer.duration + 0.05, [gain]);
  return source;
}

function voice(volume: number, start: number, duration: number, attack: number, wet: boolean) {
  const gain = context!.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(master!);
  if (wet && reverb) gain.connect(reverb);
  return gain;
}

function tone(frequency: number, endFrequency: number, duration: number, volume: number, delay = 0, type: OscillatorType = 'sine', attack = 0.002, wet = false) {
  if (!ready() || !context) return;
  const start = context.currentTime + delay;
  const source = context.createOscillator();
  source.type = type;
  source.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== frequency) source.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  const gain = voice(volume, start, duration, attack, wet);
  source.connect(gain);
  track(source, start, start + duration + 0.03, [gain]);
}

function noise(frequency: number, duration: number, volume: number, delay = 0, type: BiquadFilterType = 'highpass', attack = 0.0005, wet = false, endFrequency = frequency) {
  if (!ready() || !context || !noiseBuffer) return;
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== frequency) filter.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  const gain = voice(volume, start, duration, attack, wet);
  source.connect(filter);
  filter.connect(gain);
  track(source, start, start + duration + 0.03, [filter, gain]);
}

/** A struck bell: fundamental plus the inharmonic partials that make it "ring" rather than beep. */
function bell(frequency: number, duration: number, volume: number, delay = 0) {
  tone(frequency, frequency, duration, volume, delay, 'sine', 0.002, true);
  tone(frequency * 2.76, frequency * 2.76, duration * 0.5, volume * 0.28, delay, 'sine', 0.001, true);
  tone(frequency * 5.4, frequency * 5.4, duration * 0.25, volume * 0.1, delay, 'sine', 0.001, true);
}

/** The airy "shing" that opens every reveal: a filtered noise sweep upwards into the reverb. */
function shing(duration: number, volume: number, delay = 0) {
  noise(2500, duration, volume, delay, 'bandpass', 0.01, true, 9000);
}

export function playRollStart() {
  stopRollAudio();
  lastTick = 0;
  if (playFile('open')) return;
  // The case unlocks: two quick metal clicks and a short slide.
  noise(3500, 0.03, 0.5);
  tone(900, 600, 0.04, 0.12, 0, 'triangle');
  noise(2800, 0.035, 0.4, 0.07);
  tone(700, 450, 0.05, 0.1, 0.07, 'triangle');
  noise(1200, 0.22, 0.12, 0.1, 'bandpass', 0.03, false, 3000);
}

/** CS:GO plays nothing under the reel but the ticks. Kept as a hook for a licensed ambience file later. */
export function playRollBed(_durationMs = 4700) { void _durationMs; }

/** One dry tick per item crossing the marker, always the same pitch; the reel's slowdown is heard in the spacing. */
export function playRollTick() {
  const now = performance.now();
  if (lastTick && now - lastTick < 28) return;
  lastTick = now;
  if (playFile('tick', 0.9)) return;
  noise(5200, 0.012, 0.35);
  tone(2350, 2150, 0.028, 0.2, 0, 'sine', 0.0005);
  tone(1180, 1100, 0.022, 0.07, 0, 'triangle', 0.0005);
}

/** No drum roll: the reveal follows the stop almost at once. */
export function playRollSuspense(_durationMs = 0) { void _durationMs; }

// E major (E6, G#6, B6, E7, G#7, B7) — bright, open, like an item reveal.
const E6 = 1318.51, GS6 = 1661.22, B6 = 1975.53, E7 = 2637.02, GS7 = 3322.44, B7 = 3951.07;

/** Micro pulls in a row before Locky laughs at you (owner request, 2026-09-29). Counted once per roll by the caller. */
export const MICRO_STREAK = 3;
export const nextMicroStreak = (streak: number, tier: Tier) => (tier === 'micro' ? streak + 1 : 0);

/** Shares of gold ★ Top pulls that get the airhorn or the anime wow (owner requests, 2026-09-29); the rest keep the tier sound. */
export const TOP_AIRHORN_CHANCE = 1 / 3;
export const TOP_WOW_CHANCE = 0.1;

/** Which special sound (if any) a pull gets: doge first, then a purple first roll, the ★ Top airhorn/wow, then a Micro streak.
 * `random` is only used for the airhorn draw; the sound is cosmetic and has nothing to do with the provably fair roll. */
export function specialSoundFor(pull: { tier: Tier; rollsThisVisit: number; microStreak: number; asset: { symbol?: string | null; name?: string | null } }, random = Math.random): SpecialSound | undefined {
  if (/doge/i.test(`${pull.asset.symbol ?? ''} ${pull.asset.name ?? ''}`)) return 'doge';
  if (pull.rollsThisVisit === 1 && pull.tier === 'mid') return 'first-mid';
  if (pull.tier === 'top') {
    const r = random();
    return r < TOP_AIRHORN_CHANCE ? 'top-airhorn' : r < TOP_AIRHORN_CHANCE + TOP_WOW_CHANCE ? 'top-wow' : undefined;
  }
  return pull.microStreak >= MICRO_STREAK ? 'micro-streak' : undefined;
}

/** How long a special reveal waits for its file to finish decoding (a fast first roll can beat the decoder). */
const SPECIAL_WAIT_MS = 1000;

export function playRollReveal(tier: Tier, special?: SpecialSound) {
  if (special && playFile(special)) return;
  if (special && filesDecoded && !files.has(special)) {
    const wait = new Promise(resolve => setTimeout(resolve, SPECIAL_WAIT_MS));
    void Promise.race([filesDecoded, wait]).then(() => { if (!playFile(special)) playTierSound(tier); });
    return;
  }
  playTierSound(tier);
}

function playTierSound(tier: Tier) {
  if (playFile(`reveal-${tier}`)) return;
  switch (tier) {
    case 'micro': // blue: one plain ding
      shing(0.25, 0.05);
      bell(E6, 0.7, 0.11);
      break;
    case 'small': // purple: two rising dings
      shing(0.3, 0.06);
      bell(E6, 0.7, 0.11);
      bell(GS6, 0.8, 0.11, 0.09);
      break;
    case 'mid': // pink: a quick bright arpeggio
      shing(0.45, 0.08);
      [E6, GS6, B6].forEach((f, i) => bell(f, 1.0, 0.11, i * 0.07));
      bell(E7, 1.2, 0.08, 0.21);
      break;
    case 'large': // red: a swell, a wide chord and a long shimmer
      shing(0.6, 0.1);
      tone(110, 55, 0.5, 0.25, 0, 'sine', 0.004);
      [E6, GS6, B6, E7].forEach((f, i) => bell(f, 1.5, 0.1, 0.05 + i * 0.06));
      noise(7000, 1.3, 0.035, 0.25, 'highpass', 0.3, true);
      break;
    case 'top': // gold: a sparkling run up two octaves, then a held chord in a big tail
      shing(0.8, 0.12);
      tone(98, 40, 0.9, 0.3, 0, 'sine', 0.004);
      [E6, GS6, B6, E7, GS7, B7, E7 * 2].forEach((f, i) => bell(f, 0.6, 0.075, 0.04 + i * 0.05));
      [E6, GS6, B6, E7].forEach((f) => bell(f, 2.4, 0.07, 0.42));
      [329.63, 415.3, 493.88].forEach((f) => tone(f, f, 2.2, 0.035, 0.4, 'triangle', 0.35, true));
      noise(8000, 2.2, 0.05, 0.3, 'highpass', 0.4, true);
      break;
  }
}

/** No input for this long plays the idle file once (owner request, 2026-09-29). */
export const IDLE_MS = 60_000;
let idleSource: AudioBufferSourceNode | undefined;

/** Returns false when the file cannot play yet (not decoded, sound off, tab hidden, audio still locked). */
export function playIdleSound() {
  if (idleSource) return true;
  idleSource = playFile('idle');
  if (idleSource) idleSource.addEventListener('ended', () => { idleSource = undefined; });
  return !!idleSource;
}

export function stopIdleSound() {
  if (!idleSource) return;
  try { idleSource.stop(); } catch { /* Already stopped. */ }
  idleSource = undefined;
}
