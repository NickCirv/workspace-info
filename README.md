# workspace-info

```
╭──────────────────────────────────────────────────────────╮
│  workspace-info · your project at a glance               │
╰──────────────────────────────────────────────────────────╯
```

**Your project at a glance — git, deps, ports, files, all in one command.**

Zero npm dependencies. Pure Node.js built-ins. Works anywhere.

---

## Quick install

```bash
# Run instantly with npx (no install needed)
npx workspace-info

# Or install globally
npm install -g workspace-info
```

---

## Output preview

```
╭─────────────────────────── PROJECT ───────────────────────────╮
│  Name        my-app   v2.1.0   [MIT]
│  Description The next great thing
│  Type        module   pkg manager: pnpm
│  Deps        14 prod  42 dev  0 peer
│  Scripts     dev, build, test, lint, preview
╰────────────────────────────────────────────────────────────────╯

╭──────────────────────────── GIT ───────────────────────────────╮
│  Branch     main
│  Remote     origin/main  ✓ in sync
│  Changes    2 staged  1 unstaged  0 untracked
│  Last commit  3m ago  a1b2c3d  fix: resolve auth edge case
│  Author     Nick Ashkar
│  Origin     https://github.com/NickCirv/my-app.git
╰────────────────────────────────────────────────────────────────╯

╭─────────────────────────── RUNTIME ───────────────────────────╮
│  Node.js     v22.4.0
│  npm         10.8.1
│  bun         1.1.18
│  pnpm        9.4.0
│  git         2.45.2
│  Platform    darwin
╰────────────────────────────────────────────────────────────────╯

╭──────────────────────────── DIRECTORY ────────────────────────╮
│  Total files 247   Total size 4.2 MB
│  Largest files:
│    ▸ src/generated/schema.ts                       1.1 MB
│    ▸ public/assets/logo.png                        342 KB
│  Recently modified:
│    ▸ src/routes/auth.ts                            2m ago
│    ▸ src/middleware/session.ts                     5m ago
╰────────────────────────────────────────────────────────────────╯

╭──────────────────────────── OPEN PORTS ───────────────────────╮
│  ● 3000  Node/React/Next
│  ● 5173  Vite
╰────────────────────────────────────────────────────────────────╯

╭──────────────────────────── ENVIRONMENT ──────────────────────╮
│  NODE_ENV    development
│  .env files  .env  .env.local
│  Set vars    ✓ DATABASE_URL  ✓ JWT_SECRET  ✓ STRIPE_PUBLIC_KEY
╰────────────────────────────────────────────────────────────────╯

  Generated in 412ms · 9:41:22 AM
```

---

## Commands

| Command | What it does |
|---|---|
| `workspace-info` | Full workspace report |
| `workspace-info show` | Same as above (explicit alias) |
| `workspace-info git` | Git-focused sub-report with recent commits |
| `workspace-info deps` | Dependency-focused sub-report |
| `workspace-info ports` | Port availability scan |
| `workspace-info --json` | Output everything as JSON |
| `workspace-info --watch` | Refresh every 5 seconds |
| `workspace-info --help` | Show help |

Both `workspace-info` and `wsi` work as the binary name.

```bash
wsi                   # shorthand
wsi --watch           # live refresh
wsi --json | jq '.git'  # pipe to jq
wsi ports             # just ports
```

---

## Why workspace-info?

You open a project you haven't touched in weeks. You need to know: what branch am I on? Is anything staged? Are my dev servers running? What env vars am I missing? You run 6+ commands to find out.

`workspace-info` gives you all of that in one command, in under a second.

- **Zero dependencies** — no npm install bloat, no supply chain risk
- **Works anywhere** — any project, any language, any directory
- **Instant** — parallel data gathering, typically under 500ms
- **JSON output** — pipe into jq, scripts, or other tools
- **Watch mode** — live-refresh dashboard for active development
- **Security first** — env vars show presence only, never values

---

## What gets scanned

| Section | Data |
|---|---|
| Project | name, version, description, license, dep counts, scripts |
| Git | branch, remote sync, staged/unstaged/untracked, last commit, stash |
| Runtime | Node, npm, bun, pnpm, yarn, git versions, platform |
| Directory | file count, total size, top 5 largest files, 5 most recently modified |
| Open Ports | 14 common dev ports (3000, 5173, 8080, 4200, 8888, and more) |
| Environment | NODE_ENV, presence of 20+ common env vars, .env file detection |

---

## Requirements

- Node.js 18+
- No other dependencies

---

## License

MIT
