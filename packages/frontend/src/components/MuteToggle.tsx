interface Props {
  muted: boolean;
  onToggle: () => void;
}

export function MuteToggle({ muted, onToggle }: Props) {
  return (
    <button className="button button--small button--ghost" type="button" onClick={onToggle} aria-pressed={muted} title={muted ? "Unmute sounds" : "Mute sounds"}>
      {muted ? "🔇 Muted" : "🔊 Sound"}
    </button>
  );
}
