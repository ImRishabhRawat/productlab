import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const swSource = (version, files) =>
  readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
    .replace('self.__SW_VERSION__', JSON.stringify(version))
    .replace('self.__SW_PRECACHE__', JSON.stringify(files));

const listFiles = (dir, root = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(file, root) : [path.relative(root, file).split(path.sep).join('/')];
  });

function serviceWorker() {
  let outDir;
  let building = false;
  return {
    name: 'product-lab-sw',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      building = config.command === 'build';
    },
    configureServer(server) {
      server.middlewares.use('/sw.js', (req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(swSource('dev', []));
      });
    },
    closeBundle() {
      if (!building) return;
      const files = listFiles(outDir)
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(path.join(outDir, f)));
      writeFileSync(path.join(outDir, 'sw.js'), swSource(hash.digest('hex').slice(0, 12), files.map((f) => `/${f}`)));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 4000}` },
  },
});
