# Thin bash loader for claude-code-completions.
# Source this from ~/.bashrc:
#   source "$(brew --prefix)/etc/bash_completion.d/claude.bash"

_claude_completions_loader() {
  local cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-code-completions"
  local meta_file="$cache_dir/.claude-meta"
  local claude_path
  claude_path="$(command -v claude 2>/dev/null)"
  local version cache_file mtime

  _claude_completions_mtime() {
    if [[ "$OSTYPE" == darwin* ]]; then
      stat -f %m "$1" 2>/dev/null
    else
      stat -c %Y "$1" 2>/dev/null
    fi
  }

  # Fast path: skip `claude --version` if claude binary path+mtime matches
  # the recorded sentinel (saves a process spawn per shell).
  if [[ -n "$claude_path" && -r "$meta_file" ]]; then
    mtime="$(_claude_completions_mtime "$claude_path")"
    local meta_path meta_mtime meta_version
    IFS=$'\t' read -r meta_path meta_mtime meta_version < "$meta_file"
    if [[ "$meta_path" == "$claude_path" && "$meta_mtime" == "$mtime" && -n "$meta_version" ]]; then
      cache_file="$cache_dir/claude.bash-$meta_version"
      # -s (not -f) so a 0-byte cache file from a prior failed generate
      # falls through to the slow path and gets regenerated.
      if [[ -s "$cache_file" ]]; then
        source "$cache_file"
        unset -f _claude_completions_mtime
        return
      fi
    fi
  fi

  version="$(command claude --version 2>/dev/null | tr -d ' ()/' )"
  [[ -z "$version" ]] && version="unknown"
  cache_file="$cache_dir/claude.bash-$version"

  # -s so a previously-cached 0-byte file is treated as missing.
  if [[ ! -s "$cache_file" ]]; then
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
    local static_file
    # bash loader installs at <prefix>/etc/bash_completion.d/claude;
    # static fallback at <prefix>/share/claude-code-completions/. That's
    # two directories up + share, not just one — the previous path never
    # resolved.
    static_file="$(dirname "${BASH_SOURCE[0]}")/../../share/claude-code-completions/claude.bash.static"
    # Write to temp + rename, requiring BOTH a successful exit AND
    # non-empty output. A generator that crashes mid-write (SIGKILL,
    # broken pipe) would otherwise leave a syntactically broken file
    # that passes `-s` but breaks `source`.
    local tmp_file="$cache_file.$$.tmp"
    local gen_ok=0
    if [[ -x "$gen" ]]; then
      "$gen" generate --shell bash > "$tmp_file" 2>/dev/null && gen_ok=1
    fi
    if [[ $gen_ok -eq 0 || ! -s "$tmp_file" ]]; then
      rm -f "$tmp_file"
      [[ -f "$static_file" ]] && cp "$static_file" "$tmp_file"
    fi
    if [[ -s "$tmp_file" ]]; then
      mv -f "$tmp_file" "$cache_file"
    else
      rm -f "$tmp_file"
    fi

    # Prune stale caches from previous claude versions
    local stale
    shopt -s nullglob
    for stale in "$cache_dir"/claude.bash-*; do
      [[ "$stale" != "$cache_file" ]] && rm -f "$stale"
    done
    shopt -u nullglob
  fi

  # Update the fast-path sentinel for the next shell.
  if [[ -n "$claude_path" ]]; then
    [[ -z "$mtime" ]] && mtime="$(_claude_completions_mtime "$claude_path")"
    [[ -n "$mtime" ]] && printf '%s\t%s\t%s\n' "$claude_path" "$mtime" "$version" > "$meta_file"
  fi

  [[ -s "$cache_file" ]] && source "$cache_file"
  unset -f _claude_completions_mtime
}

_claude_completions_loader
unset -f _claude_completions_loader
