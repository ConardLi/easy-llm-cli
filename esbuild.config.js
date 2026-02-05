/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require(path.resolve(__dirname, 'package.json'));

// Banner for ESM bundles:
// - provide __dirname (used by some deps) without touching globalThis
// - provide a real CommonJS `require` via createRequire() so esbuild doesn't
//   fall back to its dynamic-require shim which throws at runtime in ESM
const esmRuntimeBanner =
  "import { createRequire as __cc_createRequire } from 'module';" +
  " import { fileURLToPath as __cc_fileURLToPath } from 'url';" +
  " import * as __cc_path from 'path';" +
  " const require = __cc_createRequire(import.meta.url);" +
  " const __dirname = __cc_path.dirname(__cc_fileURLToPath(import.meta.url));";

esbuild
  .build({
    entryPoints: ['packages/cli/index.ts'],
    bundle: true,
    outfile: 'bundle/gemini.js',
    platform: 'node',
    format: 'esm',
    define: {
      'process.env.CLI_VERSION': JSON.stringify(pkg.version),
    },
    banner: {
      js: esmRuntimeBanner,
    },
  })
  .catch(() => process.exit(1));

// Build API bundle

const commonAPIOptions = {
  entryPoints: ['index.ts'],
  bundle: true,
  platform: 'node',
  define: {
    'process.env.CLI_VERSION': JSON.stringify(pkg.version),
  },
  external: [
    '@google/genai',
    'assert',
    'buffer',
    'child_process',
    'crypto',
    'events',
    'fs',
    'http',
    'https',
    'net',
    'os',
    'path',
    'stream',
    'tty',
    'url',
    'util',
    'zlib',
  ],
};

esbuild
  .build({
    ...commonAPIOptions,
    outfile: 'bundle/api.js',
    format: 'esm',
    banner: {
      js: esmRuntimeBanner,
    },
  })
  .catch(() => process.exit(1));

esbuild
  .build({
    ...commonAPIOptions,
    outfile: 'bundle/api.cjs',
    format: 'cjs',
    define: { 'import.meta.url': '_importMetaUrl' },
    banner: {
      js: "const _importMetaUrl=require('url').pathToFileURL(__filename)",
    },
  })
  .catch(() => process.exit(1));
