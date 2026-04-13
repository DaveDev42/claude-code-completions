# Thin fish loader for claude-code-completions.
# Place as ~/.config/fish/completions/claude.fish

function __claude_completions_load
    set -l cache_dir (string join / $XDG_CACHE_HOME claude-code-completions)
    if test -z "$XDG_CACHE_HOME"
        set cache_dir "$HOME/.cache/claude-code-completions"
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
    end

    test -f "$cache_file"; and source "$cache_file"
end

__claude_completions_load
functions -e __claude_completions_load
