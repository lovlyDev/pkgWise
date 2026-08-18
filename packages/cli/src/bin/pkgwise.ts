#!/usr/bin/env node

import { runCli } from '../runCli.js';

const controller = new AbortController();
let interruptionCount = 0;

process.on('SIGINT', () => {
  interruptionCount += 1;
  if (interruptionCount === 1) {
    controller.abort();
    process.exitCode = 130;
    return;
  }

  process.exit(130);
});

const exitCode = await runCli(process.argv.slice(2), { signal: controller.signal });
process.exitCode = controller.signal.aborted ? 130 : exitCode;
