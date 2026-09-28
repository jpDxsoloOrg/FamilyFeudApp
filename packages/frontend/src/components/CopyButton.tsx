import { useState } from "react";

interface Props {
  value: string;
  label: string;
  copiedLabel?: string;
  className?: string;
}

/** Copies `value` to the clipboard; falls back silently when the clipboard is unavailable. */
export function CopyButton({ value, label, copiedLabel = "Copied", className = "button button--small button--ghost" }: Props) {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Insecure context or no permission; the value is visible elsewhere.
    }
  }
  return (
    <button className={className} type="button" onClick={copy}>
      {copied ? copiedLabel : label}
    </button>
  );
}
