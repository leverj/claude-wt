# @leverj/claude-wt

Isolated git worktrees for parallel Claude Code sessions.

Lets you run three Claude Code instances on three different stories at the same time, each in its own working directory, without the sessions stepping on each other's branch state or file edits. macOS only.

## What it does

`claude-wt new <slot>` does four things:

1. Creates a worktree under `.claude/worktrees/<slot>/` (matching Claude Code's native convention), branched from `origin/HEAD`.
2. Installs dependencies (detects yarn / pnpm / npm / bun via lockfile; skips if none).
3. Auto-opens the worktree in your IDE — WebStorm, VS Code, or Terminal.app — based on where you ran the command from.
4. Prints a `cd … && claude` hint if it doesn't recognize your terminal.

You then run `claude` in the IDE's integrated terminal (or it auto-starts in the Terminal.app path).

## Install

### Global (recommended)

```sh
npm install -g @leverj/claude-wt
claude-wt help
```

### Per-project

```sh
npm install --save-dev @leverj/claude-wt
# Then either:
npx claude-wt new auth
# Or add to your package.json scripts:
#   "claude:wt": "claude-wt"
yarn claude:wt new auth
```

## Usage

```
claude-wt new <slot>       Create a worktree, install deps, open IDE.
claude-wt list             Show active claude worktrees.
claude-wt remove <slot>    Remove the worktree (refuses if dirty).
claude-wt help             Show this help.
```

`<slot>` is an arbitrary tag — `auth`, `401`, `feature-foo`, whatever's easy to remember. Must be alphanumeric / dash / underscore.

### IDE detection

The tool detects which IDE called it via env vars set by each terminal:

| Where you ran it | Opens |
|---|---|
| WebStorm integrated terminal (`$TERMINAL_EMULATOR=JetBrains-JediTerm`) | new WebStorm window at the worktree |
| VS Code integrated terminal (`$TERM_PROGRAM=vscode`) | new VS Code window at the worktree |
| Terminal.app (`$TERM_PROGRAM=Apple_Terminal`) | new Terminal window, auto-runs `cd … && claude` |
| Anything else | prints `cd … && claude` for copy-paste |

Override with `CLAUDE_WT_OPEN_WITH=webstorm|code|terminal|none` in your shell rc.

## Setup tip for your repo

Add this to your `.gitignore` so the main checkout doesn't see worktree contents as untracked files:

```
.claude/worktrees/
```

This is recommended by [Claude Code's worktree docs](https://code.claude.com/docs/en/worktrees).

## Caveats

- **macOS only.** Linux/Windows hard-fail with a message. If a teammate needs them, contributions welcome.
- **Local test ports.** Two worktrees both running local servers/tests that bind fixed ports (e.g., postgres on 54422) will collide. CI tests are fine — each CI VM is isolated.
- **No automatic cleanup.** Unlike `claude --worktree` native, `claude-wt` doesn't auto-remove an idle worktree on exit. Run `claude-wt remove <slot>` when you're done; the dirty-check refuses removal if anything's uncommitted.
- **Branch persists after remove.** `claude-wt remove` removes the working directory but leaves the `worktree-<slot>` branch in your repo. Delete with `git branch -D worktree-<slot>` if you want.
