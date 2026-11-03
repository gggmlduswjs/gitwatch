// Display names come from declared harness state, never guessed domain ownership.
import path from 'node:path';
import { readFile } from 'node:fs/promises';

export async function jsonFile(file) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid metadata');
    return { value };
  }
  catch (error) {
    return error.code === 'ENOENT' ? { value: null } : { value: null, error: `${path.basename(file)} 조회 실패` };
  }
}

function key(p) {
  const normalized = path.resolve(p);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function describe(w, main, config, registry, lock, manifest) {
  const original = path.basename(w.path);
  const project = config?.project || path.basename(main);
  const areaEntry = Object.entries(config?.workflow?.areas || {}).find(([, area]) =>
    area?.enabled !== false && typeof area?.slot === 'string' && typeof config.worktree_base === 'string' &&
    key(w.path) === key(path.resolve(main, config.worktree_base, area.slot)));
  const records = Object.entries(registry?.tasks || {}).filter(([, task]) =>
    task && typeof task.root === 'string' && key(task.root) === key(w.path) &&
    task.branch === w.branch);
  records.sort((a, b) => String(b[1].started_at || b[1].registered_at || '').localeCompare(
    String(a[1].started_at || a[1].registered_at || '')));
  const record = records[0];
  const phase = record?.[0] || lock?.phase || manifest?.phase || null;
  const issue = record?.[1]?.issue || lock?.issue || manifest?.issue || null;
  const area = areaEntry?.[0] || null;
  const normalized = w.path.replaceAll('\\', '/');
  const legacyNames = [...(config?.slots?.extra || []), ...(config?.slots?.products || []).flatMap(
    product => (config?.slots?.layers || []).map(layer => `${product}-${layer}`))];
  const legacySlot = typeof config?.worktree_base === 'string' &&
    key(path.dirname(w.path)) === key(path.resolve(main, config.worktree_base)) &&
    legacyNames.some(name => original === name || /^[2-9]$/.test(original.slice(name.length + 1)) && original.startsWith(`${name}-`));
  const kind = key(w.path) === key(main) ? '기준 작업공간' : area ? '영역 슬롯' : legacySlot ? '기존 슬롯' :
    normalized.includes('/.claude/worktrees/') ? 'Claude 임시' :
    normalized.includes('/.codex/worktrees/') ? 'Codex 임시' : '외부 워크트리';
  const externalId = /\/\.(?:claude|codex)\/worktrees\/([^/]+)/.exec(normalized)?.[1] || original;
  // A declared area on an external worktree is a task hint, not a managed slot.
  return { project, area, phase, issue, kind,
    displayName: area ? areaLabel(area) : legacySlot ? original : kind,
    workspaceId: externalId,
    task: phase,
    workflowStatus: record?.[1]?.status || (lock ? '잠금 기록' : phase ? '명세 있음' : null),
    originalName: original };
}

export function areaLabel(area) {
  return ({ web: '웹', frontend: '프론트엔드', backend: '백엔드', ai: 'AI 워크플로우', mobile: '모바일' })[area] || area;
}

export async function metadata(w, context) {
  const lock = await jsonFile(path.join(w.path, '.slot-lock'));
  const branchPhase = /^feat-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(w.branch || '')?.[1];
  const spec = branchPhase ? await jsonFile(path.join(w.path, 'phases', branchPhase, 'index.json')) : { value: null };
  const manifest = spec.value?.phase === branchPhase ? spec.value : null;
  const errors = [context.error, lock.error, spec.error].filter(Boolean);
  return { ...describe(w, context.main, context.config, context.registry, lock.value, manifest),
    metadataError: errors.join('; ') || null };
}
