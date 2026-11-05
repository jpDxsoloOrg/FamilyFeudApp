/** Both views of the key list. Generated from HOST_KEYS, so they match what the keys do. */
import { HOST_KEYS, type Cue } from "../../lib/hostCue";
import { HostSheet } from "./HostSheet";

export function KeyLegend({ cue, hasTeams }: { cue: Cue; hasTeams: boolean }) {
  return (
    <ul className="hx-legend" aria-label="Keyboard shortcuts">
      {HOST_KEYS.map((doc) => (
        <li key={doc.keys} data-off={doc.legal(cue, hasTeams) ? undefined : ""}>
          <kbd className="hx-key">{doc.keys}</kbd> {doc.label(cue)}
        </li>
      ))}
    </ul>
  );
}

export function KeySheet({ onClose }: { onClose: () => void }) {
  return (
    <HostSheet title="Keys" onClose={onClose}>
      <dl className="hx-keylist">
        {HOST_KEYS.map((doc) => (
          <div key={doc.keys}>
            <dt>
              <kbd className="hx-key">{doc.keys}</kbd>
            </dt>
            <dd>{doc.long}</dd>
          </div>
        ))}
      </dl>
    </HostSheet>
  );
}
