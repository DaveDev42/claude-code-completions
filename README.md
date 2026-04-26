# claude-code-completions

Shell completions for the [Claude Code](https://claude.ai/code) CLI.

Supports **zsh**, **bash**, and **fish**. Completions are auto-generated
from `claude --help` on your machine and refresh the moment `claude`
updates, so they always match your installed version — no separate package
release required to track upstream changes.

Why bother:
- **Always in sync.** The completion is derived from `claude --help` at
  the exact version you have installed. New flag added upstream → next
  shell picks it up.
- **Fast.** A path+mtime sentinel skips `claude --version` on warm shells
  (≈40ms vs 1.16s on a cold cache).
- **Self-diagnosing.** `claude-code-completions doctor` and `audit` make
  failure modes legible instead of "tab just stopped working".

## Requirements

- Node.js ≥ 18 (used at runtime by the generator)
- One of zsh / bash / fish
- `claude` CLI on your `PATH` (without it, the loader falls back to a
  pre-generated static completion shipped with the package)

## Install

### Homebrew (recommended)

```sh
brew tap DaveDev42/tap
brew install claude-code-completions
```

To upgrade later:

```sh
brew update && brew upgrade claude-code-completions
```

After first install, depending on your shell:

**zsh** — completions directory is automatically picked up if your
`$fpath` already includes Homebrew's `site-functions`. If not, add to
`~/.zshrc`:

```sh
fpath=("$(brew --prefix)/share/zsh/site-functions" $fpath)
autoload -Uz compinit && compinit
```

**bash** — add to `~/.bashrc`:

```sh
source "$(brew --prefix)/etc/bash_completion.d/claude.bash"
```

**fish** — works out of the box; Homebrew installs into
`~/.config/fish/completions/`.

### Manual install

```sh
git clone https://github.com/DaveDev42/claude-code-completions.git
cd claude-code-completions
# zsh
ln -s "$PWD/completions/_claude" ~/.local/share/zsh/site-functions/_claude
# bash
echo "source $PWD/completions/claude.bash" >> ~/.bashrc
# fish
ln -s "$PWD/completions/claude.fish" ~/.config/fish/completions/claude.fish
```

## How it works

Two layers:

1. **Thin loader** (installed into your shell's completion path) — on
   every shell start, checks a one-line sentinel at
   `${XDG_CACHE_HOME:-~/.cache}/claude-code-completions/.claude-meta`
   (format: `path<TAB>mtime<TAB>version`). If the recorded path and mtime
   match the current `claude` binary, it sources the cached completion
   without spawning any process. On mismatch (claude was upgraded,
   reinstalled, or moved), it falls through to the slow path: run
   `claude --version`, regenerate the cache, prune the previous version's
   entry, refresh the sentinel.
2. **Generator** (`claude-code-completions` CLI) — parses `claude --help`
   into a shell-agnostic intermediate representation, then emits
   shell-specific completion code. Supplements with manual overrides for
   things `--help` doesn't expose (e.g. model names, MCP/plugin/auth
   subcommands).

Cache layout under `${XDG_CACHE_HOME:-~/.cache}/claude-code-completions/`:

| File | Purpose |
|---|---|
| `_claude-<version>` | zsh completion for that exact `claude` version |
| `claude.bash-<version>` | bash completion |
| `claude.fish-<version>` | fish completion |
| `.claude-meta` | Fast-path sentinel (`path<TAB>mtime<TAB>version`) |

Loaders prune older `_claude-*`, `claude.bash-*`, `claude.fish-*` entries
on the next slow-path miss, so the cache stays at most one entry per
shell.

The pre-generated files in `completions/` (and their installed copies
under `<brew prefix>/share/claude-code-completions/*.static`) are
**fallback only** — used when the generator can't run (e.g. `claude` is
not yet on `PATH` after a fresh install). On a normal machine the
loader-generated cache is always preferred.

## CLI

```sh
# Generate for one shell, write to ./completions/_claude
claude-code-completions generate --shell zsh --out ./completions

# Generate for all supported shells
claude-code-completions generate --all --out ./completions

# Pre-warm the runtime cache for the current claude version (all shells),
# pruning entries for older versions. Run from cron / launchd / a hook /
# the /upgrade-completion slash command to eliminate first-tab latency
# right after claude updates.
claude-code-completions prefetch

# Audit src/overrides.js against the live `claude --help`. Reports orphan
# overrides, missing enum values, and drift. Exits non-zero on errors.
claude-code-completions audit

# Diagnose the install: claude on PATH, --help works, cache state, loader
# files in expected locations, parser end-to-end. Exits non-zero on
# failures.
claude-code-completions doctor

# Dump parsed IR as JSON (useful for debugging)
claude-code-completions parse
```

### Troubleshooting

If completions stop working, run `doctor` first:

```
$ claude-code-completions doctor
claude-code-completions doctor
  [OK  ] claude binary: 2.1.119 (Claude Code)
  [OK  ] claude --help: 73 lines
  [OK  ] cache directory: ~/.cache/claude-code-completions (zsh=1)
  [OK  ] zsh loader: /opt/homebrew/share/zsh/site-functions/_claude
  [WARN] bash loader: not at /opt/homebrew/etc/bash_completion.d/claude.bash (ok if you don't use this shell)
  [OK  ] fish loader: /opt/homebrew/share/fish/vendor_completions.d/claude.fish
  [OK  ] parser: 52 options, 9 commands parsed

6 ok, 1 warn, 0 fail
```

`doctor` exits non-zero on `FAIL` so it composes with shell scripts. If
it reports an issue with overrides specifically, also run `audit` for
the detailed list of orphan / missing / extra entries.

## When does this need updating?

Two distinct flows, and they should not be confused:

1. **`claude` itself updates** (e.g. `claude` 2.1.119 → 2.1.120). The
   loader handles this entirely on your machine — sentinel mismatch on
   the next shell, regenerate, prune. No package release, no `brew
   upgrade`, no internet.
2. **This package itself updates** (parser fix, generator fix, new
   feature). Use `brew upgrade claude-code-completions`. There's no
   periodic cron pushing changes — releases happen when there are
   actual code changes worth shipping.

If you'd like to verify a refresh worked after a `claude` upgrade, run
`claude-code-completions prefetch` in any shell.

Contributors working in this repository can also use the project-scope
`/upgrade-completion` slash command, defined in
`.claude/commands/upgrade-completion.md`. Open this directory with
Claude Code and the command will be available automatically — it runs
`prefetch` and falls back to `doctor` on failure.

## Contributing

- To add support for a new shell, implement a generator in
  `src/generators/<shell>.js` that takes the IR produced by
  `src/parse.js`, and register it in `bin/claude-code-completions.js`'s
  `GENERATORS` map.
- To fix missing enum values or subcommand options, edit
  `src/overrides.js`. The next `audit` run flags drift against
  `claude --help`.
- `npm test` runs four suites: parse, generators (round-trip + mutex +
  escape + variadic), audit, and doctor smoke. Add cases there for any
  IR shape the parser starts producing.

CI runs the same `npm test` plus syntax-checks the pre-generated
completions with `zsh -n`, `bash -n`, and `fish -n`.

## License

MIT
