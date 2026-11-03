import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { describe, jsonFile } from './metadata.mjs';

const main = path.resolve('fixtures/app');
const config = { project: 'shop', worktree_base: '../app-wt',
  workflow: { areas: { backend: { slot: 'backend' } } } };

test('configured full path maps to area and exact branch registry record', () => {
  const w = { path: path.resolve(main, '../app-wt/backend'), branch: 'feat-orders' };
  const registry = { tasks: {
    old: { root: w.path, branch: 'feat-old', status: 'integrated' },
    orders: { root: w.path, branch: w.branch, area: 'backend', issue: 12, status: 'ready_for_review' },
  } };
  const view = describe(w, main, config, registry, null, null);
  assert.equal(view.displayName, '백엔드');
  assert.equal(view.phase, 'orders');
  assert.equal(view.workflowStatus, 'ready_for_review');
  assert.equal(view.issue, 12);
});

test('same basename elsewhere is not falsely assigned an area', () => {
  const w = { path: path.resolve(main, '../other/backend'), branch: 'feat-orders' };
  const view = describe(w, main, config, null, null, { phase: 'orders', issue: 12 });
  assert.equal(view.area, null);
  assert.equal(view.kind, '외부 워크트리');
  assert.equal(view.workflowStatus, '명세 있음');
});

test('external titles omit branches while identity stays separate', () => {
  for (const tool of ['claude', 'codex']) {
    const w = { path: path.resolve(main, `.${tool}/worktrees/random-id`), branch: 'fix/12-orders' };
    const view = describe(w, main, config, null, null, null);
    assert.equal(view.displayName, tool === 'claude' ? 'Claude 임시' : 'Codex 임시');
    assert.equal(view.task, null);
    assert.equal(view.workspaceId, 'random-id');
    assert.equal(view.area, null);
    assert.equal(view.originalName, 'random-id');
  }
});

test('lock is a record, not proof of a live process', () => {
  const w = { path: path.resolve(main, '../app-wt/backend'), branch: 'feat-orders' };
  const view = describe(w, main, config, null, { phase: 'orders', issue: 12 }, null);
  assert.equal(view.workflowStatus, '잠금 기록');
});

test('detached Codex worktrees with the same folder name stay distinguishable', () => {
  const first = describe({ path: path.resolve(main, '.codex/worktrees/abc/app'), head: '123456789',
    branch: null, subject: 'fix orders' }, main, config, null, null, null);
  const second = describe({ path: path.resolve(main, '.codex/worktrees/def/app'), head: '123456789',
    branch: null }, main, config, null, null, null);
  assert.notEqual(first.workspaceId, second.workspaceId);
  assert.equal(first.workspaceId, 'abc');
  assert.equal(first.task, null);
});

test('legacy configured slots get names without invented area ownership', () => {
  const legacy = { project: 'shop', worktree_base: '../app-wt', slots: { extra: ['dev', 'review'] } };
  const view = describe({ path: path.resolve(main, '../app-wt/dev-2'), branch: 'fix/orders' },
    main, legacy, null, null, null);
  assert.equal(view.displayName, 'dev-2');
  assert.equal(view.kind, '기존 슬롯');
  assert.equal(view.area, null);
});

test('corrupt JSON is explicit; missing file is optional', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gitwatch-metadata-'));
  try {
    const file = path.join(dir, 'harness.json');
    assert.equal((await jsonFile(file)).error, undefined);
    await writeFile(file, 'invalid');
    assert.match((await jsonFile(file)).error, /조회 실패/);
  } finally {
    // Only the newly allocated test directory is removed.
    assert.equal(path.dirname(dir), os.tmpdir());
    await rm(dir, { recursive: true });
  }
});
