#!/usr/bin/env node
// Shared per-workspace port allocator for parallel Superset workspaces of
// this repo. Superset itself only observes listening ports, it does not
// assign them (docs.superset.sh/ports), so this implements the
// shared-allocation-file pattern the docs point to. Callers are expected to
// hold lib/lock.sh's lock around invocations to avoid a read/write race
// between two workspaces allocating at once.
//
// Usage:
//   port-alloc.cjs allocate <workspaceKey> <rangeStart> <rangeEnd>
//   port-alloc.cjs release  <workspaceKey>
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const file = path.join(os.homedir(), '.superset', 'debatelab-ports', 'allocations.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const [, , cmd, workspace, start, end] = process.argv;

if (!cmd || !workspace) {
  console.error('usage: port-alloc.cjs allocate|release <workspaceKey> [rangeStart] [rangeEnd]');
  process.exit(1);
}

if (cmd === 'allocate') {
  const data = readData();
  if (data[workspace]) {
    console.log(data[workspace]);
    process.exit(0);
  }
  const used = new Set(Object.values(data));
  for (let p = Number(start); p <= Number(end); p++) {
    if (!used.has(p)) {
      data[workspace] = p;
      writeData(data);
      console.log(p);
      process.exit(0);
    }
  }
  console.error(`port-alloc: no free port in ${start}-${end}`);
  process.exit(1);
} else if (cmd === 'release') {
  const data = readData();
  delete data[workspace];
  writeData(data);
} else {
  console.error(`port-alloc: unknown command "${cmd}"`);
  process.exit(1);
}
