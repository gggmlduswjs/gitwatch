// gitwatch — 여러 git worktree 상태를 한 화면에 보는 읽기 전용 관제판 (Windows 용).
// 본보기: 김민태 GitWatcher(macOS, 비공개). 의존성 0 — Node 20+ 표준 라이브러리만.
//
//   node server.mjs C:\path\to\repo [다른 레포 ...]
//   → http://127.0.0.1:3810
//
// 읽기 전용: git 은 조회 명령(worktree list · status · rev-list · log)만 부른다. fetch 도 하지 않는다.
// 조회 실패는 0 이 아니라 error 로 내려 화면에 「조회 실패」로 보인다.

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { areaLabel, jsonFile, metadata } from './metadata.mjs';

const PORT = Number(process.env.GITWATCH_PORT || 3810);
const BASE = process.env.GITWATCH_BASE || 'origin/main';
const REPOS = process.argv.slice(2);
if (!REPOS.length) { console.error('사용법: node server.mjs <레포 경로> [...]'); process.exit(2); }

// ponytail: 전역 동시 실행 16개 제한 — worktree 수백 개에서 프로세스 폭주 방지. 느리면 숫자만 올린다.
let running = 0; const queue = [];
function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const run = () => {
      running++;
      execFile('git', args, { cwd, windowsHide: true, timeout: 15000, maxBuffer: 8 << 20 }, (err, out) => {
        running--; queue.shift()?.();
        err ? reject(err) : resolve(out);
      });
    };
    running < 16 ? run() : queue.push(run);
  });
}

async function worktrees(repo) {
  const out = await git(repo, ['worktree', 'list', '--porcelain']);
  return out.split(/\r?\n\r?\n/).filter(Boolean).map(block => {
    const w = {};
    for (const line of block.split(/\r?\n/)) {
      const [k, ...v] = line.split(' ');
      w[k] = v.join(' ') || true;
    }
    return { path: w.worktree, branch: (w.branch || '').replace('refs/heads/', '') || null, head: w.HEAD, prunable: !!w.prunable };
  });
}

async function inspect(w) {
  if (w.prunable || !existsSync(w.path)) return { ...w, error: '폴더 없음(prunable)' };
  try {
    const [status, counts, last] = await Promise.all([
      git(w.path, ['status', '--porcelain']),
      git(w.path, ['rev-list', '--left-right', '--count', `${BASE}...HEAD`]).catch(() => null),
      git(w.path, ['log', '-1', '--format=%ct%x09%s']),
    ]);
    const [behind, ahead] = counts ? counts.trim().split(/\s+/).map(Number) : [null, null];
    const [ts, ...subject] = last.trim().split('\t');
    return { ...w, dirty: status.split(/\r?\n/).filter(Boolean).length, ahead, behind, lastCommit: Number(ts) * 1000, subject: subject.join('\t') };
  } catch (e) {
    return { ...w, error: String(e.message || e).split('\n')[0] };
  }
}

async function state() {
  const repos = await Promise.all(REPOS.map(async repo => {
    try {
      const trees = await worktrees(repo);
      const common = (await git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
      const main = trees[0]?.path || path.dirname(common);
      const [config, registry] = await Promise.all([
        jsonFile(path.join(main, 'harness.json')), jsonFile(path.join(common, 'harness', 'workflow.json')),
      ]);
      if (registry.value && (!registry.value.tasks || typeof registry.value.tasks !== 'object' ||
          Array.isArray(registry.value.tasks))) {
        registry.error = 'workflow.json 형식 오류';
        registry.value = null;
      }
      const context = { main, config: config.value, registry: registry.value,
        error: [config.error, registry.error].filter(Boolean).join('; ') };
      return { repo, name: path.basename(main), metadataError: context.error || null,
        areas: Object.entries(config.value?.workflow?.areas || {}).map(([id, area]) => ({ id, label: areaLabel(id), enabled: area.enabled !== false })),
        worktrees: await Promise.all(trees.map(async w => {
        const current = await inspect(w);
        return { ...current, ...await metadata(current, context) };
      })) };
    }
    catch (e) { return { repo, error: String(e.message || e).split('\n')[0], worktrees: [] }; }
  }));
  return { base: BASE, at: Date.now(), repos };
}

const html = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.html');
createServer(async (req, res) => {
  try {
    if (req.url === '/api/state') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(await state()));
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(html));
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`gitwatch http://127.0.0.1:${PORT}  repos=${REPOS.join(', ')}  base=${BASE}`));
