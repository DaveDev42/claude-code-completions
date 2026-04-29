# TODO

Deferred improvements. Filed here so they don't get lost between releases.

## Drop the Node.js dependency

Today the formula has `depends_on "node"` and ships JS files plus a thin bash
wrapper. End users have to install Node just to run a CLI that exists only to
emit shell completions. We'd like `brew install claude-code-completions` to
work with no language runtime visible to the user.

**Recommended path: `bun build --compile` + Homebrew bottles.**

- `bun build bin/claude-code-completions.js --compile --target=bun-darwin-arm64 -o dist/...`
  produces a single self-contained binary. Cross-compile for the four targets
  Homebrew cares about: darwin-arm64, darwin-x64, linux-arm64, linux-x64.
- Upload the four binaries as release assets, compute sha256 per target, and
  switch the formula to a binary install (download the matching asset, drop it
  in `bin/`). The `install` block becomes a few `bin.install` calls; no `node`
  dependency, no `libexec` JS tree.
- Loaders are unaffected: they just exec `claude-code-completions generate`.
  The wrapper script that currently shells out to `node` goes away.

**Why not POSIX shell + awk rewrite?** Possible but expensive — `src/parse.js`,
three generators, `src/overrides.js`, and the regression tests
(`test/generators.test.js` "5b. variadic + mutex" in particular) all need to
move. High regression risk for a packaging concern.

**Why not vendor Node into the bottle?** Bottle size balloons to ~80MB for
something that runs for 50ms. Bad trade.

**Release-flow impact.** Today `npm run generate` + tag + update Formula sha is
enough. With bottles we need a CI job that builds four binaries, uploads them,
and updates the formula with four sha256s. `brew test-bot` or a small GitHub
Actions matrix handles this. Not hard, but it's a one-time setup cost that
rules this out as a same-PR change.

## Smaller follow-ups

- `doctor --fix` currently only repairs zsh setup. bash-completion install
  could be automated too (`brew install bash-completion` if missing), but
  modifying ~/.bashrc to source it is the same dotfile-edit concern as zsh
  and we should think about whether to do it the same way.
- fish has no fix path because its activation rarely fails. If we see reports,
  add one.
- Caveats only mentions `--fix`. If users miss it, consider a post-install
  message printed by the formula (Homebrew supports this via `caveats` already
  but not as a one-shot "did it work?" check).
