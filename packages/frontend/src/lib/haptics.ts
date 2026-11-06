/** iOS has no `vibrate`, so nothing may rely on this alone. Vibration always means "your turn", never chat. */
export function buzzPhone(pattern: number | number[]): void {
  navigator.vibrate?.(pattern);
}
