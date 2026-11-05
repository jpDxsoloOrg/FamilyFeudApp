/** Native `<dialog>`: focus trap, Esc and the top layer for free. Bottom sheet on a phone, centred above that. */
import { X } from "lucide-react";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

interface Props {
  title: string;
  wide?: boolean;
  /** The console's ErrorStrip; the dock is hidden behind a modal. */
  strip?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function HostSheet({ title, wide, strip, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  function onBackdrop(event: MouseEvent<HTMLDialogElement>): void {
    if (event.target === dialog.current) dialog.current?.close();
  }

  return (
    <dialog ref={dialog} className="hx-sheet" data-wide={wide ? "" : undefined} aria-label={title} onClose={onClose} onClick={onBackdrop}>
      <div className="hx-sheet__inner">
        <header className="hx-sheet__head">
          <h2>{title}</h2>
          <button className="hx-tool" type="button" aria-label="Close" onClick={() => dialog.current?.close()}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {strip}
        <div className="hx-sheet__body">{children}</div>
      </div>
    </dialog>
  );
}
