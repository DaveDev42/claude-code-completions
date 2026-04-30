#!/usr/bin/env bash
# Build self-contained `claude-code-completions` binaries for the four targets
# Homebrew cares about. Output: dist/claude-code-completions-<os>-<arch>.
#
# Requires `bun` on PATH. macOS targets are ad-hoc codesigned so they pass
# Gatekeeper / can run on macOS 14+ which kills unsigned arm64 binaries.
# The first `codesign -s -` on a fresh bun-compiled binary fails with
# "invalid or unsupported format for signature" because of how bun appends
# its payload past the Mach-O end. Running `codesign --remove-signature`
# first (it's a no-op on the unsigned binary itself but rewrites the
# load-command tail) makes the subsequent sign succeed.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="$ROOT/bin/claude-code-completions.js"
OUT_DIR="$ROOT/dist"
mkdir -p "$OUT_DIR"

TARGETS=(
  "darwin-arm64:bun-darwin-arm64"
  "darwin-x64:bun-darwin-x64"
  "linux-arm64:bun-linux-arm64"
  "linux-x64:bun-linux-x64"
)

# Optional first arg restricts the build to one target (e.g. for local smoke).
ONLY="${1:-}"

for entry in "${TARGETS[@]}"; do
  label="${entry%%:*}"
  bun_target="${entry##*:}"
  if [[ -n "$ONLY" && "$ONLY" != "$label" ]]; then
    continue
  fi

  out="$OUT_DIR/claude-code-completions-$label"
  echo "==> building $label -> $out"
  rm -f "$out"
  bun build "$ENTRY" --compile --target="$bun_target" --outfile "$out"

  if [[ "$label" == darwin-* ]]; then
    # Ad-hoc sign so macOS 14+ doesn't SIGKILL the binary on launch. The
    # remove-then-sign dance is required; see header comment.
    codesign --remove-signature "$out" >/dev/null 2>&1 || true
    codesign -s - "$out"
  fi

  size="$(wc -c < "$out" | tr -d ' ')"
  sha="$(shasum -a 256 "$out" | awk '{print $1}')"
  echo "    size=${size} sha256=${sha}"
done

echo
echo "binaries:"
ls -la "$OUT_DIR"
