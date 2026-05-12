#!/usr/bin/env node
// Wraps `npm install` with an interactive review of any package that wants
// to run a preinstall/install/postinstall script. Approved packages go into
// .trusted-deps.json and are rebuilt with scripts enabled. Everything else
// stays blocked by .npmrc (ignore-scripts=true).
//
//   npm run install:safe                 # review currently installed packages
//   npm run install:safe -- <pkg> [...]  # npm install <pkg>, then review

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

const TRUSTED_FILE = path.resolve('.trusted-deps.json');
const HOOKS = ['preinstall', 'install', 'postinstall'];

function loadTrusted() {
  if (!fs.existsSync(TRUSTED_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(TRUSTED_FILE, 'utf8'));
    return Array.isArray(raw.trusted) ? raw.trusted : [];
  } catch {
    return [];
  }
}

function saveTrusted(list) {
  const sorted = [...new Set(list)].sort();
  fs.writeFileSync(TRUSTED_FILE, JSON.stringify({ trusted: sorted }, null, 2) + '\n');
}

function scan(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.bin' || entry.name === '.cache') continue;
    if (entry.name.startsWith('@')) {
      scan(path.join(dir, entry.name), found);
      continue;
    }
    const pkgDir = path.join(dir, entry.name);
    const pjPath = path.join(pkgDir, 'package.json');
    if (fs.existsSync(pjPath)) {
      try {
        const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
        const scripts = pj.scripts || {};
        const hooks = HOOKS.filter((h) => scripts[h]);
        if (hooks.length) {
          found.push({
            name: pj.name,
            version: pj.version,
            hooks: Object.fromEntries(hooks.map((h) => [h, scripts[h]])),
          });
        }
      } catch {}
    }
    const nested = path.join(pkgDir, 'node_modules');
    if (fs.existsSync(nested)) scan(nested, found);
  }
  return found;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    console.log(`\n→ npm install ${args.join(' ')}  (scripts blocked by .npmrc)\n`);
    const r = spawnSync('npm', ['install', ...args], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  const installed = scan('node_modules');
  if (installed.length === 0) {
    console.log('\nNo packages with install scripts present.');
    return;
  }

  const trusted = new Set(loadTrusted());
  const unreviewed = installed.filter((p) => !trusted.has(p.name));

  if (unreviewed.length > 0) {
    console.log(`\n⚠️  ${unreviewed.length} package(s) want to run install scripts and are not on the trusted list:\n`);
    const newlyApproved = [];
    const interactive = process.stdin.isTTY;

    for (const pkg of unreviewed) {
      console.log(`  ${pkg.name}@${pkg.version}`);
      for (const [h, cmd] of Object.entries(pkg.hooks)) {
        console.log(`    ${h}: ${cmd}`);
      }
      if (!interactive) {
        console.log('    (non-interactive — left blocked)\n');
        continue;
      }
      const ans = await ask('    Allow? [y/N]: ');
      console.log('');
      if (ans === 'y' || ans === 'yes') {
        newlyApproved.push(pkg.name);
        trusted.add(pkg.name);
      }
    }

    if (newlyApproved.length > 0) {
      saveTrusted([...trusted]);
      console.log(`Added to .trusted-deps.json: ${newlyApproved.join(', ')}\n`);
    }
  }

  const toRebuild = installed.filter((p) => trusted.has(p.name)).map((p) => p.name);
  if (toRebuild.length > 0) {
    console.log(`→ npm rebuild ${toRebuild.join(' ')}\n`);
    const r = spawnSync(
      'npm',
      ['rebuild', '--ignore-scripts=false', '--foreground-scripts=true', ...toRebuild],
      { stdio: 'inherit', env: { ...process.env, npm_config_ignore_scripts: 'false' } },
    );
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  const blocked = installed.filter((p) => !trusted.has(p.name));
  if (blocked.length > 0) {
    console.log(`\nLeft blocked: ${blocked.map((p) => `${p.name}@${p.version}`).join(', ')}`);
  } else {
    console.log('\nAll install scripts reviewed and rebuilt.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
