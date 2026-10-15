import { build } from 'esbuild';
await build({entryPoints:['src/runtime/node/main.ts'],outfile:'dist/node/server.mjs',bundle:true,platform:'node',target:'node22',format:'esm',
  banner:{js:"import { createRequire as __mcRequire } from 'node:module'; const require = __mcRequire(import.meta.url);"},
  sourcemap:false,logLevel:'info'});
