// A round on the TV: band, board and ticker sit in fixed rows, so nothing reflows mid-show. The plates live in Display.
import { contestantsOf, otherTeam, playerName, ROUND_STATE_LABEL, teamName } from "../lib/gameHelpers";
import type { ApiGame, PublicRound } from "../lib/types";
import { Podium } from "./Podium";
import { Strikes } from "./Strikes";
import { SurveyBoard } from "./SurveyBoard";

interface Props {
  game: ApiGame;
  round: PublicRound;
  fresh: ReadonlySet<number>;
}

const LONG_QUESTION = 90;
const LONG_BANNER = 38;

function Question({ text }: { text: string }) {
  return (
    <p className="sx-question" data-long={text.length > LONG_QUESTION ? "" : undefined}>
      {text}
    </p>
  );
}

function bannerFor(game: ApiGame, round: PublicRound): { text: string; mood: "gold" | "red" | "plain" } | null {
  const { state } = round;
  if (state === "FACE_OFF_ANSWERING" && round.buzzWinnerPlayerId) return { text: `${playerName(game, round.buzzWinnerPlayerId)} buzzed in!`, mood: "gold" };
  if (state === "PASS_OR_PLAY") return { text: `${teamName(game, round.faceOffWinnerTeamId)}: pass or play?`, mood: "gold" };
  if (state === "PLAYING") return { text: `${teamName(game, round.playingTeamId)} — ${playerName(game, round.currentGuesserPlayerId)}, you're up!`, mood: "plain" };
  if (state === "STEAL") return { text: `${otherTeam(game, round.playingTeamId)?.name ?? "—"} — STEAL!`, mood: "red" };
  if ((state === "REVEAL_REMAINING" || state === "ENDED") && round.awardedToTeamId) return { text: `${round.pot} points to ${teamName(game, round.awardedToTeamId)}!`, mood: "gold" };
  return null;
}

function TvTicker({ game, round }: Pick<Props, "game" | "round">) {
  const { state } = round;
  const banner = bannerFor(game, round);
  return (
    <div className="sx-ticker">
      <p className="sx-ticker__state">
        Round {round.number}
        {round.multiplier > 1 ? ` · ×${round.multiplier} points` : ""} · {ROUND_STATE_LABEL[state]}
      </p>
      <p className="sx-ticker__banner" data-mood={banner?.mood} data-long={(banner?.text.length ?? 0) > LONG_BANNER ? "" : undefined} aria-live="polite">
        {banner?.text}
      </p>
      <div className="sx-ticker__tally">{(state === "PLAYING" || state === "STEAL" || state === "FACE_OFF_ANSWERING") && <Strikes count={round.strikes} max={game.config.strikesToSteal} />}</div>
    </div>
  );
}

export function DisplayRound({ game, round, fresh }: Props) {
  const { state } = round;
  const faceOff = state === "PICK_CONTESTANTS" || state === "FACE_OFF_ARMED" || state === "FACE_OFF_ANSWERING";
  const center = round.questionText ? (
    <Question text={round.questionText} />
  ) : (
    <div className="sx-tvpick">
      <span className="sx-tvpick__vs">VS</span>
      <p className="sx-question" data-waiting="">
        Contestants, to the podium…
      </p>
    </div>
  );

  return (
    <>
      <section className="sx-band">{faceOff ? <Podium contestants={contestantsOf(game, round)} buzzWinnerPlayerId={round.buzzWinnerPlayerId} armed={state === "FACE_OFF_ARMED"} center={center} /> : center}</section>
      <div className="sx-tvboard" data-dim={state === "PICK_CONTESTANTS" ? "" : undefined}>
        <SurveyBoard board={round.board} fresh={fresh} />
      </div>
      <TvTicker game={game} round={round} />
    </>
  );
}
