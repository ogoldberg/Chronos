// CI-safe build wrapper.
//
// Calling `vite build` via the CLI hangs in some Linux runner environments
// even though rolldown finishes the bundle in <1s — a handle from the
// native binding (or a transitive Node dep) keeps the libuv loop alive
// and the process never exits. The wrapper invokes Vite's `build()` API
// and force-exits after it resolves.

import { build } from 'vite';

try {
  await build({ logLevel: 'info' });
} catch (err) {
  console.error(err);
  process.exit(1);
}

process.exit(0);
