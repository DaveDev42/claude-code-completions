class ClaudeCodeCompletions < Formula
  desc "Shell completions for the Claude Code CLI (zsh, bash, fish)"
  homepage "https://github.com/DaveDev42/claude-code-completions"
  url "https://github.com/DaveDev42/claude-code-completions/archive/refs/tags/v0.4.3.tar.gz"
  sha256 "4af1e2a3cdf3b73deaac31f4f9104765a7c1c073794e2c79de6d3a38ccbd03dd"
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
      Shell completions are installed under #{HOMEBREW_PREFIX}. For tab completion
      to actually activate, your shell must see those directories on its
      completion path.

      zsh:
        Ensure `eval "$(#{HOMEBREW_PREFIX}/bin/brew shellenv)"` runs in ~/.zshrc
        BEFORE `compinit` (and BEFORE zinit / oh-my-zsh / prezto / antidote
        init, since those call compinit themselves). After installing, run:
          rm -f ~/.zcompdump* && exec zsh

      bash:
        Requires the `bash-completion` formula. Then ensure your ~/.bashrc
        sources its init script (Homebrew prints instructions on
        `brew install bash-completion`).

      fish:
        Works out of the box once `eval "$(#{HOMEBREW_PREFIX}/bin/brew shellenv)"`
        is in ~/.config/fish/config.fish.

      Verify everything is wired up:
        claude-code-completions doctor
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
