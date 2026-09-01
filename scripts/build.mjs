// Production build → dist/
// Bundles and minifies src/main.js with esbuild when it is installed; otherwise
// falls back to copying the ES-module sources verbatim (the game runs either way).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, 'assets'), { recursive: true });

let html = readFileSync(path.join(root, 'index.html'), 'utf8');
cpSync(path.join(root, 'styles.css'), path.join(dist, 'styles.css'));

let bundled = false;
try {
  const esbuild = await import('esbuild');
  await esbuild.build({
    entryPoints: [path.join(root, 'src/main.js')],
    bundle: true,
    minify: true,
    format: 'esm',
    target: ['es2022'],
    sourcemap: true,
    outfile: path.join(dist, 'assets/main.js'),
    legalComments: 'none',
  });
  html = html.replace('src="./src/main.js"', 'src="./assets/main.js"');
  bundled = true;
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  console.warn('esbuild is not installed — copying unbundled ES modules instead (run `npm install` to enable minification).');
  cpSync(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
}

writeFileSync(path.join(dist, 'index.html'), html);
if (existsSync(path.join(root, 'README.md'))) cpSync(path.join(root, 'README.md'), path.join(dist, 'README.md'));

console.log(`Build complete → dist/ (${bundled ? 'esbuild bundle, minified' : 'unbundled copy'})`);
