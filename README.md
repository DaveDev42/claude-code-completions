# claude-code-completions

Shell completions for the [Claude Code](https://claude.ai/code) CLI.

Supports **zsh**, **bash**, and **fish**. Completions are auto-generated from
`claude --help` and regenerate on your machine whenever `claude` is updated, so
you always get completions that match your installed version.

## Install

### Homebrew (recommended)

```sh
brew tap DaveDev42/tap
brew install claude-code-completions
```

Then, depending on your shell:

**zsh** — completions directory is automatically picked up if your `$fpath`
already includes Homebrew's `site-functions`. If not, add to `~/.zshrc`:

```sh
fpath=("$(brew --prefix)/share/zsh/site-functions" $fpath)
autoload -Uz compinit && compinit
```

**bash** — add to `~/.bashrc`:

```sh
source "$(brew --prefix)/etc/bash_completion.d/claude.bash"
```

**fish** — works out of the box; Homebrew installs into `~/.config/fish/completions/`.

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

1. **Thin loader** (installed into your shell's completion path) — on first use,
   runs `claude --version` to detect the installed Claude Code version. If a
   cached completion exists for that version, sources it. Otherwise, runs the
   generator to produce a fresh one.
2. **Generator** (`claude-code-completions` CLI) — parses `claude --help` into
   a shell-agnostic intermediate representation, then emits shell-specific
   completion code. Supplements with manual overrides for things `--help`
   doesn't expose (e.g. model names, subcommand options).

Cache location: `${XDG_CACHE_HOME:-~/.cache}/claude-code-completions/`
Cache files are named `_claude-<version>`, `claude.bash-<version>`, and
`claude.fish-<version>`. Loaders prune cache entries for older versions on
the next miss, so the cache directory stays one entry per shell.

The pre-generated files in `completions/` (and their installed copies under
`<brew prefix>/share/claude-code-completions/*.static`) are **fallback only** —
used when the generator can't run (e.g. `claude` is not yet on `PATH` after a
fresh install). On a normal machine the loader-generated cache is always
preferred.

## CLI

```sh
# Generate for zsh, write to ./completions/_claude
claude-code-completions generate --shell zsh --out ./completions

# Generate for all supported shells
claude-code-completions generate --all --out ./completions

# Pre-warm the runtime cache for the current claude version (all shells),
# pruning entries for older versions. Run from cron / launchd / a hook to
# eliminate first-tab latency after claude updates.
claude-code-completions prefetch

# Audit src/overrides.js against the live `claude --help`. Reports orphan
# overrides, missing enum values, and drift. Exits non-zero on errors.
claude-code-completions audit

# Dump parsed IR as JSON (useful for debugging)
claude-code-completions parse
```

## Updating for new Claude Code versions

End users don't need to do anything: the loader detects the installed
`claude` version on every shell, regenerates the cache the first time it
sees a new version, and prunes the previous version's entry. The cache key
is the version string itself, so you can roll forward or back without
clearing anything by hand.

To eliminate the ~100ms first-tab latency right after `claude` updates,
arrange for `claude-code-completions prefetch` to run after each update.
A few options:

```sh
# Cron — daily check, no-op if claude version unchanged
0 9 * * * /usr/local/bin/claude-code-completions prefetch >/dev/null 2>&1

# Claude Code SessionStart hook (~/.claude/settings.json)
# Runs in the background each time you open a session.
{ "hooks": { "SessionStart": [{ "matcher": "",
    "hooks": [{ "type": "command",
      "command": "claude-code-completions prefetch >/dev/null 2>&1 &" }] }] } }
```

## Contributing

- To add support for a new shell, implement a generator in
  `src/generators/<shell>.js` that takes the IR produced by `src/parse.js`.
- To fix missing enum values or subcommand options, edit `src/overrides.js`.

## License

MIT
