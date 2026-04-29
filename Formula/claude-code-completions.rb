class ClaudeCodeCompletions < Formula
  desc "Shell completions for the Claude Code CLI (zsh, bash, fish)"
  homepage "https://github.com/DaveDev42/claude-code-completions"
  url "https://github.com/DaveDev42/claude-code-completions/archive/refs/tags/v0.4.5.tar.gz"
  sha256 "2da7e3c1dfe7ae25bf331f9c83061ee80c6ef661d9272cc5d892f5e75fe2f7ad"
  license "MIT"
  head "https://github.com/DaveDev42/claude-code-completions.git", branch: "main"

  depends_on "node"

  def install
    libexec.install "bin", "src", "package.json"
    (bin/"claude-code-completions").write <<~SH
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/bin/claude-code-completions.js" "$@"
    SH
    chmod 0755, bin/"claude-code-completions"

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
      If tab completion isn't working, run:
        claude-code-completions doctor --fix

      That auto-fixes the common zsh setup issues (brew shellenv missing from
      ~/.zshrc, stale ~/.zcompdump). For bash, also `brew install bash-completion`
      and source its init from ~/.bashrc. fish works out of the box.
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
