import i18n from '../../i18n';
import type { WebError } from '../../types';
import type { GitTurnChangeAction, GitTurnDiff } from './types';

interface TurnChangeResultIdentity {
  change_set_id?: string | null;
  turn_index: number;
}

export function turnDiffKey(turn: Pick<GitTurnDiff, 'change_set_id' | 'turn_index'>): string {
  return turn.change_set_id || `turn-${turn.turn_index}`;
}

export function hasFileChanges(turn: Pick<GitTurnDiff, 'files' | 'stats'>): boolean {
  // Expired snapshots retain change counts even when file details are unavailable.
  return Object.keys(turn.files ?? {}).length > 0 || turn.stats.files_changed > 0;
}

/** The review card and both mutations always target the last file-editing turn. */
export function latestModifiedTurn(turns: GitTurnDiff[]): GitTurnDiff | null {
  let latest: GitTurnDiff | null = null;
  for (const turn of turns) {
    if (hasFileChanges(turn) && (!latest || turn.turn_index > latest.turn_index)) latest = turn;
  }
  return latest;
}

export function updateTurnChangeStatus(turns: GitTurnDiff[], result: TurnChangeResultIdentity, status: 'completed' | 'discarded'): GitTurnDiff[] {
  const matches = (turn: GitTurnDiff) => (result.change_set_id ? turn.change_set_id === result.change_set_id : turn.turn_index === result.turn_index);
  return turns.map(turn => (matches(turn) ? { ...turn, status } : turn));
}

const ERROR_KEYS: Record<string, string> = {
  SESSION_BUSY: 'codeMode.errors.sessionBusy',
  SESSION_NOT_BOUND: 'codeMode.errors.sessionNotBound',
  PROJECT_SESSION_MISMATCH: 'codeMode.errors.projectSessionMismatch',
  NO_TURN_TO_DISCARD: 'codeMode.errors.noTurnToDiscard',
  NO_TURN_TO_REDO: 'codeMode.errors.noTurnToRedo',
  NOTHING_TO_DISCARD: 'codeMode.errors.nothingToDiscard',
  NOTHING_TO_REDO: 'codeMode.errors.nothingToRedo',
  TURN_TARGET_CHANGED: 'codeMode.errors.turnTargetChanged',
  DIFF_HISTORY_EXPIRED: 'codeMode.errors.diffHistoryExpired',
  REDO_HISTORY_MISSING: 'codeMode.errors.redoHistoryMissing',
  PARTIAL_RESTORE_FAILED: 'codeMode.errors.partialRestoreFailed',
  PARTIAL_REDO_FAILED: 'codeMode.errors.partialRedoFailed',
  NOT_FOUND: 'codeMode.errors.notFound',
  FORBIDDEN: 'codeMode.errors.forbidden',
  WS_DISCONNECTED: 'codeMode.errors.wsDisconnected',
  WS_NOT_READY: 'codeMode.errors.wsNotReady',
  REQUEST_TIMEOUT: 'codeMode.errors.requestTimeout',
};

export function turnChangeErrorMessage(error: unknown, action: GitTurnChangeAction): string {
  const webError = error as WebError | null;
  if (webError?.code && ERROR_KEYS[webError.code]) return i18n.t(ERROR_KEYS[webError.code]);
  if (webError instanceof Error && webError.message.trim()) return webError.message;
  return action === 'discard' ? i18n.t('codeMode.errors.discardFail') : i18n.t('codeMode.errors.redoFail');
}
