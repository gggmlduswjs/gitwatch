# gitwatch

여러 git worktree 상태를 한 화면에 보는 **읽기 전용** 관제판 (Windows). 의존성 0, Node 20+.
본보기: 김민태 GitWatcher(macOS, 비공개 — 터미널 부품 수정만 공개 `ibare/SwiftTerm@gitwatcher`).

```
node server.mjs C:\Users\user\Desktop\bigsix [다른 레포 ...]
# → http://127.0.0.1:3810   (GITWATCH_PORT · GITWATCH_BASE=origin/main 로 바꿈)
```

- 칸: worktree · 브랜치 · 변경(커밋 안 된 파일 수) · 앞섬/뒤짐(기준 브랜치 대비) · 마지막 커밋
- 조회 실패는 0 이 아니라 「조회 실패」로 보인다. fetch 하지 않는다(로컬 `origin/main` 기준).
- 기본은 「활동 있는 것만」(변경 있음 · 앞섬 · 7일 안). 30초마다 갱신.

## 다음 단계
1. PR 상태(머지됨·열림·CI) — `gh pr list` 한 번으로 붙이기. squash 머지된 브랜치가 「앞섬」으로 남는 문제 해결
2. 「볼 차례」 — Claude Code `Notification`/`Stop` 훅이 POST → 해당 worktree 강조
3. 터미널 내장 — xterm.js + node-pty(ConPTY)
