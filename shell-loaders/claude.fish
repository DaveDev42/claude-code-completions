# Thin fish loader for claude-code-completions.
# Place as ~/.config/fish/completions/claude.fish

function __claude_completions_mtime
    if string match -q 'Darwin*' (uname -s)
        stat -f %m "$argv[1]" 2>/dev/null
    else
        stat -c %Y "$argv[1]" 2>/dev/null
    end
end

function __claude_completions_load
    set -l cache_dir (string join / $XDG_CACHE_HOME claude-code-completions)
    if test -z "$XDG_CACHE_HOME"
        set cache_dir "$HOME/.cache/claude-code-completions"
    end
    set -l meta_file "$cache_dir/.claude-meta"
    set -l claude_path (command -v claude 2>/dev/null)

    # Fast path: skip `claude --version` if claude binary path+mtime matches
    # the recorded sentinel (saves a process spawn per shell).
    if test -n "$claude_path"; and test -r "$meta_file"
        set -l mtime (__claude_completions_mtime "$claude_path")
        set -l line (head -n1 "$meta_file")
        set -l fields (string split \t -- $line)
        if test (count $fields) -ge 3; and test "$fields[1]" = "$claude_path"; and test "$fields[2]" = "$mtime"; and test -n "$fields[3]"
            set -l cache_file "$cache_dir/claude.fish-$fields[3]"
            # -s (not -f) so a 0-byte cache from a prior failed generate
            # falls through to regeneration instead of being sourced empty.
            if test -s "$cache_file"
                source "$cache_file"
                return
            end
        end
    end

    # fish reserves $version as a read-only special variable holding fish's
    # own version (since fish 4.x), so use a distinct local name.
    set -l claude_version (command claude --version 2>/dev/null | string replace -a ' ' '' | string replace -a '/' '' | string replace -a '(' '' | string replace -a ')' '')
    test -z "$claude_version"; and set claude_version "unknown"
    set -l cache_file "$cache_dir/claude.fish-$claude_version"

    # -s so a previously-cached 0-byte file is treated as missing.
    if not test -s "$cache_file"
        set -l gen $CLAUDE_COMPLETIONS_BIN
        if test -z "$gen"
            for candidate in (brew --prefix 2>/dev/null)/bin/claude-code-completions /opt/homebrew/bin/claude-code-completions /usr/local/bin/claude-code-completions
                if test -x "$candidate"
                    set gen "$candidate"
                    break
                end
            end
        end

        mkdir -p "$cache_dir"
        # fish loader installs at <prefix>/share/fish/vendor_completions.d/claude.fish;
        # static fallback at <prefix>/share/claude-code-completions/. Three
        # directories up — the previous `../share` path never resolved.
        set -l static_file (dirname (status filename))/../../../share/claude-code-completions/claude.fish.static
        # Write to temp + rename, requiring BOTH a successful exit AND
        # non-empty output. A generator that crashes mid-write (SIGKILL,
        # broken pipe) would otherwise leave a corrupt file that passes
        # `-s` but breaks `source`.
        set -l tmp_file "$cache_file.$fish_pid.tmp"
        set -l gen_ok 0
        if test -x "$gen"
            if $gen generate --shell fish > "$tmp_file" 2>/dev/null
                set gen_ok 1
            end
        end
        if test $gen_ok -eq 0; or not test -s "$tmp_file"
            rm -f "$tmp_file"
            test -f "$static_file"; and cp "$static_file" "$tmp_file"
        end
        if test -s "$tmp_file"
            mv -f "$tmp_file" "$cache_file"
        else
            rm -f "$tmp_file"
        end

        # Prune stale caches from previous claude versions
        for stale in $cache_dir/claude.fish-*
            if test -f "$stale"; and test "$stale" != "$cache_file"
                rm -f "$stale"
            end
        end
    end

    # Update the fast-path sentinel for the next shell.
    if test -n "$claude_path"
        set -l mtime (__claude_completions_mtime "$claude_path")
        if test -n "$mtime"
            printf '%s\t%s\t%s\n' "$claude_path" "$mtime" "$claude_version" > "$meta_file"
        end
    end

    test -s "$cache_file"; and source "$cache_file"
end

__claude_completions_load
functions -e __claude_completions_load
functions -e __claude_completions_mtime
