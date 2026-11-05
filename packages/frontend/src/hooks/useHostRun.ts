/**
 * Every host mutation goes through here. One ref is the guard, so a double-click
 * cannot race; board reveals alone wait in a queue instead of being dropped.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toApiError } from "../lib/api";
import type { ApiGameUpdate } from "../lib/types";

const BAR_DELAY_MS = 250;
const NOTE_MS = 4000;

interface Options {
  applyUpdate: (update: ApiGameUpdate) => void;
  reveal: (index: number) => Promise<ApiGameUpdate>;
  /** Checked against the latest game just before a queued reveal fires. */
  canReveal: (index: number) => boolean;
}

export interface HostRun {
  busy: boolean;
  /** Shown 250ms into a call, so quick ones don't flicker. */
  showBar: boolean;
  /** Bumps when a press is ignored for being mid-call. */
  flashKey: number;
  problem: string | undefined;
  note: string | undefined;
  pendingReveals: number[];
  /** Resolves false when the press was ignored. */
  guarded: (work: () => Promise<void>) => Promise<boolean>;
  run: (action: () => Promise<ApiGameUpdate>) => Promise<boolean>;
  queueReveal: (index: number) => void;
  clearProblem: () => void;
  clearNote: () => void;
  setNote: (note: string) => void;
}

export function useHostRun({ applyUpdate, reveal, canReveal }: Options): HostRun {
  const busyRef = useRef(false);
  const queue = useRef<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [showBar, setShowBar] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [problem, setProblem] = useState<string>();
  const [note, setNote] = useState<string>();
  const [pendingReveals, setPendingReveals] = useState<number[]>([]);

  const latest = useRef({ reveal, canReveal, applyUpdate });
  latest.current = { reveal, canReveal, applyUpdate };

  const syncQueue = useCallback((next: number[]) => {
    queue.current = next;
    setPendingReveals(next);
  }, []);

  const guarded = useCallback(
    async (work: () => Promise<void>): Promise<boolean> => {
      if (busyRef.current) {
        setFlashKey((key) => key + 1);
        return false;
      }
      busyRef.current = true;
      setBusy(true);
      setProblem(undefined);
      try {
        await work();
      } catch (cause) {
        syncQueue([]);
        setProblem(toApiError(cause).message);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      return true;
    },
    [syncQueue],
  );

  const run = useCallback(
    (action: () => Promise<ApiGameUpdate>) =>
      guarded(async () => {
        latest.current.applyUpdate(await action());
      }),
    [guarded],
  );

  const pump = useCallback(() => {
    while (!busyRef.current && queue.current.length > 0) {
      const index = queue.current[0];
      if (!latest.current.canReveal(index)) {
        syncQueue(queue.current.slice(1));
        continue;
      }
      void run(() => latest.current.reveal(index)).then(() => syncQueue(queue.current.filter((queued) => queued !== index)));
    }
  }, [run, syncQueue]);

  const queueReveal = useCallback(
    (index: number) => {
      if (queue.current.includes(index)) return;
      syncQueue([...queue.current, index]);
      pump();
    },
    [pump, syncQueue],
  );

  // Runs after the commit that carries the new game, so revalidation reads fresh state.
  useEffect(() => {
    if (!busy) pump();
  }, [busy, pendingReveals, pump]);

  useEffect(() => {
    if (!busy) {
      setShowBar(false);
      return;
    }
    const timer = window.setTimeout(() => setShowBar(true), BAR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [busy]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(undefined), NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [note]);

  const clearProblem = useCallback(() => setProblem(undefined), []);
  const clearNote = useCallback(() => setNote(undefined), []);

  return { busy, showBar, flashKey, problem, note, pendingReveals, guarded, run, queueReveal, clearProblem, clearNote, setNote };
}
