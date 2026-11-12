import i18n from '../../i18n';
import type { WebError } from '../../types';

export type GitPublishOperation = 'commit' | 'commit_push' | 'push';

export function defaultCommitMessage(filesChanged: number): string {
  if (filesChanged <= 0) return 'Update project files';
  return filesChanged === 1 ? 'Update 1 file' : `Update ${filesChanged} files`;
}

export function remoteNames(remoteBranches: string[]): string[] {
  const names = remoteBranches.map(branch => branch.split('/', 1)[0]?.trim()).filter((name): name is string => Boolean(name));
  return [...new Set(names.length > 0 ? names : ['origin'])];
}

const ERROR_KEYS: Record<string, string> = {
  NOTHING_TO_COMMIT: 'codeMode.errors.nothingToCommit',
  GIT_TRANSIENT_STATE: 'codeMode.errors.gitTransientState',
  DETACHED_HEAD: 'codeMode.errors.detachedHead',
  BRANCH_ALREADY_EXISTS: 'codeMode.errors.branchAlreadyExists',
  BRANCH_INVALID: 'codeMode.errors.branchInvalid',
  REMOTE_NOT_FOUND: 'codeMode.errors.remoteNotFound',
  PUSH_REJECTED: 'codeMode.errors.pushRejected',
  GIT_COMMAND_TIMEOUT: 'codeMode.errors.gitTimeout',
  NOT_GIT_REPOSITORY: 'codeMode.errors.notGitRepository',
  GIT_NOT_FOUND: 'codeMode.errors.gitNotFound',
  PROJECT_DIR_MISSING: 'codeMode.errors.projectDirMissing',
};

export function gitPublishErrorMessage(error: unknown, fallback: string): string {
  const webError = error as WebError | null;
  if (webError?.code && ERROR_KEYS[webError.code]) return i18n.t(ERROR_KEYS[webError.code]);
  if (webError instanceof Error && webError.message.trim()) return webError.message;
  return fallback;
}
