#!/usr/bin/env node
'use strict'

const { execFileSync, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const SLOT_RE = /^[a-zA-Z0-9_-]+$/

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`)
  process.exit(1)
}

if (process.platform !== 'darwin') {
  fail(`@leverj/claude-wt only supports macOS (got: ${process.platform})`)
}

let _root
function repoRoot() {
  if (_root) return _root
  try {
    _root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    return _root
  } catch {
    fail('not inside a git repository')
  }
}

function worktreePath(slot) {
  return join(repoRoot(), '.claude/worktrees', slot)
}

function detectPackageManager(cwd) {
  if (existsSync(join(cwd, 'yarn.lock')))         return ['yarn', 'workspaces', 'focus', '--all']
  if (existsSync(join(cwd, 'pnpm-lock.yaml')))    return ['pnpm', 'install']
  if (existsSync(join(cwd, 'package-lock.json'))) return ['npm', 'install']
  if (existsSync(join(cwd, 'bun.lock')))          return ['bun', 'install']
  return null
}

function detectIDE() {
  if (process.env.CLAUDE_WT_OPEN_WITH) return process.env.CLAUDE_WT_OPEN_WITH
  if (process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm') return 'webstorm'
  if (process.env.TERM_PROGRAM === 'vscode') return 'code'
  if (process.env.TERM_PROGRAM === 'Apple_Terminal') return 'terminal'
  return ''
}

function openInIDE(wtPath) {
  const ide = detectIDE()
  const printManual = () => console.log(`\nNext:\n  cd ${wtPath} && claude\n`)

  switch (ide) {
    case 'webstorm':
      console.log('Opening in WebStorm. Open the integrated terminal (Alt+F12) and run: claude')
      execFileSync('open', ['-a', 'WebStorm', wtPath])
      break
    case 'code':
      console.log('Opening in VS Code. Open the integrated terminal (Ctrl+`) and run: claude')
      execFileSync('open', ['-a', 'Visual Studio Code', wtPath])
      break
    case 'terminal': {
      console.log('Opening Terminal...')
      const escaped = wtPath.replace(/"/g, '\\"')
      const script = `tell application "Terminal"
  do script "cd " & quoted form of "${escaped}" & " && claude"
  activate
end tell`
      spawnSync('osascript', ['-'], { input: script, stdio: ['pipe', 'inherit', 'inherit'] })
      break
    }
    case 'none':
    case '':
      printManual()
      break
    default:
      console.warn(`warning: unknown CLAUDE_WT_OPEN_WITH=${ide} (expected webstorm|code|terminal|none)`)
      printManual()
  }
}

function cmdNew(slot) {
  if (!slot) fail('slot name required\n\nusage: claude-wt new <slot>')
  if (!SLOT_RE.test(slot)) fail(`slot must be alphanumeric / dash / underscore (got: ${slot})`)

  const root = repoRoot()
  const wtPath = worktreePath(slot)
  if (existsSync(wtPath)) fail(`${wtPath} already exists`)

  console.log('Fetching origin...')
  spawnSync('git', ['-C', root, 'fetch', 'origin', '--quiet'], { stdio: 'inherit' })

  const branch = `worktree-${slot}`
  console.log(`Creating worktree at ${wtPath}...`)
  const created = spawnSync('git', ['-C', root, 'worktree', 'add', '-b', branch, wtPath, 'origin/HEAD'], { stdio: 'inherit' })
  if (created.status !== 0) fail('git worktree add failed')

  const pmCmd = detectPackageManager(wtPath)
  if (pmCmd) {
    console.log(`Installing dependencies (${pmCmd.join(' ')})...`)
    const installed = spawnSync(pmCmd[0], pmCmd.slice(1), { cwd: wtPath, stdio: 'inherit' })
    if (installed.status !== 0) {
      console.warn('warning: dependency install failed; worktree is set up but not installed')
    }
  } else {
    console.log('(no lockfile detected — skipping dependency install)')
  }

  console.log(`✓ Worktree ready: ${wtPath}`)
  openInIDE(wtPath)
}

function cmdList() {
  const root = repoRoot()
  const out = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })
  const prefix = join(root, '.claude/worktrees/')
  const matches = out.split('\n').filter((line) => line.startsWith(prefix))
  if (matches.length === 0) {
    console.log('No claude worktrees active.')
  } else {
    matches.forEach((line) => console.log(line))
  }
}

function cmdRemove(slot) {
  if (!slot) fail('slot name required\n\nusage: claude-wt remove <slot>')
  const wtPath = worktreePath(slot)
  if (!existsSync(wtPath)) fail(`${wtPath} does not exist`)

  const status = execFileSync('git', ['-C', wtPath, 'status', '--porcelain'], { encoding: 'utf8' })
  if (status.trim()) {
    process.stderr.write(`error: ${wtPath} has uncommitted changes:\n${status}Commit, stash, or discard them, then re-run.\n`)
    process.exit(1)
  }

  console.log(`Removing worktree at ${wtPath}...`)
  const removed = spawnSync('git', ['-C', repoRoot(), 'worktree', 'remove', wtPath], { stdio: 'inherit' })
  if (removed.status !== 0) fail('git worktree remove failed')
  console.log('✓ Removed.')
}

function usage() {
  process.stdout.write(`Isolated git worktrees for parallel Claude Code sessions.

Usage:
  claude-wt new <slot>       Create .claude/worktrees/<slot>, install deps, open IDE.
  claude-wt list             Show active claude worktrees.
  claude-wt remove <slot>    Remove the worktree (refuses if dirty).
  claude-wt help             Show this help.

IDE override (defaults to auto-detect from where you ran the command):
  CLAUDE_WT_OPEN_WITH=webstorm|code|terminal|none
`)
}

const [, , verb, ...rest] = process.argv
switch (verb) {
  case 'new':    cmdNew(rest[0]); break
  case 'list':   cmdList(); break
  case 'remove': cmdRemove(rest[0]); break
  case 'help':
  case '--help':
  case '-h':
  case undefined: usage(); break
  default:       usage(); process.exit(1)
}
