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
            if test -f "$cache_file"
                source "$cache_file"
                return
            end
        end
    end

    set -l version (command claude --version 2>/dev/null | string replace -a ' ' '' | string replace -a '/' '' | string replace -a '(' '' | string replace -a ')' '')
    test -z "$version"; and set version "unknown"
    set -l cache_file "$cache_dir/claude.fish-$version"

    if not test -f "$cache_file"
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
        if test -x "$gen"
            $gen generate --shell fish > "$cache_file" 2>/dev/null
        end
        if not test -s "$cache_file"
            set -l static_file (dirname (status filename))/../share/claude-code-completions/claude.fish.static
            test -f "$static_file"; and cp "$static_file" "$cache_file"
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
            printf '%s\t%s\t%s\n' "$claude_path" "$mtime" "$version" > "$meta_file"
        end
    end

    test -f "$cache_file"; and source "$cache_file"
end

__claude_completions_load
functions -e __claude_completions_load
functions -e __claude_completions_mtime
