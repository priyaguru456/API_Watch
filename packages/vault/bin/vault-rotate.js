#!/usr/bin/env node
import { runRotationCli } from '../src/cli.js';

runRotationCli()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[VAULT ERROR] ${err.message}`);
    process.exit(1);
  });
