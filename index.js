#!/usr/bin/env node
// workspace-info — zero-dependency workspace CLI
// SECURITY: No secrets are logged or displayed. All env checks show presence only.
// SECURITY: No exec/execSync — only execFileSync/spawnSync used.

import { execFileSync } from 'child_process';
import { createServer } from 'net';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, resolve } from 'path';
import { platform, homedir } from 'os';

// ─── ANSI colors (raw escape codes, no chalk) ───────────────────────────────
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
  bgBlue:  '\x1b[44m',
};

const col  = (color, text) => `${color}${text}${c.reset}`;
const bold = (text) => col(c.bold, text);
const dim  = (text) => col(c.dim + c.gray, text);
const ok   = (text) => col(c.green, text);
const warn = (text) => col(c.yellow, text);
const err  = (text) => col(c.red, text);
const info = (text) => col(c.cyan, text);
const hi   = (text) => col(c.magenta, text);

// ─── Box drawing ─────────────────────────────────────────────────────────────
const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│', cross: '┼',
  lt: '├', rt: '┤',
};

function boxHeader(title, width = 60) {
  const pad  = width - title.length - 4;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return (
    col(c.cyan, BOX.tl + BOX.h.repeat(left + 1)) +
    col(c.bold + c.white, ' ' + title + ' ') +
    col(c.cyan, BOX.h.repeat(right + 1) + BOX.tr)
  );
}
function boxRow(text, width = 60) {
  return col(c.cyan, BOX.v) + ' ' + text;
}
function boxFooter(width = 60) {
  return col(c.cyan, BOX.bl + BOX.h.repeat(width) + BOX.br);
}
function section(title, lines) {
  const out = [boxHeader(title)];
  for (const l of lines) out.push(boxRow(l));
  out.push(boxFooter());
  return out.join('\n');
}

// ─── Safe exec ───────────────────────────────────────────────────────────────
function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
      ...opts,
    }).trim();
  } catch {
    return null;
  }
}

// ─── Git helpers ─────────────────────────────────────────────────────────────
function getGitInfo() {
  const isGit = run('git', ['rev-parse', '--is-inside-work-tree']);
  if (isGit !== 'true') return null;

  const branch    = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown';
  const lastHash  = run('git', ['log', '-1', '--format=%h']) || '';
  const lastMsg   = run('git', ['log', '-1', '--format=%s']) || '';
  const lastDate  = run('git', ['log', '-1', '--format=%cr']) || '';
  const lastAuthor= run('git', ['log', '-1', '--format=%an']) || '';

  // Staged / unstaged
  const status    = run('git', ['status', '--porcelain']) || '';
  const lines     = status.split('\n').filter(Boolean);
  const staged    = lines.filter(l => l[0] !== ' ' && l[0] !== '?').length;
  const unstaged  = lines.filter(l => l[1] === 'M' || l[1] === 'D').length;
  const untracked = lines.filter(l => l.startsWith('??')).length;

  // Ahead / behind
  let ahead = 0, behind = 0;
  const remote = run('git', ['rev-parse', '--abbrev-ref', '@{u}']);
  if (remote) {
    const ab = run('git', ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
    if (ab) {
      const parts = ab.split(/\s+/);
      ahead  = parseInt(parts[0]) || 0;
      behind = parseInt(parts[1]) || 0;
    }
  }

  // Remote URL — show without leaking any embedded credentials
  let remoteUrl = run('git', ['config', '--get', 'remote.origin.url']) || '';
  // Strip any user:pass@ pattern from URL for safety
  remoteUrl = remoteUrl.replace(/\/\/[^@]*@/, '//');

  // Recent commits
  const recentLog = run('git', ['log', '--oneline', '-5']) || '';
  const recentCommits = recentLog.split('\n').filter(Boolean);

  // Stash count
  const stashList = run('git', ['stash', 'list']) || '';
  const stashCount = stashList ? stashList.split('\n').filter(Boolean).length : 0;

  return {
    branch, lastHash, lastMsg, lastDate, lastAuthor,
    staged, unstaged, untracked,
    ahead, behind, remote: remote || null,
    remoteUrl,
    recentCommits,
    stashCount,
    totalChanged: lines.length,
  };
}

// ─── Package.json helpers ─────────────────────────────────────────────────────
function getPkgInfo(cwd) {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deps    = Object.keys(pkg.dependencies || {}).length;
    const devDeps = Object.keys(pkg.devDependencies || {}).length;
    const peerDeps= Object.keys(pkg.peerDependencies || {}).length;
    const scripts = Object.keys(pkg.scripts || {});
    return {
      name:        pkg.name        || dim('(unnamed)'),
      version:     pkg.version     || dim('(no version)'),
      description: pkg.description || dim('(no description)'),
      type:        pkg.type        || 'commonjs',
      license:     pkg.license     || dim('(no license)'),
      engines:     pkg.engines     || {},
      deps, devDeps, peerDeps,
      scripts,
      main: pkg.main || pkg.exports || null,
      bin:  pkg.bin  || null,
    };
  } catch {
    return null;
  }
}

// ─── Runtime helpers ─────────────────────────────────────────────────────────
function getRuntimeInfo() {
  const nodeVer  = process.version;
  const npmVer   = run('npm', ['--version']);
  const bunVer   = run('bun', ['--version']);
  const pnpmVer  = run('pnpm', ['--version']);
  const yarnVer  = run('yarn', ['--version']);
  const gitVer   = run('git', ['--version'])?.replace('git version ', '');
  const nvmVer   = process.env['NVM_DIR'] ? run('node', ['-e', 'process.exit(0)']) : null;

  return { nodeVer, npmVer, bunVer, pnpmVer, yarnVer, gitVer };
}

// ─── File system helpers ──────────────────────────────────────────────────────
function walkDir(dir, opts = {}) {
  const { maxDepth = 6, ignore = new Set(['.git', 'node_modules', '.DS_Store', 'dist', '.next', 'build', '__pycache__', '.venv']) } = opts;
  const files = [];

  function recurse(d, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        recurse(full, depth + 1);
      } else {
        try {
          const st = statSync(full);
          files.push({ path: full, size: st.size, mtime: st.mtime });
        } catch {}
      }
    }
  }

  recurse(dir, 0);
  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1024**2)    return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024**3)    return (bytes / 1024**2).toFixed(1) + ' MB';
  return (bytes / 1024**3).toFixed(1) + ' GB';
}

function getDirStats(cwd) {
  const files  = walkDir(cwd);
  const total  = files.length;
  const size   = files.reduce((s, f) => s + f.size, 0);

  const largest = [...files]
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map(f => ({ path: relative(cwd, f.path), size: f.size }));

  const recent = [...files]
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 5)
    .map(f => ({
      path: relative(cwd, f.path),
      mtime: f.mtime,
      age: timeAgo(f.mtime),
    }));

  return { total, size, largest, recent };
}

function timeAgo(date) {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)   return secs + 's ago';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
  if (secs < 86400)return Math.floor(secs / 3600) + 'h ago';
  return Math.floor(secs / 86400) + 'd ago';
}

// ─── Port helpers ─────────────────────────────────────────────────────────────
const DEV_PORTS = [
  { port: 3000,  label: 'Node/React/Next' },
  { port: 3001,  label: 'Alt dev' },
  { port: 4000,  label: 'GraphQL/Dev' },
  { port: 4200,  label: 'Angular/Vite' },
  { port: 5000,  label: 'Flask/Express' },
  { port: 5173,  label: 'Vite' },
  { port: 5174,  label: 'Vite (alt)' },
  { port: 6006,  label: 'Storybook' },
  { port: 8000,  label: 'Django/HTTP' },
  { port: 8080,  label: 'HTTP alt' },
  { port: 8484,  label: 'Memory MCP' },
  { port: 8888,  label: 'Jupyter' },
  { port: 9000,  label: 'PHP-FPM/Dev' },
  { port: 9229,  label: 'Node Inspector' },
];

function checkPort(port) {
  return new Promise(resolve => {
    const srv = createServer();
    srv.once('error', () => { srv.close(); resolve(true);  });  // port in use
    srv.once('listening', () => { srv.close(); resolve(false); }); // port free
    srv.listen(port, '127.0.0.1');
  });
}

async function getOpenPorts() {
  const results = await Promise.all(
    DEV_PORTS.map(async ({ port, label }) => ({
      port, label, inUse: await checkPort(port),
    }))
  );
  return results.filter(r => r.inUse);
}

// ─── Env helpers ─────────────────────────────────────────────────────────────
// SECURITY: Only checks presence of variables — never logs values
const COMMON_ENV_KEYS = [
  'NODE_ENV', 'PORT', 'HOST',
  'DATABASE_URL', 'REDIS_URL', 'MONGODB_URI',
  'JWT_SECRET', 'SESSION_SECRET',
  'AWS_REGION', 'AWS_PROFILE',
  'STRIPE_PUBLIC_KEY', 'STRIPE_SECRET_KEY',
  'GITHUB_TOKEN', 'GITHUB_CLIENT_ID',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'SUPABASE_URL', 'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_API_URL', 'VITE_API_URL',
  'LOG_LEVEL', 'DEBUG',
];

function getEnvSummary() {
  const present = [];
  const missing = [];
  const nodeEnv = process.env['NODE_ENV'] || dim('(not set)');

  for (const key of COMMON_ENV_KEYS) {
    if (key === 'NODE_ENV') continue; // shown separately
    if (process.env[key] !== undefined) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  // Detect .env files (presence only, no content)
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production', '.env.test']
    .filter(f => existsSync(join(process.cwd(), f)));

  return { nodeEnv, present, missing, envFiles };
}

// ─── Lock file detector ───────────────────────────────────────────────────────
function detectPackageManager(cwd) {
  if (existsSync(join(cwd, 'bun.lockb')))          return 'bun';
  if (existsSync(join(cwd, 'pnpm-lock.yaml')))      return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock')))            return 'yarn';
  if (existsSync(join(cwd, 'package-lock.json')))    return 'npm';
  return null;
}

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmtGitStatus(g) {
  const lines = [];

  const branchColor = g.branch === 'main' || g.branch === 'master' ? c.green : c.yellow;
  lines.push(`  Branch     ${col(branchColor, g.branch)}`);

  if (g.remote) {
    const syncParts = [];
    if (g.ahead  > 0) syncParts.push(ok(`↑${g.ahead} ahead`));
    if (g.behind > 0) syncParts.push(err(`↓${g.behind} behind`));
    if (!syncParts.length) syncParts.push(ok('✓ in sync'));
    lines.push(`  Remote     ${dim(g.remote)} ${syncParts.join(' ')}`);
  } else {
    lines.push(`  Remote     ${dim('(no upstream)')}`);
  }

  lines.push(`  Changes    ${g.staged > 0 ? warn(g.staged + ' staged') : dim('0 staged')}  ${g.unstaged > 0 ? warn(g.unstaged + ' unstaged') : dim('0 unstaged')}  ${g.untracked > 0 ? info(g.untracked + ' untracked') : dim('0 untracked')}`);

  if (g.stashCount > 0) lines.push(`  Stash      ${warn(g.stashCount + ' stashed')}`);

  lines.push(`  Last commit ${dim(g.lastDate)} ${bold(g.lastHash)} ${g.lastMsg}`);
  lines.push(`  Author     ${dim(g.lastAuthor)}`);

  if (g.remoteUrl) {
    lines.push(`  Origin     ${dim(g.remoteUrl)}`);
  }

  return lines;
}

function fmtRecentCommits(commits) {
  return commits.map((c, i) => `  ${dim((i + 1) + '.')} ${c}`);
}

// ─── BANNER ──────────────────────────────────────────────────────────────────
function banner() {
  return [
    col(c.cyan + c.bold, '╭──────────────────────────────────────────────────────────╮'),
    col(c.cyan + c.bold, '│') + col(c.white + c.bold, '  workspace-info') + col(c.gray, ' · your project at a glance              ') + col(c.cyan + c.bold, '│'),
    col(c.cyan + c.bold, '╰──────────────────────────────────────────────────────────╯'),
  ].join('\n');
}

// ─── FULL REPORT ─────────────────────────────────────────────────────────────
async function showFullReport(opts = {}) {
  const cwd   = process.cwd();
  const start = Date.now();

  if (!opts.json) console.log('\n' + banner() + '\n');

  // Gather all data in parallel
  const [git, runtime, dirStats, openPorts, envSummary] = await Promise.all([
    Promise.resolve(getGitInfo()),
    Promise.resolve(getRuntimeInfo()),
    Promise.resolve(getDirStats(cwd)),
    getOpenPorts(),
    Promise.resolve(getEnvSummary()),
  ]);

  const pkg    = getPkgInfo(cwd);
  const pkgMgr = detectPackageManager(cwd);

  if (opts.json) {
    const out = {
      cwd,
      project: pkg ? {
        name: pkg.name, version: pkg.version,
        description: pkg.description, type: pkg.type,
        license: pkg.license,
        dependencies: pkg.deps, devDependencies: pkg.devDeps,
        scripts: pkg.scripts,
      } : null,
      git,
      runtime,
      directory: { ...dirStats, largest: dirStats.largest, recent: dirStats.recent.map(r => ({ path: r.path, age: r.age })) },
      openPorts: openPorts.map(p => ({ port: p.port, label: p.label })),
      env: { nodeEnv: envSummary.nodeEnv, presentKeys: envSummary.present, envFiles: envSummary.envFiles },
      packageManager: pkgMgr,
      generatedIn: Date.now() - start + 'ms',
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  // ── Project section ──
  if (pkg) {
    const lines = [
      `  Name        ${col(c.magenta + c.bold, pkg.name)}   ${dim('v' + pkg.version)}   ${dim('[' + pkg.license + ']')}`,
      `  Description ${pkg.description}`,
      `  Type        ${pkg.type}   ${pkgMgr ? info('pkg manager: ' + pkgMgr) : ''}`,
      `  Deps        ${ok(pkg.deps + ' prod')}  ${info(pkg.devDeps + ' dev')}  ${dim(pkg.peerDeps + ' peer')}`,
      `  Scripts     ${pkg.scripts.length ? pkg.scripts.slice(0, 6).join(', ') + (pkg.scripts.length > 6 ? ` +${pkg.scripts.length - 6} more` : '') : dim('(none)')}`,
    ];
    console.log(section('PROJECT', lines));
  } else {
    console.log(section('PROJECT', [`  ${warn('No package.json found in ' + cwd)}`]));
  }
  console.log();

  // ── Git section ──
  if (git) {
    console.log(section('GIT', fmtGitStatus(git)));
  } else {
    console.log(section('GIT', [`  ${dim('Not a git repository')}`]));
  }
  console.log();

  // ── Runtime section ──
  {
    const { nodeVer, npmVer, bunVer, pnpmVer, yarnVer, gitVer } = runtime;
    const lines = [
      `  Node.js     ${ok(nodeVer)}`,
      `  npm         ${npmVer ? dim(npmVer) : dim('(not found)')}`,
    ];
    if (bunVer)  lines.push(`  bun         ${dim(bunVer)}`);
    if (pnpmVer) lines.push(`  pnpm        ${dim(pnpmVer)}`);
    if (yarnVer) lines.push(`  yarn        ${dim(yarnVer)}`);
    if (gitVer)  lines.push(`  git         ${dim(gitVer)}`);
    lines.push(`  Platform    ${dim(platform())}`);
    console.log(section('RUNTIME', lines));
  }
  console.log();

  // ── Directory section ──
  {
    const lines = [
      `  Total files ${bold(String(dirStats.total))}   Total size ${bold(formatBytes(dirStats.size))}`,
      `  Largest files:`,
      ...dirStats.largest.map(f => `    ${col(c.gray, '▸')} ${f.path.padEnd(44)} ${dim(formatBytes(f.size))}`),
      `  Recently modified:`,
      ...dirStats.recent.map(f => `    ${col(c.gray, '▸')} ${f.path.padEnd(44)} ${dim(f.age)}`),
    ];
    console.log(section('DIRECTORY', lines));
  }
  console.log();

  // ── Open ports section ──
  {
    const lines = openPorts.length
      ? openPorts.map(p => `  ${col(c.green, '●')} ${bold(String(p.port))}  ${dim(p.label)}`)
      : [`  ${dim('No dev ports in use')}`];
    console.log(section('OPEN PORTS', lines));
  }
  console.log();

  // ── Environment section ──
  {
    const lines = [
      `  NODE_ENV    ${envSummary.nodeEnv ? ok(String(envSummary.nodeEnv)) : dim('(not set)')}`,
    ];
    if (envSummary.envFiles.length) {
      lines.push(`  .env files  ${envSummary.envFiles.map(f => ok(f)).join('  ')}`);
    }
    if (envSummary.present.length) {
      lines.push(`  Set vars    ${envSummary.present.map(k => ok('✓ ' + k)).join('  ')}`);
    }
    console.log(section('ENVIRONMENT', lines));
  }
  console.log();

  console.log(dim(`  Generated in ${Date.now() - start}ms · ${new Date().toLocaleTimeString()}`));
  console.log();
}

// ─── GIT SUB-REPORT ──────────────────────────────────────────────────────────
async function showGitReport() {
  const git = getGitInfo();
  if (!git) { console.log(err('\nNot a git repository.\n')); return; }

  console.log('\n' + boxHeader('GIT REPORT'));
  for (const l of fmtGitStatus(git)) console.log(boxRow(l));
  console.log();
  console.log(boxHeader('RECENT COMMITS'));
  for (const l of fmtRecentCommits(git.recentCommits)) console.log(boxRow(l));
  console.log(boxFooter());
  console.log();
}

// ─── DEPS SUB-REPORT ─────────────────────────────────────────────────────────
async function showDepsReport() {
  const cwd = process.cwd();
  const pkg = getPkgInfo(cwd);
  if (!pkg) { console.log(warn('\nNo package.json found.\n')); return; }

  const pkgMgr = detectPackageManager(cwd);
  const nmExists = existsSync(join(cwd, 'node_modules'));

  console.log('\n' + section('DEPENDENCIES', [
    `  Package     ${col(c.magenta, pkg.name)} ${dim('v' + pkg.version)}`,
    `  Manager     ${pkgMgr ? info(pkgMgr) : dim('(unknown — no lock file)')}`,
    `  node_modules ${nmExists ? ok('installed') : err('missing — run install')}`,
    `  Production  ${ok(String(pkg.deps))} packages`,
    `  Development ${info(String(pkg.devDeps))} packages`,
    `  Peer        ${dim(String(pkg.peerDeps))} packages`,
    `  Total       ${bold(String(pkg.deps + pkg.devDeps + pkg.peerDeps))} total`,
    ``,
    `  Scripts:`,
    ...pkg.scripts.map(s => `    ${col(c.gray, '▸')} ${s}`),
  ]));
  console.log();
}

// ─── PORTS SUB-REPORT ────────────────────────────────────────────────────────
async function showPortsReport() {
  console.log('\n' + col(c.cyan, 'Scanning ports...'));
  const open = await getOpenPorts();
  const all  = DEV_PORTS.map(p => ({
    ...p,
    inUse: open.some(o => o.port === p.port),
  }));

  const lines = all.map(p =>
    `  ${p.inUse ? col(c.green, '● IN USE') : col(c.gray, '○ free  ')}  :${String(p.port).padEnd(6)} ${dim(p.label)}`
  );
  console.log(section('PORT SCAN', lines));
  console.log();
}

// ─── WATCH MODE ──────────────────────────────────────────────────────────────
async function watchMode() {
  console.clear();
  await showFullReport();
  setInterval(async () => {
    console.clear();
    await showFullReport();
  }, 5000);
}

// ─── HELP ────────────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
${banner()}

${bold('USAGE')}
  workspace-info [command] [flags]
  wsi [command] [flags]

${bold('COMMANDS')}
  (none)          Full workspace report
  show            Full workspace report (alias)
  git             Git-focused sub-report
  deps            Dependency-focused sub-report
  ports           Port scan sub-report

${bold('FLAGS')}
  --json          Output as JSON
  --watch, -w     Refresh every 5 seconds
  --help, -h      Show this help

${bold('EXAMPLES')}
  npx workspace-info
  npx workspace-info git
  npx workspace-info ports
  npx workspace-info --json | jq '.git'
  wsi --watch
`);
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) { showHelp(); return; }

  const isJson  = args.includes('--json');
  const isWatch = args.includes('--watch') || args.includes('-w');
  const cmd     = args.find(a => !a.startsWith('-')) || 'show';

  if (isWatch) { await watchMode(); return; }

  switch (cmd) {
    case 'show':
    case 'full':
      await showFullReport({ json: isJson });
      break;
    case 'git':
      await showGitReport();
      break;
    case 'deps':
    case 'dependencies':
      await showDepsReport();
      break;
    case 'ports':
    case 'port':
      await showPortsReport();
      break;
    default:
      await showFullReport({ json: isJson });
  }
}

main().catch(e => {
  process.stderr.write('workspace-info error: ' + e.message + '\n');
  process.exit(1);
});
