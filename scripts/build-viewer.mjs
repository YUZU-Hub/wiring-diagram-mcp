// Bundles the MCP App view (viewer/) into one self-contained HTML file,
// dist/viewer.html, which src/viewer.ts serves as the `ui://` resource. Hosts
// render it in a sandboxed iframe that may load nothing but the declared
// icon host, so script and styles are inlined.

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const bundle = await build({
  entryPoints: [new URL('viewer/viewer.ts', root).pathname],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  write: false,
});

// A literal `</script` inside the bundle would end the inline script early.
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await read('viewer/viewer.css');
const html = (await read('viewer/index.html'))
  .replace('/*__VIEWER_CSS__*/', () => css)
  .replace('/*__VIEWER_JS__*/', () => js);

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/viewer.html', root), html);
console.log(`dist/viewer.html: ${(html.length / 1024).toFixed(0)} KiB`);
