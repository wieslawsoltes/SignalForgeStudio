import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Build only the browser app. No relay code, recordings, or credentials are published. */
export async function buildPages(destination = path.join(root, 'dist')) {
  const output = path.resolve(destination);
  if (output === path.parse(output).root || output === root.replace(/\/$/, '') || root.startsWith(output + path.sep)) {
    throw new Error('Refusing to replace the project directory or its ancestors.');
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(root, 'app'), output, { recursive: true });
  const index = path.join(output, 'index.html');
  const html = await readFile(index, 'utf8');
  await writeFile(index, html.replace('</head>', '  <meta name="signalforge-hosting" content="static">\n</head>'));
  await writeFile(path.join(output, '.nojekyll'), '');
  await writeFile(path.join(output, 'LICENSE.txt'), await readFile(path.join(root, 'LICENSE')));
  console.log(`GitHub Pages browser app staged in ${output}`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildPages();
}
