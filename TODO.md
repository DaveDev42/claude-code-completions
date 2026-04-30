# TODO

Deferred improvements. Filed here so they don't get lost between releases.

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
