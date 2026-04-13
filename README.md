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

## CLI

```sh
# Generate for zsh, write to ./completions/_claude
claude-code-completions generate --shell zsh --out ./completions

# Generate for all supported shells
claude-code-completions generate --all --out ./completions

# Dump parsed IR as JSON (useful for debugging)
claude-code-completions parse
```

## Updating for new Claude Code versions

The pre-generated completions in `completions/` are refreshed automatically by
CI when upstream Claude Code releases new versions. End users don't need to do
anything — the loader regenerates on their machine using their installed
version.

If you want to update manually:

```sh
claude update   # update claude to latest
# next time you tab-complete claude, the loader regenerates the cache
```

## Contributing

- To add support for a new shell, implement a generator in
  `src/generators/<shell>.js` that takes the IR produced by `src/parse.js`.
- To fix missing enum values or subcommand options, edit `src/overrides.js`.

## License

MIT
