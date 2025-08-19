#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseFile } from 'music-metadata';
import { spawn } from 'child_process';

const args = {};
for (let i=2; i<process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--path') {
    args.path = process.argv[++i];
  } else if (arg === '--report') {
    args.report = process.argv[++i];
  } else if (arg === '--fingerprint') {
    args.fingerprint = true;
  }
}

if (!args.path) {
  console.error('Usage: node index.js --path <folder> [--report <report.html>] [--fingerprint]');
  process.exit(1);
}

const root = path.resolve(args.path);
const reportPath = args.report ? path.resolve(args.report) : path.resolve('report.html');

const supported = new Set(['.mp3','.wav','.aiff','.aif','.m4a','.aac','.flac','.ogg']);

async function* walk(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

async function hashFile(file) {
  return new Promise((res, rej) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(file);
    stream.on('error', rej);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => res(hash.digest('hex')));
  });
}

async function analyseMetadata(file) {
  try {
    const meta = await parseFile(file);
    const c = meta.common || {};
    return { title: c.title || '', artist: c.artist || '', album: c.album || '' };
  } catch {
    return { title:'', artist:'', album:'' };
  }
}

async function fingerprintFile(file) {
  return new Promise(resolve => {
    const proc = spawn('fpcalc', ['-json', file]);
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('error', () => resolve(null));
    proc.on('close', code => {
      if (code !== 0) {
        resolve(null);
      } else {
        try {
          const obj = JSON.parse(out.trim());
          resolve(obj);
        } catch {
          resolve(null);
        }
      }
    });
  });
}

async function queryAcoustID(fpObj) {
  const apiKey = process.env.ACOUSTID_API_KEY;
  if (!apiKey || !fpObj) return null;
  const { fingerprint, duration } = fpObj;
  const url = new URL('https://api.acoustid.org/v2/lookup');
  url.searchParams.set('client', apiKey);
  url.searchParams.set('meta', 'recordings+releasegroups+compress');
  url.searchParams.set('fingerprint', fingerprint);
  url.searchParams.set('duration', duration);
  try {
    const resp = await fetch(url.toString());
    const data = await resp.json();
    if (data.results && data.results[0] && data.results[0].recordings && data.results[0].recordings[0]) {
      const rec = data.results[0].recordings[0];
      const title = rec.title || '';
      const artist = rec.artists ? rec.artists.map(a => a.name).join(', ') : '';
      const album = rec.releases && rec.releases[0] ? rec.releases[0].title || '' : '';
      return { title, artist, album };
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const files = [];
  const unsupported = [];
  for await (const f of walk(root)) {
    const ext = path.extname(f).toLowerCase();
    if (supported.has(ext)) {
      files.push(f);
    } else {
      unsupported.push(f);
    }
  }
  const dupMap = new Map();
  for (const f of files) {
    const h = await hashFile(f);
    const list = dupMap.get(h) || [];
    list.push(f);
    dupMap.set(h, list);
  }
  const duplicates = Array.from(dupMap.values()).filter(list => list.length > 1);
  const missing = [];
  for (const f of files) {
    const meta = await analyseMetadata(f);
    if (!meta.title || !meta.artist) {
      let suggestion = null;
      if (args.fingerprint) {
        const fpObj = await fingerprintFile(f);
        if (fpObj) suggestion = await queryAcoustID(fpObj);
      }
      missing.push({ file: f, meta, suggestion });
    }
  }
  let html = '<!doctype html><html><head><meta charset="utf-8"><title>Gig Preflight Report</title><style>body{background:#0b1220;color:#d7e1ec;font-family:Arial;padding:20px;}h1{font-size:24px;}h2{font-size:20px;margin-top:24px;}table{width:100%;border-collapse:collapse;margin-top:10px;}th,td{border:1px solid #203052;padding:8px;font-size:12px;}th{background:#0e172a;color:#93c5fd;}</style></head><body>';
  html += '<h1>Gig Preflight Report</h1>';
  html += `<p>Root: ${root}</p>`;
  html += `<p>Unsupported files: ${unsupported.length}</p>`;
  html += `<p>Duplicate sets: ${duplicates.length}</p>`;
  html += `<p>Tracks missing metadata: ${missing.length}</p>`;
  if (duplicates.length) {
    html += '<h2>Duplicates</h2>';
    duplicates.forEach((list, idx) => {
      html += `<p>Group ${idx+1} (${list.length} files)</p><ul>`;
      list.forEach(file => { html += `<li>${file}</li>`; });
      html += '</ul>';
    });
  }
  if (missing.length) {
    html += '<h2>Missing Metadata</h2><table><thead><tr><th>File</th><th>Current</th><th>Suggested</th></tr></thead><tbody>';
    missing.forEach(({ file, meta, suggestion }) => {
      const cur = `${meta.title || '—'} / ${meta.artist || '—'} / ${meta.album || '—'}`;
      const sug = suggestion ? `${suggestion.title || '—'} / ${suggestion.artist || '—'} / ${suggestion.album || '—'}` : '—';
      html += `<tr><td>${file}</td><td>${cur}</td><td>${sug}</td></tr>`;
    });
    html += '</tbody></table>';
  }
  html += '</body></html>';
  await fs.promises.writeFile(reportPath, html, 'utf8');
  console.log('Report saved to ' + reportPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
