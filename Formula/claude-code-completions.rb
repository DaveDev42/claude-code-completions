class ClaudeCodeCompletions < Formula
  desc "Shell completions for the Claude Code CLI (zsh, bash, fish)"
  homepage "https://github.com/DaveDev42/claude-code-completions"
  url "https://github.com/DaveDev42/claude-code-completions/archive/refs/tags/v0.3.0.tar.gz"
  sha256 "05a94d2ec2151190f078e04a3b93daba9bfa984571a8573b827e9dad5494a3df"
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

    # Slash command users can symlink into ~/.claude/commands/
    (pkgshare/"slash-commands").install Dir["slash-commands/*.md"]
  end

  def caveats
    <<~EOS
      To enable the /upgrade-completion slash command in Claude Code:

        mkdir -p ~/.claude/commands
        ln -sf #{opt_pkgshare}/slash-commands/upgrade-completion.md \\
               ~/.claude/commands/upgrade-completion.md

      Then in any Claude Code session: /upgrade-completion
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
