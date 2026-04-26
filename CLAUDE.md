# CLAUDE.md

## 프로젝트 개요

Claude Code CLI용 쉘 completion 생성기. `claude --help`를 파싱해 shell-agnostic IR로
변환하고, zsh/bash/fish용 completion 스크립트를 생성한다. 사용자 머신에서는 얇은
loader가 설치된 `claude` 버전에 맞춰 캐시된 completion을 소싱하거나 재생성한다.

## 기술 스택

- Node.js >= 18, ESM (`"type": "module"`)
- 외부 런타임 의존성 없음 (표준 라이브러리만 사용)
- Homebrew 배포 (`Formula/` 디렉토리)

## 명령어

```sh
# 세 쉘 completion 전부 생성 → completions/
npm run generate

# 테스트 (parse.js IR 검증)
npm test

# CLI 직접 사용
node bin/claude-code-completions.js generate --shell zsh --out ./completions
node bin/claude-code-completions.js generate --all --out ./completions
node bin/claude-code-completions.js parse   # IR을 JSON으로 stdout 출력
```

로컬에서 `claude` 바이너리 없이 개발하려면 저장된 help 출력을 넘긴다:

```sh
node bin/claude-code-completions.js generate --shell zsh --help-file test/fixtures/help.txt --version 1.0.0
```

## 쉘별 주의

**세 loader 모두** `shell-loaders/` 에 있고 각자의 쉘에서만 소싱된다. 즉 런타임
"쉘 감지" 로직은 없다 — Homebrew가 파일을 각 쉘의 completion 경로에 배치하는
구조에 의존한다. CI에서 `$SHELL`이 미설정이라도 이 프로젝트의 CLI (`bin/`)는
영향받지 않는다. CLI는 `--shell` 플래그로 타겟을 명시한다.

쉘별 completion 문법 차이는 `src/generators/{zsh,bash,fish}.js` 세 파일에 격리돼
있다. 새 쉘을 추가하려면 같은 IR을 받는 generator 하나만 구현하면 된다
(`bin/claude-code-completions.js`의 `GENERATORS` 맵에도 등록).

Loader 수정 시 실제 설치 없이 검증하려면:

```sh
# zsh 예: 로컬에서 한 번만 소스해 보기
XDG_CACHE_HOME=/tmp/xdg CLAUDE_COMPLETIONS_BIN="$PWD/bin/claude-code-completions.js" \
  zsh -c 'fpath=("$PWD/shell-loaders" $fpath); autoload -Uz compinit && compinit; claude <tab>'
```

## 개발 환경

- 캐시 경로 (end-user 머신, loader가 기록): `${XDG_CACHE_HOME:-$HOME/.cache}/claude-code-completions/`
  - 파일명 형식: `_claude-<version>`, `claude.bash-<version>`, `claude.fish-<version>`
  - 세 loader 모두 동일하게 사용 (`shell-loaders/_claude:7`, `claude.bash:6`, `claude.fish:5-7`).
  - Loader는 cache miss 후 generate 직후 같은 prefix 의 옛 버전 파일을 prune 한다
    (zsh: `(N)` glob, bash: `shopt -s nullglob`, fish: native glob).
- `claude-code-completions prefetch` 는 위 캐시 경로에 세 쉘 분 한 번에 써 두고
  옛 버전 항목을 prune 한다. cron / launchd / SessionStart hook 에서 호출해
  claude 업그레이드 직후 첫 탭 지연을 없애는 용도.
- 이 repo 자체는 캐시를 사용하지 않음 — `completions/` 는 fallback 산출물 (loader가
  generator를 못 돌릴 때만 사용; 평소엔 항상 캐시가 우선). `.github/workflows/update.yml`
  cron이 매일 06:00 UTC에 새 claude 버전으로 재생성해 PR 을 연다.
- Repo에 편집 금지 바이너리 결과물: `completions/` (생성물). 수정은 `src/` 또는
  `src/overrides.js` 에서.
