import { useState } from "react";

interface Props {
  value: string;
  label: string;
  copiedLabel?: string;
  className?: string;
  onFail?: () => void;
}

const FEEDBACK_MS = 2000;

/** Copies `value` to the clipboard and says so either way. */
export function CopyButton({ value, label, copiedLabel = "Copied", className = "button button--small button--ghost", onFail }: Props) {
  const [result, setResult] = useState<"copied" | "failed">();
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setResult("copied");
    } catch {
      setResult("failed");
      onFail?.();
    }
    window.setTimeout(() => setResult(undefined), FEEDBACK_MS);
  }
  return (
    <button className={className} type="button" onClick={copy}>
      {result === "copied" ? copiedLabel : result === "failed" ? "Couldn't copy" : label}
    </button>
  );
}
