// RSI 纯展示函数：状态文案 / 节点状态色 / 分数格式化等。
// 与数据层解耦，便于组件复用与单测。

import i18n from '../../i18n';
import type {
  RsiArtifactType,
  RsiNodeChange,
  RsiNodeType,
  RsiScenario,
  RsiTaskStatus,
  RsiTreeNode,
  RsiTreeGetResult,
} from './types';

// 节点类型 → 展示用状态色类名（对应 rsi.css 的 bar--* 与图例 dot）
export type NodeStatusKind = 'best-path' | 'evaluated' | 'pending' | 'failed' | 'pruned';

/** Hide candidates abandoned after a program reaches its target score. */
export function visibleRsiTree(
  tree: RsiTreeGetResult | null,
  artifactType: RsiArtifactType | null,
): RsiTreeGetResult | null {
  if (!tree || artifactType !== 'PROGRAM') return tree;
  const nodes = tree.nodes.filter((node) => node.extra?.threshold_stop_cancelled !== true);
  return nodes.length === tree.nodes.length ? tree : { ...tree, nodes };
}

// 节点 type → 状态色映射（对齐样式概要：最优路径/已评测/待评测/已剪枝）
// adopted/root → best-path；rejected → evaluated；provisional → pending；pruned → pruned
export function nodeTypeToStatusKind(type: RsiNodeType): NodeStatusKind {
  switch (type) {
    case 'ROOT':
    case 'ADOPTED':
      return 'best-path';
    case 'REJECTED':
      return 'evaluated';
    case 'PROVISIONAL':
      return 'pending';
    case 'PRUNED':
      return 'pruned';
  }
}

export function statusKindClass(kind: NodeStatusKind): string {
  return `rsi-node__bar--${kind}`;
}

export function legendDotClass(kind: NodeStatusKind): string {
  return `rsi-legend__dot rsi-node__bar--${kind}`;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extraRecord(node: RsiTreeNode, key: string): JsonRecord | null {
  return asRecord(node.extra?.[key]);
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = asFiniteNumber(value);
    if (number != null) return number;
  }
  return null;
}

function clampText(value: string | null, max = 180): string | null {
  const text = value?.trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const STAGE_LABEL_KEYS: Record<string, string> = {
  plan: 'rsi.presentation.stage.plan',
  planning: 'rsi.presentation.stage.plan',
  research: 'rsi.presentation.stage.research',
  researching: 'rsi.presentation.stage.research',
  survey: 'rsi.presentation.stage.research',
  design: 'rsi.presentation.stage.design',
  designing: 'rsi.presentation.stage.design',
  implement: 'rsi.presentation.stage.implement',
  implementation: 'rsi.presentation.stage.implement',
  execute: 'rsi.presentation.stage.execute',
  execution: 'rsi.presentation.stage.execute',
  evaluate: 'rsi.presentation.stage.evaluate',
  evaluation: 'rsi.presentation.stage.evaluate',
  score: 'rsi.presentation.stage.evaluate',
  report: 'rsi.presentation.stage.report',
  reporting: 'rsi.presentation.stage.report',
  write: 'rsi.presentation.stage.report',
  writing: 'rsi.presentation.stage.report',
  paper_writing: 'rsi.presentation.stage.report',
  paper_generation: 'rsi.presentation.stage.report',
  compile: 'rsi.presentation.stage.compileValidate',
  compiling: 'rsi.presentation.stage.compileValidate',
  code_generation: 'rsi.presentation.stage.implement',
  program_generation: 'rsi.presentation.stage.implement',
  validate: 'rsi.presentation.stage.validate',
  validation: 'rsi.presentation.stage.validate',
};

/** Parse the structured provider stage payload carried in node.extra.stage. */
interface RsiNodeStageSpec {
  id: string;
  status: string;
  name: string | null;
  failedCaseCount: number | null;
  caseIndex: number | null;
  totalCases: number | null;
  caseId: string | null;
  score: number | null;
  candidateIndex: number | null;
  totalCandidates: number | null;
}

export function nodeStageSpec(node: RsiTreeNode): RsiNodeStageSpec | null {
  const rawStage = node.extra?.stage;
  const stage = asRecord(rawStage);
  const id = asText(stage?.id ?? stage?.key ?? stage?.stage ?? rawStage)
    ?.toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (!id) return null;
  const name = asText(stage?.name ?? stage?.label);
  const status = asText(stage?.status)?.toLowerCase() ?? '';
  return {
    id,
    status,
    name,
    failedCaseCount: firstNumber(stage?.failed_case_count, stage?.failedCaseCount),
    caseIndex: firstNumber(stage?.case_index, stage?.caseIndex),
    totalCases: firstNumber(stage?.total_cases, stage?.totalCases),
    caseId: asText(stage?.case_id ?? stage?.caseId),
    score: firstNumber(stage?.score),
    candidateIndex: firstNumber(stage?.candidate_index, stage?.candidateIndex),
    totalCandidates: firstNumber(stage?.total_candidates, stage?.totalCandidates),
  };
}

/** Convert provider stage ids/names into a short, stable user-facing label. */
export function nodeStageLabel(node: RsiTreeNode): string | null {
  const spec = nodeStageSpec(node);
  const namedStage = spec?.name ?? null;
  const id = spec?.id ?? null;
  // Real single-harness progress stages carry an index; keep their exact
  // per-case/generation text instead of collapsing them to the generic label.
  if (
    namedStage &&
    id &&
    (id.startsWith('evaluate.case.') || id.startsWith('analyze.') || id === 'generate.candidate')
  ) {
    return clampText(namedStage, 40);
  }
  const raw =
    namedStage ?? asText(node.extra?.stage) ?? id ?? (isStageDescription(node.description) ? node.description : null);
  if (!raw) return null;
  if (id) {
    const normalizedId = id.replace(/_/g, '');
    const knownById = Object.entries(STAGE_LABEL_KEYS).find(([key]) => key.replace(/_/g, '') === normalizedId);
    if (knownById) return i18n.t(knownById[1]);
  }
  const lower = raw.toLowerCase();
  if (lower.includes('调研') || lower.includes('research') || lower.includes('survey')) return i18n.t('rsi.presentation.stage.research');
  if (lower.includes('设计') || lower.includes('design')) return i18n.t('rsi.presentation.stage.design');
  if (lower.includes('实现') || lower.includes('implement') || lower.includes('生成程序')) return i18n.t('rsi.presentation.stage.implement');
  if (lower.includes('执行') || lower.includes('execute') || lower.includes('experiment')) return i18n.t('rsi.presentation.stage.execute');
  if (lower.includes('评测') || lower.includes('评分') || lower.includes('evaluat') || lower.includes('score')) {
    return i18n.t('rsi.presentation.stage.evaluate');
  }
  if (lower.includes('撰写') || lower.includes('报告') || lower.includes('report') || lower.includes('write'))
    return i18n.t('rsi.presentation.stage.report');
  if (lower.includes('编译') || lower.includes('校验') || lower.includes('validat') || lower.includes('compil')) {
    return i18n.t('rsi.presentation.stage.compileValidate');
  }
  if (lower.includes('规划') || lower.includes('plan')) return i18n.t('rsi.presentation.stage.plan');
  return clampText(raw, 24);
}

function isStageDescription(value: string | null): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return (
    lower.includes('正在') ||
    lower.includes('进行中') ||
    lower.includes('research') ||
    lower.includes('evaluat') ||
    lower.includes('implement') ||
    lower.includes('compile') ||
    lower.includes('validat') ||
    lower.includes('reporting')
  );
}

export type RsiI18nFunction = (key: string, options?: Record<string, unknown>) => string | null;

/** Localized stage label based on structured provider fields. */
export function nodeStageLocalizedLabel(node: RsiTreeNode, t: RsiI18nFunction | null | undefined): string | null {
  const spec = nodeStageSpec(node);
  if (!spec) return null;
  if (spec.id.startsWith('evaluate.case.')) {
    const statusMap: Record<string, string> = {
      passed: 'casePassed',
      failed: 'caseFailed',
      error: 'caseError',
      skipped: 'caseSkipped',
      running: 'caseRunning',
    };
    const key = statusMap[spec.status];
    if (!key) return spec.name ?? nodeStageLabel(node);
    const params: Record<string, unknown> = {
      index: spec.caseIndex ?? 0,
      total: spec.totalCases ?? 0,
    };
    const label = t?.(`rsi.stage.${key}`, { ...params, defaultValue: spec.name ?? '' });
    if (!label) return spec.name ?? nodeStageLabel(node);
    if (spec.score != null && (spec.status === 'passed' || spec.status === 'failed')) {
      const suffix =
        t?.('rsi.stage.scoreSuffix', {
          score: spec.score.toFixed(2),
          defaultValue: ` · ${i18n.t('rsi.presentation.score.label')} ${spec.score.toFixed(2)}`,
        }) ?? ` · ${i18n.t('rsi.presentation.score.label')} ${spec.score.toFixed(2)}`;
      return `${label}${suffix}`;
    }
    return label;
  }
  if (spec.id === 'generate.candidate') {
    const statusMap: Record<string, string> = {
      done: 'candidateDone',
      error: 'candidateError',
      running: 'candidateRunning',
    };
    const key = statusMap[spec.status];
    if (!key) return spec.name ?? nodeStageLabel(node);
    const params: Record<string, unknown> = {
      index: spec.candidateIndex ?? 0,
      total: spec.totalCandidates ?? 0,
    };
    const label = t?.(`rsi.stage.${key}`, { ...params, defaultValue: spec.name ?? '' });
    return label || spec.name || nodeStageLabel(node);
  }
  if (spec.id.startsWith('analyze.')) {
    const statusMap: Record<string, string> = {
      done: 'analysisDone',
      error: 'analysisError',
      running: 'analysisRunning',
    };
    const key = statusMap[spec.status] ?? 'analysisRunning';
    const params: Record<string, unknown> = {
      count: spec.failedCaseCount ?? 0,
    };
    const label = t?.(`rsi.stage.${key}`, { ...params, defaultValue: spec.name ?? '' });
    return label || spec.name || nodeStageLabel(node);
  }
  return null;
}

const CHANGE_AREA_KEYS: Record<string, string> = {
  paper: 'rsi.presentation.changeArea.paper',
  program: 'rsi.presentation.changeArea.program',
  prompt: 'rsi.presentation.changeArea.prompt',
  skill: 'rsi.presentation.changeArea.skill',
  tool: 'rsi.presentation.changeArea.tool',
  rail: 'rsi.presentation.changeArea.rail',
  experiments: 'rsi.presentation.changeArea.experiments',
  experiment: 'rsi.presentation.changeArea.experiments',
  reporting: 'rsi.presentation.changeArea.reporting',
};

const OPERATION_KEYS: Record<string, string> = {
  add: 'rsi.presentation.operation.add',
  create: 'rsi.presentation.operation.add',
  generate: 'rsi.presentation.operation.generate',
  modify: 'rsi.presentation.operation.modify',
  update: 'rsi.presentation.operation.modify',
  remove: 'rsi.presentation.operation.remove',
  delete: 'rsi.presentation.operation.remove',
  replace: 'rsi.presentation.operation.replace',
};

function changeAreaLabel(change: RsiNodeChange): string | null {
  const raw = nodeChangeGroup(change).trim().toLowerCase();
  if (!raw) return null;
  return CHANGE_AREA_KEYS[raw] ? i18n.t(CHANGE_AREA_KEYS[raw]) : raw;
}

/** A compact change sentence used by both the tree card and the detail drawer. */
export function nodeChangeDisplayLabel(change: RsiNodeChange): string {
  const summary = clampText(change.summary ?? change.reason ?? null, 150);
  if (summary) {
    if (summary === 'Generated a new paper version.') return i18n.t('rsi.presentation.change.generatedNewPaper');
    if (summary === 'the starting program') return i18n.t('rsi.presentation.change.baselineProgram');
    return summary;
  }
  const area = changeAreaLabel(change);
  const operationKey = OPERATION_KEYS[change.operation.toLowerCase()];
  const operation = operationKey ? i18n.t(operationKey) : change.operation.toLowerCase();
  return [area, operation].filter(Boolean).join(' · ') || i18n.t('rsi.presentation.change.genericChange');
}

function nodeDescriptionSummary(node: RsiTreeNode): string | null {
  const description = asText(node.description);
  if (!description || isStageDescription(description)) return null;
  if (
    description === 'paper optimization root' ||
    description === 'No starting paper; first node writes from scratch.'
  ) {
    return i18n.t('rsi.presentation.change.baselinePaperStart');
  }
  if (description === 'Uploaded starting paper (ingestion not yet wired in).') return i18n.t('rsi.presentation.change.uploadedStartingPaper');
  if (description === 'the starting program') return i18n.t('rsi.presentation.change.baselineProgramOptimize');
  return clampText(description);
}

/** The one-line change/description used inside a tree card. */
export function nodeSummaryText(node: RsiTreeNode): string | null {
  return (node.changes ?? []).map(nodeChangeDisplayLabel).find(Boolean) ?? nodeDescriptionSummary(node);
}

function paperOutcome(node: RsiTreeNode): string | null {
  return asText(extraRecord(node, 'paper')?.outcome)?.toLowerCase() ?? null;
}

function hasRuntimeFailure(node: RsiTreeNode): boolean {
  if (paperOutcome(node) === 'failed') return true;
  const program = extraRecord(node, 'program');
  const evaluation = asRecord(program?.evaluation);
  if (asRecord(program?.error) || evaluation?.valid === false) return true;
  const failureClass = (node.failure_class ?? '').toLowerCase();
  const failureReason = (node.failure_reason ?? '').toLowerCase();
  return (
    (/fail|error|crash|terminat|invalid|exception|timeout/.test(failureClass) &&
      failureClass !== 'rejected_by_score') ||
    /manager decision failed|pipeline failed|generation failed|compile failed|execution timed out/.test(failureReason)
  );
}

function scoreForNode(node: RsiTreeNode): number | null {
  return firstNumber(node.score, extraRecord(node, 'paper')?.score_overall);
}

function siblingAttempt(node: RsiTreeNode, allNodes: RsiTreeNode[]): { index: number; total: number } | null {
  const siblings = allNodes
    .filter(
      (candidate) =>
        candidate.node_id !== node.node_id &&
        candidate.parent_id === node.parent_id &&
        candidate.iteration === node.iteration,
    )
    .concat(node)
    .sort((left, right) => left.node_id.localeCompare(right.node_id));
  if (siblings.length <= 1) return null;
  const index = Math.max(
    0,
    siblings.findIndex((candidate) => candidate.node_id === node.node_id),
  );
  return { index: index + 1, total: siblings.length };
}

function attemptInfo(
  node: RsiTreeNode,
  allNodes: RsiTreeNode[],
): { round: number; attempt: { index: number; total: number } | null } {
  const paper = extraRecord(node, 'paper');
  const program = extraRecord(node, 'program');
  const round = Math.max(1, firstNumber(paper?.round_index, program?.round_index, node.iteration) ?? 1);
  const explicitAttempt = firstNumber(paper?.attempt);
  const sibling = siblingAttempt(node, allNodes);
  if (explicitAttempt != null) {
    const total = Math.max(explicitAttempt, sibling?.total ?? 0);
    return { round, attempt: total > 1 ? { index: explicitAttempt, total } : null };
  }
  return { round, attempt: sibling };
}

export type RsiNodeLifecycle =
  'baseline' | 'generating' | 'evaluating' | 'pending' | 'adopted' | 'rejected' | 'failed' | 'pruned' | 'skipped';

export interface RsiNodePresentationContext {
  scenario: RsiScenario;
  artifactType: RsiArtifactType | null;
  allNodes?: RsiTreeNode[];
  taskRunning?: boolean;
}

export interface RsiNodePresentation {
  title: string;
  subtitle: string;
  lifecycle: RsiNodeLifecycle;
  statusKind: NodeStatusKind;
  runtimeKind: NodeRuntimeKind;
  runtimeLabel: string;
  runtimeIcon: NodeIconKind;
  stageLabel: string | null;
  summary: string | null;
  changeItems: string[];
  reasonLabel: string | null;
  reasonDetail: string | null;
  parentTitle: string | null;
  iteration: number;
  attempt: { index: number; total: number } | null;
  score: number | null;
  parentScore: number | null;
  scoreDelta: number | null;
  rawNodeId: string;
}

function artifactObjectLabel(scenario: RsiScenario, artifactType: RsiArtifactType | null): string {
  if (scenario === 'HARNESS') return 'Harness';
  return artifactType === 'PROGRAM' ? i18n.t('rsi.presentation.artifactObject.program') : i18n.t('rsi.presentation.artifactObject.paper');
}

export const SKIPPED_TARGET_REACHED = 'SKIPPED_TARGET_REACHED';
export const SKIPPED_TARGET_REACHED_REASON = '其他候选已达到目标分数';

/**
 * A program candidate abandoned because another candidate already reached the
 * target score was skipped, not failed. Never present it as a failure.
 */
export function isSkippedForTargetReached(node: RsiTreeNode): boolean {
  if (node.type === 'ROOT' || node.type === 'ADOPTED' || node.adopted) return false;
  if ((node.failure_class ?? '').toUpperCase() === SKIPPED_TARGET_REACHED) return true;
  if (node.extra?.threshold_stop_cancelled === true) return true;
  return asText(node.failure_reason)?.trim() === SKIPPED_TARGET_REACHED_REASON;
}

function lifecycleForNode(node: RsiTreeNode, taskRunning: boolean): RsiNodeLifecycle {
  if (node.type === 'ROOT') return 'baseline';
  if (isSkippedForTargetReached(node)) return 'skipped';
  if (node.type === 'PRUNED') return 'pruned';
  if (node.type === 'PROVISIONAL') {
    if (!taskRunning) return 'pending';
    const stage = nodeStageSpec(node);
    if (stage?.id.startsWith('evaluate.case.') || stage?.id === 'evaluate.parallel') return 'evaluating';
    if (stage?.id === 'generate.candidate') return 'generating';
    return nodeStageLabel(node)?.includes('评测') ? 'evaluating' : 'generating';
  }
  if (hasRuntimeFailure(node)) return 'failed';
  return node.type === 'ADOPTED' || node.adopted ? 'adopted' : 'rejected';
}

function failureLabel(
  node: RsiTreeNode,
  lifecycle: RsiNodeLifecycle,
  score: number | null,
  parentScore: number | null,
): string | null {
  if (lifecycle === 'failed') {
    const failureClass = (node.failure_class ?? '').toLowerCase();
    const failureReason = (node.failure_reason ?? '').toLowerCase();
    if (
      failureClass.includes('manager') ||
      failureClass.includes('decision') ||
      failureReason.includes('manager decision')
    ) {
      return i18n.t('rsi.presentation.failure.managerDecision');
    }
    if (failureClass.includes('scor')) return i18n.t('rsi.presentation.failure.scoreFail');
    if (failureClass.includes('compile') || failureClass.includes('valid')) return i18n.t('rsi.presentation.failure.compileValidate');
    if (failureClass.includes('timeout')) return i18n.t('rsi.presentation.failure.timeout');
    return i18n.t('rsi.presentation.failure.generationFail');
  }
  if (lifecycle === 'rejected') {
    if (score != null && parentScore != null) return i18n.t('rsi.presentation.failure.scoreNotBeatParent');
    return i18n.t('rsi.presentation.failure.notAdopted');
  }
  if (lifecycle === 'pruned') return asText(node.failure_reason) || i18n.t('rsi.presentation.failure.prunedReason');
  if (lifecycle === 'skipped') return i18n.t('rsi.presentation.failure.skippedTargetReached');
  return null;
}

function lifecycleStatusKind(lifecycle: RsiNodeLifecycle): NodeStatusKind {
  switch (lifecycle) {
    case 'baseline':
    case 'adopted':
      return 'best-path';
    case 'generating':
    case 'evaluating':
    case 'pending':
      return 'pending';
    case 'failed':
      return 'failed';
    case 'pruned':
    case 'skipped':
      return 'pruned';
    case 'rejected':
      return 'evaluated';
  }
}

function lifecycleRuntimeKind(lifecycle: RsiNodeLifecycle): NodeRuntimeKind {
  switch (lifecycle) {
    case 'baseline':
    case 'adopted':
      return 'best-path';
    case 'generating':
      return 'evaluating';
    case 'evaluating':
      return 'evaluating';
    case 'pending':
      return 'pending';
    case 'failed':
      return 'failed';
    case 'rejected':
      return 'evaluated';
    case 'pruned':
    case 'skipped':
      return 'pruned';
  }
}

/**
 * The runtime kind controls colors/layout, while the lifecycle carries the
 * user-facing phase. Keep these labels separate so a node that is still
 * generating an artifact is not presented as if evaluation had already
 * started.
 */
function lifecycleRuntimeLabel(lifecycle: RsiNodeLifecycle): string {
  switch (lifecycle) {
    case 'baseline':
    case 'adopted':
      return i18n.t('rsi.presentation.lifecycle.bestCurrent');
    case 'generating':
      return i18n.t('rsi.presentation.lifecycle.generating');
    case 'evaluating':
      return i18n.t('rsi.presentation.lifecycle.evaluating');
    case 'pending':
      return i18n.t('rsi.presentation.lifecycle.pending');
    case 'rejected':
      return i18n.t('rsi.presentation.lifecycle.rejected');
    case 'failed':
      return i18n.t('rsi.presentation.lifecycle.failed');
    case 'pruned':
      return i18n.t('rsi.presentation.lifecycle.pruned');
    case 'skipped':
      return i18n.t('rsi.presentation.lifecycle.skipped');
  }
}

function titleForNode(
  context: RsiNodePresentationContext,
  lifecycle: RsiNodeLifecycle,
  round: number,
  attempt: { index: number; total: number } | null,
): string {
  const objectLabel = artifactObjectLabel(context.scenario, context.artifactType);
  if (lifecycle === 'baseline') return `${i18n.t('rsi.presentation.title.baselinePrefix')}${objectLabel}`;
  if (lifecycle === 'adopted') {
    const runningProgram = context.artifactType === 'PROGRAM' && context.taskRunning;
    return i18n.t('rsi.presentation.title.versionRound', { label: objectLabel, round }) + ` · ${runningProgram ? i18n.t('rsi.presentation.title.leading') : i18n.t('rsi.presentation.title.bestCurrent')}`;
  }
  const suffix = lifecycle === 'failed' ? i18n.t('rsi.presentation.title.attemptSuffix') : i18n.t('rsi.presentation.title.candidateSuffix');
  const attemptLabel = attempt ? ` ${attempt.index}/${attempt.total}` : '';
  return i18n.t('rsi.presentation.title.roundAttempt', { round, label: objectLabel, suffix, attempt: attemptLabel });
}

export function presentRsiNode(node: RsiTreeNode, context: RsiNodePresentationContext): RsiNodePresentation {
  const allNodes = context.allNodes ?? [node];
  const taskRunning = Boolean(context.taskRunning);
  const lifecycle = lifecycleForNode(node, taskRunning);
  const { round, attempt } = attemptInfo(node, allNodes);
  const parent = node.parent_id ? allNodes.find((candidate) => candidate.node_id === node.parent_id) : null;
  const score = scoreForNode(node);
  const parentScore = parent ? scoreForNode(parent) : null;
  const changeItems = (node.changes ?? []).map(nodeChangeDisplayLabel).filter(Boolean);
  const summary = changeItems[0] ?? nodeDescriptionSummary(node);
  const reasonLabel = failureLabel(node, lifecycle, score, parentScore);
  // Other program candidates can still overtake an adopted node while the task runs.
  const runningProgramLeader = lifecycle === 'adopted' && context.artifactType === 'PROGRAM' && taskRunning;
  return {
    title: titleForNode(context, lifecycle, round, attempt),
    subtitle:
      lifecycle === 'baseline'
        ? i18n.t('rsi.presentation.subtitle.optimizationStart')
        : attempt
          ? i18n.t('rsi.presentation.subtitle.roundAttempt', { round, index: attempt.index, total: attempt.total })
          : i18n.t('rsi.presentation.subtitle.round', { round }),
    lifecycle,
    statusKind: lifecycleStatusKind(lifecycle),
    runtimeKind: lifecycleRuntimeKind(lifecycle),
    runtimeLabel: runningProgramLeader ? i18n.t('rsi.presentation.lifecycle.leading') : lifecycleRuntimeLabel(lifecycle),
    runtimeIcon: runtimeIconKind(lifecycleRuntimeKind(lifecycle)),
    stageLabel: nodeStageLabel(node),
    summary,
    changeItems,
    reasonLabel,
    reasonDetail: lifecycle === 'pruned' || lifecycle === 'skipped' ? null : clampText(asText(node.failure_reason), 500),
    parentTitle: parent ? presentRsiNode(parent, { ...context, allNodes }).title : null,
    iteration: round,
    attempt,
    score,
    parentScore,
    scoreDelta: score != null && parentScore != null ? score - parentScore : null,
    rawNodeId: node.node_id,
  };
}

export function nodeChangeGroup(change: RsiNodeChange): string {
  return change.group ?? change.element ?? change.function ?? change.target ?? '';
}

export function nodeChangeSummary(change: RsiNodeChange): string {
  return change.summary ?? change.reason ?? change.operation ?? '';
}

// 任务状态 → 中文标签 key（i18n key 后缀）
const STATUS_LABEL_KEY: Record<RsiTaskStatus, string> = {
  CREATED: 'statusCreated',
  QUEUED: 'statusQueued',
  RUNNING: 'statusRunning',
  COMPLETED: 'statusCompleted',
  FAILED: 'statusFailed',
  PAUSED: 'statusPaused',
  TERMINATED: 'statusTerminated',
};

export function statusLabelKey(status: RsiTaskStatus): string {
  return STATUS_LABEL_KEY[status] ?? 'statusCreated';
}

// 完成态代表任务生命周期已结束，展示进度必须收敛到 100%，不再受最后一条 P2 迭代值影响。
export function progressPercent(status: RsiTaskStatus, iteration: number, total: number): number {
  if (status === 'COMPLETED') return 100;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((iteration / total) * 100));
}

// 运行态操作按钮映射：根据当前状态返回可执行动作集
export type RsiActionKind = 'config' | 'delete' | 'pause' | 'resume' | 'stop' | 'install' | 'download';

export function actionsForStatus(
  status: RsiTaskStatus,
  scenario: RsiScenario,
  installed = false,
  tree: RsiTreeGetResult | null = null,
  _artifactType: RsiArtifactType | null = null,
): RsiActionKind[] {
  const actions: RsiActionKind[] = ['config', 'delete'];
  switch (status) {
    case 'QUEUED':
    case 'CREATED':
      actions.push('pause');
      break;
    case 'RUNNING':
      // 引擎不支持运行中暂停，统一提供停止任务（后端 terminate）。
      actions.push('stop');
      break;
    case 'PAUSED':
      // 暂停后统一可继续（resume）；论文恢复依赖 agent-core 的 PaperArtifactProviderImpl 支持。
      actions.push('resume');
      break;
    case 'COMPLETED':
      if (!installed) {
        if (scenario === 'HARNESS') {
          // 仅有基线节点（没有真正展开优化）时，尚未生成可安装的 Harness 插件包。
          const hasOptimizedNodes = (tree?.nodes.length ?? 0) > 1;
          if (hasOptimizedNodes) actions.push('install');
        } else {
          actions.push('download');
        }
      }
      break;
    case 'FAILED':
    case 'TERMINATED':
      break;
  }
  return actions;
}

// 分数格式化：默认保留 1 位小数，null 显示 —
export function formatScore(score: number | null, digits = 1): string {
  if (score == null || Number.isNaN(score)) return '--';
  return score.toFixed(digits);
}

// 程序演进的分数按百分制显示：×100 后保留 1 位小数（0.5524531 → 55.2）。
// 引擎给的是归一化到 [0,1] 的分数，常在 0.5 附近以千分位变化
// （relative_to_baseline 下 2x 的改进也只到 0.667），百分制正好把那一档变化摆到小数点前。
// Harness keeps three decimal places; paper and program retain one decimal place.
export function scoreDigits(_artifactType?: RsiArtifactType | null, scenario?: RsiScenario): number {
  return scenario === 'HARNESS' ? 3 : 1;
}

export function scoreScale(artifactType?: RsiArtifactType | null): number {
  return artifactType === 'PROGRAM' ? 100 : 1;
}

// 展示用：按产物类型换算并格式化。两件事绑在一起，避免某个展示位只做了其中一件。
export function formatArtifactScore(
  score: number | null,
  artifactType?: RsiArtifactType | null,
  scenario?: RsiScenario,
): string {
  if (score == null || Number.isNaN(score)) return '--';
  return formatScore(score * scoreScale(artifactType), scoreDigits(artifactType, scenario));
}

// 提升百分比：↑ 5.2% / ↓ 2.1%，null 显示空串
export function formatGain(gain: number | null): { text: string; kind: 'up' | 'down' | 'none' } {
  if (gain == null || Number.isNaN(gain)) return { text: '', kind: 'none' };
  const pct = gain * 100;
  if (pct >= 0) return { text: `${pct.toFixed(1)}% ↑`, kind: 'up' };
  return { text: `${Math.abs(pct).toFixed(1)}% ↓`, kind: 'down' };
}

// token 用量格式化：万 tokens
export function formatTokens(tokens: { input: number; output: number; cache_hit: number }): string {
  const total = tokens.input + tokens.output;
  const wan = total / 10000;
  if (wan >= 1) return i18n.t('rsi.presentation.formatTokens', { value: wan.toFixed(1) });
  return `${total}tokens`;
}

// token 用量格式化（K/M 单位）：数值与单位分离返回，供摘要条「数值大字 + 单位小字」排版。K/M 归入数值（不用小字），数值与单位间的空隙由 unit 前导空格自带。示例 { value: '123K', unit: ' tokens' }
// K 档数值超过 4 位（含取整进位，如 9999.6K）时换用 M（1000K=1M）并保留两位小数，避免大数值拉宽摘要条：
// 1230K → '1230K'，9999K → '9999K'，9999.6K → '10.00M'，12345678 → '12.35M'
export function formatTokensK(tokens: { input: number; output: number; cache_hit: number }): {
  value: string;
  unit: string;
} {
  // cache_hit 是 input 的子集，不应重复计入总量。
  const total = tokens.input + tokens.output;
  const kValue = total / 1000;
  if (kValue >= 1) {
    // 先取整再判档：进位跨入 M 档（如 9999.6K → 10000K）同样按 M 输出，保证 K 档最多 4 位
    const roundedK = Math.round(kValue);
    if (roundedK >= 10000) return { value: `${(kValue / 1000).toFixed(2)}M`, unit: ' tokens' };
    return { value: `${roundedK}K`, unit: ' tokens' };
  }
  return { value: String(total), unit: ' tokens' };
}

// 费用格式化：元
export function formatCost(cost: number | null): string {
  if (cost == null) return '--';
  return cost.toFixed(2);
}

// 日期时间格式化：ISO 字符串 → 本地 'YYYY-MM-DD HH:mm:ss'（对齐样式概要示例）
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-') +
    ' ' +
    [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join(':')
  );
}

// 场景显示名：面向用户的名称不再使用“产物优化|论文”这种技术分隔符。
export function scenarioLabel(scenario: 'HARNESS' | 'ARTIFACT'): string {
  return scenario === 'HARNESS' ? i18n.t('rsi.presentation.scenario.harness') : i18n.t('rsi.presentation.scenario.artifact');
}
export function artifactTypeLabel(type: 'PAPER' | 'PROGRAM'): string {
  return type === 'PAPER' ? i18n.t('rsi.presentation.artifactType.paper') : i18n.t('rsi.presentation.artifactType.program');
}
// 完整类型标签：Harness优化 / 论文优化 / 程序优化
export function typeDisplayLabel(scenario: 'HARNESS' | 'ARTIFACT', artifactType: 'PAPER' | 'PROGRAM' | null): string {
  if (scenario === 'HARNESS') return i18n.t('rsi.presentation.typeDisplay.harness');
  return artifactType === 'PROGRAM' ? i18n.t('rsi.presentation.typeDisplay.program') : i18n.t('rsi.presentation.typeDisplay.paper');
}

// 状态徽章信息：i18n 标签 key + 图标类型
export type StatusBadgeKind = 'queued' | 'running' | 'paused' | 'completed' | 'failed';

export interface StatusBadgeInfo {
  labelKey: string;
  kind: StatusBadgeKind | null;
}

export function statusBadgeInfo(status: RsiTaskStatus): StatusBadgeInfo {
  switch (status) {
    case 'QUEUED':
    case 'CREATED':
      return { labelKey: 'statusQueued', kind: 'queued' };
    case 'RUNNING':
      return { labelKey: 'statusRunning', kind: 'running' };
    case 'PAUSED':
      return { labelKey: 'statusPaused', kind: 'paused' };
    case 'COMPLETED':
      return { labelKey: 'statusCompleted', kind: 'completed' };
    case 'FAILED':
    case 'TERMINATED':
      return { labelKey: statusLabelKey(status), kind: 'failed' };
  }
}

// 节点显示名称：保留旧调用点的兼容包装。新 UI 使用 presentRsiNode，避免把 UUID 直接展示给用户。
export function nodeDisplayName(
  type: RsiNodeType,
  nodeId: string,
  scenario: RsiScenario,
  artifactType: RsiArtifactType | null,
): string {
  if (type === 'ROOT') {
    if (scenario === 'HARNESS') return i18n.t('rsi.presentation.title.baselineHarness');
    if (artifactType === 'PAPER') return i18n.t('rsi.presentation.title.baselinePaper');
    return i18n.t('rsi.presentation.title.baselineProgram');
  }
  const objectLabel = artifactObjectLabel(scenario, artifactType);
  const match = nodeId.match(/(?:attempt|node|N|:)(\d+)$/i);
  const ordinal = match?.[1] ?? i18n.t('rsi.presentation.nodeDisplayName.candidateDefault');
  return type === 'ADOPTED' ? i18n.t('rsi.presentation.nodeDisplayName.version', { label: objectLabel, ordinal }) : i18n.t('rsi.presentation.nodeDisplayName.candidate', { label: objectLabel, ordinal });
}

// 节点状态标签（兼容旧调用点）；新 UI 使用 presentRsiNode.runtimeLabel。
export function nodeStatusLabel(type: RsiNodeType): string {
  switch (type) {
    case 'ROOT':
      return i18n.t('rsi.presentation.statusLabel.baseline');
    case 'ADOPTED':
      return i18n.t('rsi.presentation.statusLabel.bestCurrent');
    case 'REJECTED':
      return i18n.t('rsi.presentation.statusLabel.rejected');
    case 'PROVISIONAL':
      return i18n.t('rsi.presentation.statusLabel.inProgress');
    case 'PRUNED':
      return i18n.t('rsi.presentation.statusLabel.pruned');
  }
}

// ── 运行态展示：区分「评测中」与「待评测」（同色 #FCE7AE，图标/文案不同）──
// provisional + 任务运行中 → 评测中；provisional + 任务非运行 → 待评测。
// 后端若给节点增加独立评测状态字段，可在 nodeRuntimeKind 内替换该启发式。
export type NodeRuntimeKind = 'best-path' | 'evaluated' | 'evaluating' | 'pending' | 'failed' | 'pruned';

export type NodeIconKind = 'crown' | 'check' | 'chevron-double' | 'clock' | 'minus';

// 节点 type + 任务运行态 → 运行态 kind（决定图标与右侧标签）
export function nodeRuntimeKind(type: RsiNodeType, taskRunning: boolean): NodeRuntimeKind {
  switch (type) {
    case 'ROOT':
    case 'ADOPTED':
      return 'best-path';
    case 'REJECTED':
      return 'evaluated';
    case 'PROVISIONAL':
      return taskRunning ? 'evaluating' : 'pending';
    case 'PRUNED':
      return 'pruned';
  }
}

/** Node-aware runtime mapping. Unlike the legacy type-only helper, this distinguishes failed attempts. */
export function nodeRuntimeKindForNode(node: RsiTreeNode, taskRunning: boolean): NodeRuntimeKind {
  const lifecycle = lifecycleForNode(node, taskRunning);
  return lifecycleRuntimeKind(lifecycle);
}

// 运行态 kind → 上层背景色 class（评测中复用 pending 色板）
export function runtimeKindColorClass(kind: NodeRuntimeKind): string {
  const color = kind === 'evaluating' ? 'pending' : kind;
  return `rsi-node__bar--${color}`;
}

// 运行态 kind → 上层左侧黑色徽章内的图标
export function runtimeIconKind(kind: NodeRuntimeKind): NodeIconKind {
  switch (kind) {
    case 'best-path':
      return 'crown';
    case 'evaluated':
      return 'check';
    case 'evaluating':
      return 'chevron-double';
    case 'failed':
      return 'minus';
    case 'pending':
      return 'clock';
    case 'pruned':
      return 'minus';
  }
}

// 运行态 kind → 上层右侧状态标签
export function nodeRuntimeLabel(kind: NodeRuntimeKind): string {
  switch (kind) {
    case 'best-path':
      return i18n.t('rsi.presentation.lifecycle.bestCurrent');
    case 'evaluated':
      return i18n.t('rsi.presentation.lifecycle.rejected');
    case 'evaluating':
      return i18n.t('rsi.presentation.lifecycle.evaluating');
    case 'pending':
      return i18n.t('rsi.presentation.lifecycle.pending');
    case 'failed':
      return i18n.t('rsi.presentation.lifecycle.failed');
    case 'pruned':
      return i18n.t('rsi.presentation.lifecycle.pruned');
  }
}

// Harness cards show only the node score; artifact cards may include additional metrics.
export interface NodeScoreLine {
  value: string;
  label: string;
}

export function nodeScoreLines(
  node: RsiTreeNode,
  artifactType?: RsiArtifactType | null,
  scenario?: RsiScenario,
): NodeScoreLine[] {
  const lines: NodeScoreLine[] = [];
  const score = scoreForNode(node);
  if (score != null) lines.push({ value: formatArtifactScore(score, artifactType, scenario), label: i18n.t('rsi.presentation.score.label') });
  if (scenario === 'HARNESS') return lines;
  const extra = node.extra;
  if (extra && typeof extra === 'object') {
    const potential = extra['potential_score'];
    if (typeof potential === 'number')
      lines.push({ value: formatArtifactScore(potential, artifactType), label: i18n.t('rsi.presentation.score.potential') });
    const other = extra['other_score'];
    if (typeof other === 'number') lines.push({ value: formatArtifactScore(other, artifactType), label: i18n.t('rsi.presentation.score.other') });
    for (const [k, v] of Object.entries(extra)) {
      if (k === 'potential_score' || k === 'other_score') continue;
      if (k.endsWith('_score') && typeof v === 'number') {
        lines.push({ value: formatArtifactScore(v, artifactType), label: scoreLabel(k.replace(/_score$/, '')) });
      }
    }
  }
  return lines;
}

function scoreLabel(value: string): string {
  const labelKeys: Record<string, string> = {
    overall: 'rsi.presentation.score.overall',
    quality: 'rsi.presentation.score.quality',
    correctness: 'rsi.presentation.score.correctness',
    gate: 'rsi.presentation.score.gate',
    reward: 'rsi.presentation.score.reward',
    rollout: 'rsi.presentation.score.rollout',
  };
  return labelKeys[value.toLowerCase()] ? i18n.t(labelKeys[value.toLowerCase()]) : value.replace(/[_-]+/g, ' ');
}

// 节点尺寸估算（布局与组件共用，保证布局高度=渲染高度）
// 上层高度固定 32；下层高度随内容行数变化；评测中宽度最大 280。
export const RSI_NODE_BAR_H = 32;
export const RSI_SCORE_LINE_H = 26; // 分数行行高
export const RSI_EVAL_LINE_H = 24; // 评测中/文本行高
export const RSI_SUMMARY_LINE_H = 20; // 节点摘要行高
export const RSI_STAGE_LINE_H = 16; // 根节点评测阶段提示行高
export const RSI_BODY_PAD = 8; // 下层上下 padding 合计
export const RSI_BODY_MIN_H = 42; // 下层最小高度（与节点高保真 32 + 42 对齐）
export const RSI_NODE_MIN_W = 180;
export const RSI_NODE_MAX_W = 280;
export const RSI_SCORE_TOGGLE_H = 20; // 展开按钮(分隔符+行)高度

export interface NodeMetrics {
  width: number;
  barH: number;
  bodyH: number;
}

// 评测中文本行数估算（按估算宽度每行可容纳字符数，最多 4 行）
function evalTextRows(text: string, width: number): number {
  const charsPerLine = Math.max(1, Math.floor((width - 24) / 14));
  return Math.min(4, Math.max(1, Math.ceil(text.length / charsPerLine)));
}

function summaryRows(text: string, width: number): number {
  const charsPerLine = Math.max(1, Math.floor((width - 20) / 8));
  return Math.min(2, Math.max(1, Math.ceil(text.length / charsPerLine)));
}

// 节点宽高估算：barH(32) + bodyH(随内容)；评测中宽度自适应(<=280)。
export function nodeMetrics(
  node: RsiTreeNode,
  kind: NodeRuntimeKind,
  scoreExpanded: boolean,
  scenario?: RsiScenario,
): NodeMetrics {
  const barH = RSI_NODE_BAR_H;
  let width = RSI_NODE_MIN_W;
  let bodyH = RSI_BODY_PAD;
  const summary = nodeSummaryText(node);
  const stage = nodeStageLabel(node);
  const rootStageRunning = node.type === 'ROOT' && nodeStageSpec(node)?.status === 'running';
  if (kind === 'evaluating') {
    const text = stage ?? summary ?? i18n.t('rsi.presentation.processing');
    const secondary = stage && summary ? summary : null;
    width = Math.min(RSI_NODE_MAX_W, Math.max(RSI_NODE_MIN_W, text.length * 8 + 32));
    bodyH = Math.max(
      RSI_BODY_MIN_H,
      RSI_BODY_PAD + evalTextRows(text, width) * RSI_EVAL_LINE_H + (secondary ? RSI_SUMMARY_LINE_H : 0),
    );
  } else if (kind === 'best-path' || kind === 'evaluated') {
    const linesArr = nodeScoreLines(node, undefined, scenario);
    const shown = scoreExpanded ? Math.min(linesArr.length, 5) : Math.min(linesArr.length, 3);
    const summaryH = summary ? summaryRows(summary, RSI_NODE_MIN_W) * RSI_SUMMARY_LINE_H : 0;
    const stageH = rootStageRunning ? RSI_STAGE_LINE_H : 0;
    bodyH = Math.max(RSI_BODY_MIN_H, RSI_BODY_PAD + stageH + summaryH + shown * RSI_SCORE_LINE_H);
    if (linesArr.length > 3) bodyH += RSI_SCORE_TOGGLE_H;
  } else if (kind === 'pending') {
    bodyH = Math.max(RSI_BODY_MIN_H, RSI_BODY_PAD + RSI_SUMMARY_LINE_H);
  } else if (kind === 'failed') {
    bodyH = Math.max(RSI_BODY_MIN_H, RSI_BODY_PAD + RSI_EVAL_LINE_H + (node.failure_reason ? RSI_SUMMARY_LINE_H : 0));
  } else if (kind === 'pruned') {
    bodyH = Math.max(
      RSI_BODY_MIN_H,
      RSI_BODY_PAD + (node.score == null && !summary ? RSI_EVAL_LINE_H : RSI_SCORE_LINE_H),
    );
  }
  return { width, barH, bodyH };
}

// 节点总高度
export function nodeHeight(
  node: RsiTreeNode,
  kind: NodeRuntimeKind,
  scoreExpanded: boolean,
  scenario?: RsiScenario,
): number {
  const m = nodeMetrics(node, kind, scoreExpanded, scenario);
  return m.barH + m.bodyH;
}
