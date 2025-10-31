#!/usr/bin/env node
const { execSync } = require('node:child_process');
const { writeFileSync, readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');

const root = resolve(dirname(__filename), '..');

function run(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
}

function formatNz(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : new Date(dateInput);
  const formatter = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const tz = map.timeZoneName || 'NZT';
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second} ${tz}`;
}

function getLiveCommit() {
  const path = resolve(root, 'FORCE-DEPLOY-NOW.md');
  try {
    const contents = readFileSync(path, 'utf8');
    const match = contents.match(/\*\*Current Live Commit\*\*:\s*([0-9a-f]{7,})/i);
    if (match) return match[1];
  } catch (error) {
    console.warn('Unable to read FORCE-DEPLOY-NOW.md:', error.message);
  }
  return null;
}

function buildMissingCommits(liveCommit) {
  if (!liveCommit) {
    const head = run('git rev-parse --short HEAD');
    const message = run('git log -1 --pretty=%s');
    const iso = run('git log -1 --date=iso-strict --pretty=%cd');
    return [{ hash: head, iso, message }];
  }
  const raw = run(`git log --pretty=format:%h^%cI^%s ${liveCommit}..HEAD`);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => {
    const [hash, iso, ...subjectParts] = line.split('^');
    return { hash, iso, message: subjectParts.join('^').trim() };
  });
}

const latest = {
  full: run('git rev-parse HEAD'),
  short: run('git rev-parse --short HEAD'),
  subject: run('git log -1 --pretty=%s'),
  author: run('git log -1 --pretty=%an'),
  iso: run('git log -1 --date=iso-strict --pretty=%cd'),
};

const now = new Date();
const nowNz = formatNz(now);
const cacheBuster = Date.now().toString();
const liveCommit = getLiveCommit();
const missingCommits = buildMissingCommits(liveCommit);
const missingCount = missingCommits.length;

const liveSummary = liveCommit
  ? {
      hash: liveCommit,
      iso: run(`git show -s --date=iso-strict --pretty=%cd ${liveCommit}`),
      message: run(`git show -s --pretty=%s ${liveCommit}`),
    }
  : null;

const criticalList = missingCommits.slice(0, 8).map((commit) => `- ${commit.hash} — ${commit.message}`);

const forceDeploy = `# 🚨 FORCE DEPLOYMENT - CRITICAL FIX

## Issue: GitHub Pages Not Deploying Latest Commits

**Current Live Commit**: ${liveSummary ? `${liveSummary.hash} (${formatNz(liveSummary.iso)})` : 'UNKNOWN'}
**Latest Local Commit**: ${latest.short} (${latest.subject})
**Problem**: ${missingCount || '0'} commit${missingCount === 1 ? '' : 's'} behind, deployment pipeline broken

## Immediate Actions

### 1. Force GitHub Pages Rebuild
- Manual trigger required
- Clear any cached artifacts
- Force fresh deployment

### 2. Update Build Timestamp
**Current Time**: ${nowNz}
**Latest Commit**: ${latest.short} — ${latest.subject}
**Status**: FORCE DEPLOYMENT TRIGGERED - awaiting GitHub Pages rebuild

### 3. Critical Changes Not Live
${criticalList.length ? criticalList.join('\n') : '- Latest commit already live'}

## This File Will Trigger Deployment

By committing this file, we force a new deployment that GitHub Pages MUST pick up.

**Expected Result**: Live site shows commit ${latest.short} within minutes of rebuild.

---

**DEPLOYMENT FORCED AT**: ${nowNz}
`;
writeFileSync(resolve(root, 'FORCE-DEPLOY-NOW.md'), forceDeploy.trim() + '\n');

const buildInfo = `🚨 DEPLOYMENT STATUS: COMPLETE REBUILD REQUIRED
===============================
📅 Last Deploy Attempt: ${nowNz}
🔧 Build: Hugo Static Site + COMPLETE CACHE PURGE
🌐 Hosting: GitHub Pages (manual trigger still required)
📍 Latest Commit: ${latest.short} — ${latest.subject}
👤 Author: ${latest.author}
🆕 Missing Commits: ${missingCount}
💾 Live Commit: ${liveSummary ? `${liveSummary.hash} — ${liveSummary.message}` : 'UNKNOWN'}
🔄 Auto-deploy: Emergency override active
📣 Action: Trigger GitHub Pages rebuild and confirm integration
🔥 CACHE-BUSTER: ${cacheBuster}
===============================
`;
writeFileSync(resolve(root, 'static/build-info.txt'), buildInfo);

const deployTimestamp = `DEPLOYMENT TIMESTAMP: ${nowNz}
COMMIT: ${latest.short}
MESSAGE: ${latest.subject}
AUTHOR: ${latest.author}
LIVE COMMIT: ${liveSummary ? `${liveSummary.hash}` : 'UNKNOWN'}
MISSING COMMITS: ${missingCount}
STATUS: Deployment metadata updated to force rebuild
ACTION: Trigger GitHub Pages build and verify Hugo layouts
CACHE-BUSTER: ${cacheBuster}
`;
writeFileSync(resolve(root, 'static/deployment-timestamp.txt'), deployTimestamp);

const cacheBusterText = `CACHE BUSTER: ${nowNz}
FORCE REBUILD: ${latest.short}
MISSING COMMITS: ${missingCount}
NOTE: Updated via scripts/update-deployment-status.js to invalidate Pages cache
TIMESTAMP: ${cacheBuster}
`;
writeFileSync(resolve(root, 'static/CACHE-BUSTER.txt'), cacheBusterText);

const expectedList = missingCommits
  .slice()
  .reverse()
  .map((commit, index) => `| ${index + 1} | \`${commit.hash}\` | ${formatNz(commit.iso)} | ${commit.message} |`)
  .join('\n');

const summary = `# Missing Deployments Report

- Generated: ${nowNz}
- Live commit: ${liveSummary ? `${liveSummary.hash} — ${liveSummary.message}` : 'UNKNOWN'}
- Latest commit: ${latest.short} — ${latest.subject}
- Missing commits: ${missingCount}

| # | Commit | Date (NZ) | Message |
| --- | --- | --- | --- |
${expectedList || '| 1 | `N/A` | N/A | No missing commits detected |'}
`;
writeFileSync(resolve(root, 'DEPLOYMENT-MISSING-COMMITS.md'), summary.trim() + '\n');

try {
  const manualFix = readFileSync(resolve(root, 'DEPLOYMENT-MANUAL-FIX.md'), 'utf8');
  const updatedManual = manualFix.replace(/These commits are stuck and need to go live:[\s\S]*?## VERIFICATION/, () => {
    const list = missingCommits.slice(0, 12).map((commit) => `- \`${commit.hash}\`: ${commit.message}`).join('\n');
    return `These commits are stuck and need to go live:\n${list || '- (none)'}\n\n## VERIFICATION`;
  });
  writeFileSync(resolve(root, 'DEPLOYMENT-MANUAL-FIX.md'), updatedManual);
} catch (error) {
  console.warn('Unable to update DEPLOYMENT-MANUAL-FIX.md:', error.message);
}

console.log(`Updated deployment metadata for ${missingCount} missing commits.`);
