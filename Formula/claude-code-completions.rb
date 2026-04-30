class ClaudeCodeCompletions < Formula
  desc "Shell completions for the Claude Code CLI (zsh, bash, fish)"
  homepage "https://github.com/DaveDev42/claude-code-completions"
  version "0.4.5"
  license "MIT"
  head "https://github.com/DaveDev42/claude-code-completions.git", branch: "main"

  # Source tarball is downloaded for the loader scripts and the static
  # completion fallbacks shipped under share/. The actual `claude-code-completions`
  # binary is fetched from the matching release asset below — we no longer
  # depend on Node at runtime.
  url "https://github.com/DaveDev42/claude-code-completions/archive/refs/tags/v0.4.5.tar.gz"
  sha256 "2da7e3c1dfe7ae25bf331f9c83061ee80c6ef661d9272cc5d892f5e75fe2f7ad"

  # Per-platform self-contained binaries built with `bun build --compile`.
  # Replace the placeholder sha256 values when cutting a new release; the
  # release workflow prints them in the run summary.
  on_macos do
    on_arm do
      resource "binary" do
        url "https://github.com/DaveDev42/claude-code-completions/releases/download/v0.4.5/claude-code-completions-darwin-arm64"
        sha256 "0000000000000000000000000000000000000000000000000000000000000000"
      end
    end
    on_intel do
      resource "binary" do
        url "https://github.com/DaveDev42/claude-code-completions/releases/download/v0.4.5/claude-code-completions-darwin-x64"
        sha256 "0000000000000000000000000000000000000000000000000000000000000000"
      end
    end
  end

  on_linux do
    on_arm do
      resource "binary" do
        url "https://github.com/DaveDev42/claude-code-completions/releases/download/v0.4.5/claude-code-completions-linux-arm64"
        sha256 "0000000000000000000000000000000000000000000000000000000000000000"
      end
    end
    on_intel do
      resource "binary" do
        url "https://github.com/DaveDev42/claude-code-completions/releases/download/v0.4.5/claude-code-completions-linux-x64"
        sha256 "0000000000000000000000000000000000000000000000000000000000000000"
      end
    end
  end

  def install
    resource("binary").stage do
      # The downloaded asset has a platform-suffixed filename; rename to the
      # canonical command name and install. `bin.install` handles +x.
      src = Dir["claude-code-completions-*"].first
      odie "release asset missing" if src.nil?
      mv src, "claude-code-completions"
      bin.install "claude-code-completions"
    end

    # Loaders go into the shell-standard paths so they're picked up automatically.
    (zsh_completion/"_claude").write (buildpath/"shell-loaders/_claude").read
    (bash_completion/"claude").write (buildpath/"shell-loaders/claude.bash").read
    (fish_completion/"claude.fish").write (buildpath/"shell-loaders/claude.fish").read

    # Static fallbacks (used if the generator can't run, e.g. claude not in PATH yet)
    (pkgshare/"_claude.static").write (buildpath/"completions/_claude").read
    (pkgshare/"claude.bash.static").write (buildpath/"completions/claude.bash").read
    (pkgshare/"claude.fish.static").write (buildpath/"completions/claude.fish").read
  end

  def caveats
    <<~EOS
      Shell setup (one-time):
        zsh  — nothing extra; completions load automatically.
        bash — install bash-completion (`brew install bash-completion`) and
               add its init line to ~/.bashrc if you haven't already.
        fish — nothing extra; completions load automatically.

      To verify everything is wired up correctly, or to auto-fix common issues:
        claude-code-completions doctor --fix

      To warm the completion cache before the first `claude <Tab>`:
        claude-code-completions prefetch
    EOS
  end

  test do
    assert_match "claude-code-completions", shell_output("#{bin}/claude-code-completions help")
    # Parse a minimal fixture to verify generator works
    (testpath/"help.txt").write <<~HELP
      Usage: claude [options] [command] [prompt]

      Options:
        -h, --help  Display help

      Commands:
        doctor  Check health
    HELP
    output = shell_output("#{bin}/claude-code-completions generate --shell zsh --help-file #{testpath}/help.txt")
    assert_match "#compdef claude", output
  end
end
