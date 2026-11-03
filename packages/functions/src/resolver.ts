import type { AppSyncResolverEvent } from "aws-lambda";
import * as h from "./handlers/index.js";

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  // queries
  game: h.game,
  hostGame: h.hostGame,
  fastMoneyView: h.fastMoneyView,
  // lobby & roster
  createGame: h.createGame,
  joinGame: h.joinGame,
  updateConfig: h.updateConfig,
  randomizeTeams: h.randomizeTeams,
  setTeamName: h.setTeamName,
  assignPlayer: h.assignPlayer,
  reorderPlayer: h.reorderPlayer,
  removePlayer: h.removePlayer,
  restorePlayer: h.restorePlayer,
  // authoring
  upsertSurvey: h.upsertSurvey,
  deleteSurvey: h.deleteSurvey,
  upsertFastMoneyQuestion: h.upsertFastMoneyQuestion,
  deleteFastMoneyQuestion: h.deleteFastMoneyQuestion,
  // round
  startRound: h.startRound,
  skipContestant: h.skipContestant,
  armBuzzers: h.armBuzzers,
  resetBuzzers: h.resetBuzzers,
  revealAnswer: h.revealAnswer,
  strike: h.strike,
  setFaceOffWinner: h.setFaceOffWinner,
  choosePassOrPlay: h.choosePassOrPlay,
  skipGuesser: h.skipGuesser,
  endRound: h.endRound,
  undoRoundAction: h.undoRoundAction,
  buzz: h.buzz,
  // fast money
  selectFastMoneyPlayers: h.selectFastMoneyPlayers,
  startFastMoneyTurn: h.startFastMoneyTurn,
  endFastMoneyTurn: h.endFastMoneyTurn,
  submitFastMoneyAnswer: h.submitFastMoneyAnswer,
  skipFastMoneyQuestion: h.skipFastMoneyQuestion,
  buzzDuplicate: h.buzzDuplicate,
  revealFastMoneyAnswer: h.revealFastMoneyAnswer,
  finishGame: h.finishGame,
  sendPlayerMessage: h.sendPlayerMessage,
};

export async function handler(event: AppSyncResolverEvent<Record<string, unknown>>): Promise<unknown> {
  const field = event.info.fieldName;
  const resolve = handlers[field];
  if (!resolve) {
    throw new Error(`No handler for field: ${field}`);
  }
  return resolve(event.arguments);
}
