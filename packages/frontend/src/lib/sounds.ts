/**
 * Task 3.9 — sound effects synthesised with WebAudio, plus the game's recorded clips.
 * Browsers block audio until a user gesture, so `unlock()` is called on the
 * first tap/keypress and everything before that is silently dropped.
 */
import buzzClipUrl from "../assets/buzzer.mp3";
import clangClipUrl from "../assets/clang.wav";
import duplicateClipUrl from "../assets/duplicate.wav";
import strikeClipUrl from "../assets/wrong.mp3";

const MUTE_KEY = "familyfeud.muted";

export type SoundName = "buzz" | "clang" | "duplicate" | "ding" | "strike" | "win" | "armed" | "press" | "yourTurn" | "tick" | "timeUp" | "nope" | "sting" | "steal" | "join" | "fanfare";

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
  decodeClips(ctx);
}

export function isUnlocked(): boolean {
  return unlocked;
}

/** Sound will actually come out of this window: unlocked, running and not muted. */
export function isSounding(): boolean {
  return unlocked && !muted && context?.state === "running";
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

/** A flat, nasal game-show buzzer: stacked detuned saws, driven hard into clipping, with a hard start and stop. */
interface Buzzer {
  frequency: number;
  duration: number;
  gain: number;
}

const DRIVE = 6;

function driveCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i += 1) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * DRIVE);
  return curve;
}

/** Takes any context, so the same sound can be rendered offline. */
export function scheduleBuzzer(ctx: BaseAudioContext, start: number, { frequency, duration, gain }: Buzzer): void {
  const drive = ctx.createWaveShaper();
  drive.curve = driveCurve();
  const body = ctx.createBiquadFilter();
  body.type = "peaking";
  body.frequency.value = 1100;
  body.Q.value = 1.2;
  body.gain.value = 9;
  const top = ctx.createBiquadFilter();
  top.type = "lowpass";
  top.frequency.value = 4200;
  const level = ctx.createGain();
  level.gain.setValueAtTime(0, start);
  level.gain.linearRampToValueAtTime(gain, start + 0.006);
  level.gain.setValueAtTime(gain, start + duration - 0.02);
  level.gain.linearRampToValueAtTime(0, start + duration);
  drive.connect(body).connect(top).connect(level).connect(ctx.destination);

  const voices: [OscillatorType, number, number][] = [
    ["sawtooth", frequency, 0.5],
    ["sawtooth", frequency * 1.013, 0.5],
    ["square", frequency / 2, 0.35],
  ];
  for (const [type, pitch, mix] of voices) {
    const osc = ctx.createOscillator();
    const voice = ctx.createGain();
    osc.type = type;
    osc.frequency.value = pitch;
    voice.gain.value = mix;
    osc.connect(voice).connect(drive);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

export const BUZZERS = {
  // The wrong-answer buzzer, for the moment before the clip has loaded: long, low and flat.
  strike: { frequency: 130, duration: 0.85, gain: 0.2 },
} as const satisfies Partial<Record<SoundName, Buzzer>>;

/** Takes any context, so a sound can be rendered offline. */
export function scheduleTones(ctx: BaseAudioContext, now: number, tones: Tone[]): void {
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

/** Each clip gets its own gain, so they land at a similar level. */
const CLIPS = {
  buzz: { url: buzzClipUrl, gain: 2.5 },
  strike: { url: strikeClipUrl, gain: 2.8 },
  clang: { url: clangClipUrl, gain: 0.7 },
  duplicate: { url: duplicateClipUrl, gain: 2 },
} as const;
type ClipName = keyof typeof CLIPS;

interface LoadedClip {
  buffer: AudioBuffer;
  /** Where the sound starts: it has to land with the moment on screen, not after a clip's silent lead-in. */
  offset: number;
}

const SILENCE = 0.01;
/** How long a sound may wait for its clip to finish decoding before the synthesised stand-in plays. */
const CLIP_WAIT_MS = 700;
const clips: Partial<Record<ClipName, LoadedClip>> = {};
/** Pending decodes, so a sound asked for mid-decode waits for the real clip. */
const decoding: Partial<Record<ClipName, Promise<LoadedClip | undefined>>> = {};

function soundStart(buffer: AudioBuffer): number {
  const first = buffer.getChannelData(0).findIndex((sample) => Math.abs(sample) > SILENCE);
  return first > 0 ? first / buffer.sampleRate : 0;
}

/**
 * The clip bytes download as soon as the app loads; that needs no gesture.
 * Waiting for the first tap made the first buzz play the synthesised stand-in.
 */
const clipBytes: Partial<Record<ClipName, Promise<ArrayBuffer | undefined>>> = {};

function prefetchClips(): void {
  if (typeof fetch === "undefined") return;
  for (const name of Object.keys(CLIPS) as ClipName[]) {
    clipBytes[name] ??= fetch(CLIPS[name].url)
      .then((response) => (response.ok ? response.arrayBuffer() : undefined))
      .catch(() => undefined);
  }
}

prefetchClips();

/** Decoding needs the context, so it starts at unlock; the bytes are usually already here. */
function decodeClips(ctx: BaseAudioContext): void {
  prefetchClips();
  for (const name of Object.keys(CLIPS) as ClipName[]) {
    if (clips[name] || decoding[name]) continue;
    decoding[name] = (clipBytes[name] ?? Promise.resolve(undefined))
      // decodeAudioData detaches its buffer, so hand it a copy and keep the bytes for a retry.
      .then((data) => (data ? ctx.decodeAudioData(data.slice(0)) : undefined))
      .then((buffer) => {
        if (!buffer) return undefined;
        const clip = { buffer, offset: soundStart(buffer) };
        clips[name] = clip;
        return clip;
      })
      .catch(() => undefined)
      .finally(() => {
        // A failed decode may try again on the next unlock.
        if (!clips[name]) delete decoding[name];
      });
  }
}

function startClip(ctx: BaseAudioContext, name: ClipName, clip: LoadedClip): void {
  const source = ctx.createBufferSource();
  const level = ctx.createGain();
  source.buffer = clip.buffer;
  level.gain.value = CLIPS[name].gain;
  source.connect(level).connect(ctx.destination);
  source.start(0, clip.offset);
}

/** A quick electronic ring, for the moment before the clip has loaded. */
const BUZZ_IN_PULSES = 6;
const BUZZ_IN_GAP = 0.052;
const buzzIn: Tone[] = Array.from({ length: BUZZ_IN_PULSES }, (_, i) => [
  { frequency: 1175, duration: 0.05, type: "square" as const, gain: 0.3, at: i * BUZZ_IN_GAP },
  { frequency: 1760, duration: 0.05, type: "triangle" as const, gain: 0.36, at: i * BUZZ_IN_GAP },
]).flat();

/** Two-tone chime. */
const ding: Tone[] = [
  { frequency: 880, duration: 0.25, gain: 0.25 },
  { frequency: 1318, duration: 0.5, gain: 0.25, at: 0.12 },
];

const nope: Tone[] = [
  { frequency: 262, duration: 0.1, type: "square", gain: 0.16 },
  { frequency: 208, duration: 0.16, type: "square", gain: 0.16, at: 0.12 },
];

export const SOUNDS: Record<Exclude<SoundName, keyof typeof BUZZERS>, Tone[]> = {
  buzz: buzzIn,
  ding,
  clang: ding,
  nope,
  duplicate: nope,
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

function playSynth(ctx: BaseAudioContext, name: SoundName): void {
  if (name === "strike") scheduleBuzzer(ctx, ctx.currentTime, BUZZERS.strike);
  else scheduleTones(ctx, ctx.currentTime, SOUNDS[name]);
}

function isClip(name: SoundName): name is ClipName {
  return name in CLIPS;
}

export function play(name: SoundName): void {
  const ctx = getContext();
  if (!ctx || muted || !unlocked) return;
  if (!isClip(name)) {
    playSynth(ctx, name);
    return;
  }
  const ready = clips[name];
  if (ready) {
    startClip(ctx, name, ready);
    return;
  }
  const pending = decoding[name];
  if (!pending) {
    playSynth(ctx, name);
    return;
  }
  // Still decoding (the first tap after unlock): wait briefly for the real clip.
  let settled = false;
  const fallback = window.setTimeout(() => {
    settled = true;
    playSynth(ctx, name);
  }, CLIP_WAIT_MS);
  void pending.then((clip) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(fallback);
    if (clip) startClip(ctx, name, clip);
    else playSynth(ctx, name);
  });
}
