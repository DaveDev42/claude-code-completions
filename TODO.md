# TODO

Deferred improvements. Filed here so they don't get lost between releases.

## Drop the Node.js dependency (Rust rewrite)

`depends_on "node"` is the last visible runtime dependency. We'd like
`brew install claude-code-completions` to work with no language runtime in
sight. A `bun build --compile` attempt was tried and reverted (commits
dd86cbd / 68c045d, reverted in 262f1cd) — the resulting binary was 60MB on
darwin-arm64 and 100MB on linux-x64 because bun embeds its full runtime.
Vendoring node was already ruled out for the same reason (~80MB bottle).

**Recommended path: Rust rewrite.**

- Realistic binary size with `opt-level=z` + LTO + strip + `panic=abort`:
  400KB–1.5MB. ~50–150× smaller than the bun attempt.
- Cross-compile via `cargo zigbuild` or a CI matrix for the four targets
  Homebrew cares about: darwin-arm64, darwin-x64, linux-arm64, linux-x64.
- Formula becomes four `resource` blocks pulling release assets and a couple
  of `bin.install` calls. No language-runtime `depends_on`.

**Scope of the port** (≈2–4 weeks, dominated by regression risk, not LOC):
- `src/parse.js` — `claude --help` text parsing, regex-heavy
- `src/generators/{zsh,bash,fish}.js` — string emitters, three of them
- `src/overrides.js` — static data + dynamic dispatch pattern
- `src/doctor.js` — shell exec + dotfile editing (zsh setup repair, bash
  bash-completion install via brew)
- `src/audit.js` — drift checker against `claude --help`
- All tests under `test/` — especially the `test/generators.test.js`
  "5b. variadic + mutex" regression case (v0.2.0 production bug; the
  intent of that test must survive the port verbatim)

**Why not just keep `depends_on "node"`?** It works fine today and most
users running `claude` already have Node installed. The Rust rewrite is
worth doing only if we want a truly self-contained Homebrew install with
no runtime footprint. Until then this stays deferred.

**Why Rust over Go?** Go binaries land at 5–10MB — better than bun, but
not dramatically smaller than vendoring node. Rust gets us to <2MB, which
is the only size that justifies the rewrite cost.

**Release-flow impact.** `npm run generate` + tag + Formula sha update
becomes a CI matrix that builds four binaries, uploads them as release
assets, and updates the Formula with four sha256s.

## Smaller follow-ups

- fish has no fix path because its activation rarely fails. If we see reports,
  add one.
