/**
 * Task 3.9 — sound effects synthesised with WebAudio (no assets to load).
 * Browsers block audio until a user gesture, so `unlock()` is called on the
 * first tap/keypress and everything before that is silently dropped.
 */
const MUTE_KEY = "familyfeud.muted";

export type SoundName = "buzz" | "ding" | "strike" | "win" | "armed" | "press" | "yourTurn" | "tick" | "timeUp" | "nope" | "sting" | "steal" | "join" | "fanfare";

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
  // Two quick rising pips: buzzers are live.
  armed: [
    { frequency: 740, duration: 0.09, type: "triangle", gain: 0.25 },
    { frequency: 988, duration: 0.14, type: "triangle", gain: 0.25, at: 0.1 },
  ],
  // A dry thunk under the finger.
  press: [{ frequency: 220, duration: 0.07, type: "square", gain: 0.18, slideTo: 140 }],
  // Three bright notes that climb.
  yourTurn: [
    { frequency: 587, duration: 0.12, type: "triangle", gain: 0.28 },
    { frequency: 880, duration: 0.12, type: "triangle", gain: 0.28, at: 0.11 },
    { frequency: 1175, duration: 0.3, type: "triangle", gain: 0.28, at: 0.22 },
  ],
  tick: [{ frequency: 1500, duration: 0.05, type: "square", gain: 0.1 }],
  // A falling two-note horn.
  timeUp: [
    { frequency: 440, duration: 0.25, type: "sawtooth", gain: 0.22 },
    { frequency: 294, duration: 0.5, type: "sawtooth", gain: 0.22, at: 0.22, slideTo: 220 },
  ],
  nope: [
    { frequency: 262, duration: 0.1, type: "square", gain: 0.16 },
    { frequency: 208, duration: 0.16, type: "square", gain: 0.16, at: 0.12 },
  ],
  // A short brass-like stab that opens a round.
  sting: [
    { frequency: 392, duration: 0.16, type: "sawtooth", gain: 0.16 },
    { frequency: 494, duration: 0.16, type: "sawtooth", gain: 0.16, at: 0.02 },
    { frequency: 587, duration: 0.5, type: "sawtooth", gain: 0.18, at: 0.16 },
    { frequency: 784, duration: 0.5, type: "triangle", gain: 0.2, at: 0.16 },
  ],
  // A siren sweep for the other side's chance.
  steal: [
    { frequency: 330, duration: 0.3, type: "triangle", gain: 0.26, slideTo: 660 },
    { frequency: 660, duration: 0.3, type: "triangle", gain: 0.26, at: 0.3, slideTo: 330 },
    { frequency: 330, duration: 0.3, type: "triangle", gain: 0.26, at: 0.6, slideTo: 660 },
  ],
  join: [
    { frequency: 659, duration: 0.08, gain: 0.2 },
    { frequency: 988, duration: 0.16, gain: 0.2, at: 0.07 },
  ],
  // A held major chord that resolves upward.
  fanfare: [
    { frequency: 392, duration: 0.22, type: "triangle", gain: 0.2 },
    { frequency: 392, duration: 0.12, type: "triangle", gain: 0.2, at: 0.24 },
    { frequency: 523, duration: 0.3, type: "triangle", gain: 0.22, at: 0.38 },
    { frequency: 659, duration: 1, type: "triangle", gain: 0.2, at: 0.68 },
    { frequency: 784, duration: 1, type: "triangle", gain: 0.2, at: 0.68 },
    { frequency: 1046, duration: 1, type: "sine", gain: 0.2, at: 0.68 },
  ],
};

export function play(name: SoundName): void {
  playTones(SOUNDS[name]);
}
