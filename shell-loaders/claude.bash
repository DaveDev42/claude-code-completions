# Thin bash loader for claude-code-completions.
# Source this from ~/.bashrc:
#   source "$(brew --prefix)/etc/bash_completion.d/claude.bash"

_claude_completions_loader() {
  local cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-code-completions"
  local version
  version="$(command claude --version 2>/dev/null | tr -d ' ()/' )"
  [[ -z "$version" ]] && version="unknown"
  local cache_file="$cache_dir/claude.bash-$version"

  if [[ ! -f "$cache_file" ]]; then
    local gen="${CLAUDE_COMPLETIONS_BIN:-}"
    if [[ -z "$gen" ]]; then
      for candidate in \
        "$(brew --prefix 2>/dev/null)/bin/claude-code-completions" \
        "/opt/homebrew/bin/claude-code-completions" \
        "/usr/local/bin/claude-code-completions"; do
        [[ -x "$candidate" ]] && { gen="$candidate"; break; }
      done
    fi

    mkdir -p "$cache_dir"
    if [[ -x "$gen" ]]; then
      "$gen" generate --shell bash > "$cache_file" 2>/dev/null
    fi
    if [[ ! -s "$cache_file" ]]; then
      local static_file
      static_file="$(dirname "${BASH_SOURCE[0]}")/../share/claude-code-completions/claude.bash.static"
      [[ -f "$static_file" ]] && cp "$static_file" "$cache_file"
    fi

    # Prune stale caches from previous claude versions
    local stale
    shopt -s nullglob
    for stale in "$cache_dir"/claude.bash-*; do
      [[ "$stale" != "$cache_file" ]] && rm -f "$stale"
    done
    shopt -u nullglob
  fi

  [[ -f "$cache_file" ]] && source "$cache_file"
}

_claude_completions_loader
unset -f _claude_completions_loader
