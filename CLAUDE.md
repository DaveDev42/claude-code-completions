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
- `claude-code-completions audit` 는 `src/overrides.js` 를 현재 `claude --help`
  와 비교해 drift 를 잡는다 (orphan override, enum 값 누락 등). 새 모델/permission-mode
  가 추가되면 enum-missing 에러로 보임 → 사람이 `overrides.js` 갱신 + 새 release
  까지 해줘야 사용자 머신에 반영된다. CI 가 audit 을 자동 실행하지는 않음 (cron PR
  운영 부담이 크고 사용자 머신은 generator 코드가 v0.x.y 에 박혀있어 단순 데이터
  PR 로 해결되지 않기 때문).
- Loader 의 fast path: `cache_dir/.claude-meta` 한 줄 (`path\tmtime\tversion`).
  claude 바이너리의 path+mtime 이 일치하면 `claude --version` spawn 없이 캐시
  바로 source. 측정: slow path 1.16s → fast path 0.043s.
- `.claude/commands/upgrade-completion.md` 는 이 repo 안에서만 동작하는
  project-scope 슬래시 명령. 이 repo 에서 `claude` 를 실행하면 자동으로
  `/upgrade-completion` 으로 호출 가능 (사용자 측 install 필요 없음).
  내용은 prefetch 실행 + 실패 시 doctor 호출.
- 이 repo 자체는 캐시를 사용하지 않음 — `completions/` 는 fallback 산출물 (loader가
  generator를 못 돌릴 때만 사용; 평소엔 항상 캐시가 우선). 옛날엔 매주 cron 으로
  refresh PR 을 만들었지만 v0.3.0 에서 제거 (재배포 동반 안 되면 사용자 영향 0,
  머지 부담만 큼). 필요 시 수동으로 `npm run generate` + commit.
- Repo에 편집 금지 바이너리 결과물: `completions/` (생성물). 수정은 `src/` 또는
  `src/overrides.js` 에서.

## generator 주의

**zsh `_arguments` spec 의 variadic + mutex 조합은 금지**. `'*(--a --b){--a,--b}[..]'`
형태는 zsh 가 "invalid rest argument definition" 으로 거부하고 그 cached 파일이
`_claude` 함수 정의를 못 끝내 `command not found: _claude` 가 follow up 으로 터진다.
v0.2.0 에서 이 버그가 production 까지 갔다. v0.3.0 에서는 variadic 이면 alias 별
한 줄씩 펼쳐 emit. `test/generators.test.js` 의 "5b. variadic + mutex" 회귀 케이스
참고. 새 zsh 패턴 추가 시 `zsh -n` 만으로는 부족하고 `compinit` 후 실제 source
시뮬까지 해보는 게 안전.
