---
description: Cut a new patch/minor release of claude-code-completions
---

Release this package end-to-end. Two repos must stay in sync:

1. **This repo** (`DaveDev42/claude-code-completions`) — source + `Formula/claude-code-completions.rb`.
2. **Tap repo** (`DaveDev42/homebrew-tap`) — checked out at
   `$(brew --repository)/Library/Taps/davedev42/homebrew-tap`. This is what
   `brew install davedev42/tap/claude-code-completions` actually pulls. **If
   you bump only this repo, users see "X already installed" on `brew upgrade`.**

## Inputs

The user passes the new version as an argument (e.g. `/release 0.4.3`). If
omitted, infer the next patch from the latest `git tag` (`v0.4.2` → `0.4.3`)
and confirm with the user before continuing.

## Steps

Run these on `main` after the feature PR is merged. Stop and report on any
failure — do **not** auto-recover from a half-done release.

1. **Verify clean state.** Working tree clean, on `main`, up to date with
   `origin/main`. Run `npm test`; abort on failure.

2. **Tag and push.**
   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
   GitHub auto-generates the source tarball at the archive URL, and
   `.github/workflows/release.yml` builds + uploads the four binary assets
   (darwin-arm64, darwin-x64, linux-arm64, linux-x64). Wait for the workflow
   to finish (`gh run watch` on the latest Release run) before continuing.

3. **Compute sha256 of the tarball.**
   ```sh
   curl -sL https://github.com/DaveDev42/claude-code-completions/archive/refs/tags/vX.Y.Z.tar.gz \
     | shasum -a 256
   ```

4. **Compute sha256 of each binary asset.**
   ```sh
   for arch in darwin-arm64 darwin-x64 linux-arm64 linux-x64; do
     curl -sL "https://github.com/DaveDev42/claude-code-completions/releases/download/vX.Y.Z/claude-code-completions-$arch" \
       | shasum -a 256 | awk -v a="$arch" '{print a, $1}'
   done
   ```
   The same checksums also appear in the workflow run summary on Actions.

5. **Bump `Formula/claude-code-completions.rb`** in this repo: update `version`,
   the source tarball `url` + `sha256`, and the four `resource "binary"` URLs
   + `sha256` values. Commit directly to main and push:
   ```
   chore: bump Formula to vX.Y.Z
   ```

6. **Sync the tap repo.** This is the easy step to forget. Copy the updated
   formula across, commit, push:
   ```sh
   TAP="$(brew --repository)/Library/Taps/davedev42/homebrew-tap"
   cp Formula/claude-code-completions.rb "$TAP/Formula/claude-code-completions.rb"
   git -C "$TAP" add Formula/claude-code-completions.rb
   git -C "$TAP" commit -m "chore: bump claude-code-completions to vX.Y.Z"
   git -C "$TAP" push origin main
   ```
   The tap repo has its own local `user.email` + `user.signingkey` configured
   so signed commits work. If GPG signing fails with "No secret key", check
   `git -C "$TAP" config --get user.signingkey`.

7. **Edit the auto-generated GitHub release.** The release workflow created
   one with `--generate-notes`. Replace the body with a curated summary of
   user-visible changes (Improvements / Bug fixes / Breaking). Match the
   style of prior releases (`gh release view v0.4.2`):
   ```sh
   gh release edit vX.Y.Z --notes-file - <<EOF
   ...
   EOF
   ```

8. **Smoke test the upgrade.** Confirm the user can pick up the new version:
   ```sh
   brew update && brew upgrade davedev42/tap/claude-code-completions
   claude-code-completions --version  # or run `doctor`
   ```
   Report the installed version in the final summary.

## Final summary

End with: PR(s) merged, tag pushed, both repos bumped, GitHub release URL,
verified `brew upgrade` lands on the new version. If any step skipped, say
why explicitly.
