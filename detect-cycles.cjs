/* eslint-disable */
// Lightweight circular-import detector for src/ (no external deps).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, 'src');
const EXT = ['.ts', '.tsx', '.js', '.jsx'];

const importRe = /^\s*(?:import\s+(?:type\s+)?(?:\{[^}]*\}|\*?\s*\w+|default|\w+(?=\s*,\s*)|))|export\s+(?:type\s+)?(?:\{[^}]*\}|from)\s+from\s*/gm;
// simpler: match any import-like and export ... from
const importLineRe = /(?:import|export\s+(?:type\s+)?)\s+(?:\{[^}]*\}|\* as \w+|[^'"]+?)?(?:\s*,\s*(?:\{[^}]*\}|\* as \w+|[^'"]+?))?\s*from\s*['"]([^'"]+)['"]/g;

function resolve(fromFile, spec) {
  if (!spec) return null;
  if (spec.startsWith('@/')) {
    return path.join(ROOT, spec.slice(2));
  }
  if (spec.startsWith('~/')) {
    return path.join(ROOT, spec.slice(2));
  }
  const dir = path.dirname(fromFile);
  let cand = path.resolve(dir, spec);
  for (const e of EXT) {
    if (fs.existsSync(cand + e)) return cand + e;
    if (fs.existsSync(cand) && fs.statSync(cand).isDirectory()) {
      const idx = path.join(cand, 'index');
      for (const e2 of EXT) if (fs.existsSync(idx + e2)) return idx + e2;
    }
  }
  return null;
}

const graph = {};
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (EXT.some((e) => entry.name.endsWith(e))) files.push(full);
  }
}
walk(ROOT);

for (const f of files) {
  const relF = path.relative(ROOT, f);
  graph[relF] = [];
  let src;
  try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
  let m;
  const re = new RegExp(importLineRe.source, 'g');
  while ((m = re.exec(src)) !== null) {
    const spec = m[1];
    const resolved = resolve(f, spec);
    if (resolved && resolved !== f) {
      graph[relF].push(path.relative(ROOT, resolved));
    }
  }
}

// DFS cycle detection (Tarjan SCC)
const index = {};
const low = {};
const onStack = {};
const stack = [];
let idx = 0;
const sccs = [];

function strongconnect(v) {
  index[v] = idx; low[v] = idx; idx++;
  stack.push(v); onStack[v] = true;
  for (const w of (graph[v] || [])) {
    if (index[w] === undefined) {
      strongconnect(w);
      low[v] = Math.min(low[v], low[w]);
    } else if (onStack[w]) {
      low[v] = Math.min(low[v], index[w]);
    }
  }
  if (low[v] === index[v]) {
    const comp = [];
    let w;
    do { w = stack.pop(); onStack[w] = false; comp.push(w); } while (w !== v);
    if (comp.length > 1) sccs.push(comp);
  }
}

for (const v of Object.keys(graph)) {
  if (index[v] === undefined) strongconnect(v);
}

console.log('=== Strong components with cycles (>1 node) ===');
if (sccs.length === 0) console.log('NO CYCLES DETECTED');
for (const comp of sccs) {
  console.log('\nCYCLE:');
  for (const n of comp) console.log('  ' + n);
}

console.log('\n=== Edges for push/layout/auth related files ===');
const keys = Object.keys(graph).filter((k) =>
  /push|layout|auth|Navbar|page|Providers|Sidebar|PwaRegister|ChatLayout/i.test(k)
);
for (const k of keys) {
  console.log(k + ' -> ' + JSON.stringify(graph[k].filter((g) => /push|layout|auth|Navbar|page|Providers|Sidebar|PwaRegister|ChatLayout|supabase|realtime/i.test(g)));
}
