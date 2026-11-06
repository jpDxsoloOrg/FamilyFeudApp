/** Loaded only when something is worth celebrating, so nobody downloads it to join a game. */
const COLOURS = ["#f5b301", "#ffd34d", "#5eead4", "#f0abfc", "#ffffff"];

export function fireConfetti(big = false): void {
  import("canvas-confetti")
    .then(({ default: confetti }) => {
      const shot = { disableForReducedMotion: true, zIndex: 55, colors: COLOURS, ticks: 260 };
      void confetti({ ...shot, particleCount: big ? 140 : 90, spread: 80, startVelocity: 48, origin: { x: 0.2, y: 0.7 }, angle: 60 });
      void confetti({ ...shot, particleCount: big ? 140 : 90, spread: 80, startVelocity: 48, origin: { x: 0.8, y: 0.7 }, angle: 120 });
    })
    .catch(() => undefined);
}
