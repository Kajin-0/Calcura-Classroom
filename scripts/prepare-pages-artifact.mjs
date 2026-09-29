import { Console } from 'node:console';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const logger = new Console(process.stdout, process.stderr);

const distDirectory = resolve('dist');
await mkdir(distDirectory, { recursive: true });
await copyFile(
  resolve(distDirectory, 'index.html'),
  resolve(distDirectory, '404.html'),
);
logger.log('Prepared GitHub Pages SPA fallback at dist/404.html.');
