/**
 * Task 3.9 — sound effects synthesised with WebAudio (no assets to load).
 * Browsers block audio until a user gesture, so `unlock()` is called on the
 * first tap/keypress and everything before that is silently dropped.
 */
const MUTE_KEY = "familyfeud.muted";

export type SoundName = "buzz" | "ding" | "strike" | "win";

let context: AudioContext | undefined;
let unlocked = false;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // Preference lives for this page only.
  }
}

function getContext(): AudioContext | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  context ??= new AudioContext();
  return context;
}

/** Call from a user gesture. Safe to call repeatedly. */
export function unlock(): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  unlocked = true;
}

export function isUnlocked(): boolean {
  return unlocked;
}

interface Tone {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Seconds after the sound starts. */
  at?: number;
  /** Slide to this frequency by the end. */
  slideTo?: number;
}

function playTones(tones: Tone[]): void {
  const ctx = getContext();
  if (!ctx || muted || !unlocked) return;
  const now = ctx.currentTime;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? "sine";
    const start = now + (tone.at ?? 0);
    osc.frequency.setValueAtTime(tone.frequency, start);
    if (tone.slideTo) osc.frequency.exponentialRampToValueAtTime(tone.slideTo, start + tone.duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.gain ?? 0.3, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + tone.duration + 0.05);
  }
}

const SOUNDS: Record<SoundName, Tone[]> = {
  // Two-tone chime.
  ding: [
    { frequency: 880, duration: 0.25, gain: 0.25 },
    { frequency: 1318, duration: 0.5, gain: 0.25, at: 0.12 },
  ],
  // Harsh descending buzzer.
  strike: [
    { frequency: 180, duration: 0.6, type: "sawtooth", gain: 0.3, slideTo: 90 },
    { frequency: 183, duration: 0.6, type: "square", gain: 0.15, slideTo: 92 },
  ],
  // Short bright buzz-in.
  buzz: [{ frequency: 660, duration: 0.18, type: "square", gain: 0.25, slideTo: 990 }],
  // Rising arpeggio.
  win: [
    { frequency: 523, duration: 0.2 },
    { frequency: 659, duration: 0.2, at: 0.15 },
    { frequency: 784, duration: 0.2, at: 0.3 },
    { frequency: 1046, duration: 0.6, at: 0.45 },
  ],
};

export function play(name: SoundName): void {
  playTones(SOUNDS[name]);
}
