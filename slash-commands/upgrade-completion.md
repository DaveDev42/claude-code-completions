---
description: Refresh shell completions for the current claude version
---

Run `claude-code-completions prefetch` to (re)generate zsh, bash, and fish
completions for the currently installed `claude` version, write them into
the runtime cache, and prune entries for older versions. After it finishes,
print a one-line summary including the version it warmed.

If the command exits non-zero, also run `claude-code-completions doctor` and
report the failing checks so the user knows what to fix (missing PATH, brew
loader missing, parser error, etc.).

Do not regenerate the in-repo `completions/` files — those are CI-only.
