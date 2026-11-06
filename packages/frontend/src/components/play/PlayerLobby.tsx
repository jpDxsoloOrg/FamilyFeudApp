/** The wait before the first round. The dock carries the status, this carries the people. */
import { useState } from "react";
import { useNewcomers } from "../../hooks/useNewcomers";
import { buzzPhone } from "../../lib/haptics";
import { isMuted, play, unlock } from "../../lib/sounds";
import type { ApiGame } from "../../lib/types";
import { Wordmark } from "../show/Wordmark";

/**
 * Local only, nothing is sent. The Join tap happens before `useSounds` mounts,
 * so this gives a reason to tap here, which unlocks audio before it matters.
 */
function TestBuzzer() {
  const [tested, setTested] = useState(false);
  const [down, setDown] = useState(false);

  function press(): void {
    unlock();
    play("buzz");
    buzzPhone(30);
    setTested(true);
    setDown(true);
  }

  return (
    <div className="sx-test">
      <button className="sx-test__dome" type="button" data-down={down ? "" : undefined} onPointerDown={press} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)} onClick={unlock} aria-label="Test your buzzer">
        BUZZ
      </button>
      <p className="sx-test__text">
        <strong>Test your buzzer</strong>
        <br />
        {tested ? (isMuted() ? "Sound is muted. Use the speaker up top." : "All set. It only counts in the face-off.") : "Tap it to check your sound."}
      </p>
    </div>
  );
}

export function PlayerLobby({ game, me }: { game: ApiGame; me: string }) {
  const self = game.players.find((player) => player.id === me);
  const teamsSet = game.teams.length > 0;
  const isNew = useNewcomers(game.players);

  if (!self) {
    return (
      <div className="sx-lobby" data-empty="">
        <Wordmark variant="full" />
      </div>
    );
  }

  return (
    <div className="sx-lobby">
      <section className="sx-ticket">
        <span className="sx-ticket__label">Admit one</span>
        <p className="sx-ticket__name">
          You're in as <strong>{self.displayName}</strong>
          {!self.active && <span className="tag">removed by host</span>}
        </p>
      </section>

      {!teamsSet && (
        <section className="chips sx-lobby__chips">
          {game.players.map((player) => (
            <span key={player.id} className="chip" data-new={isNew(player.id) ? "" : undefined}>
              {player.displayName}
            </span>
          ))}
        </section>
      )}

      {teamsSet && (
        <section className="sx-lobby__teams">
          {game.teams.map((team, index) => (
            <div className="card" key={team.id} data-side={index === 0 ? "a" : "b"}>
              <h3>{team.name}</h3>
              <ol className="roster">
                {team.players
                  .filter((player) => player.active)
                  .map((player, order) => (
                    <li key={player.id} className={`roster__item${player.id === me ? " roster__item--me" : ""}`}>
                      <span className="roster__order">{order + 1}</span>
                      <span className="roster__name">{player.displayName}</span>
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      <TestBuzzer />
    </div>
  );
}
