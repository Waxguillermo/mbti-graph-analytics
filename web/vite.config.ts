import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function resolveMainGitRoot(): string {
  try {
    const commonDir = execSync('git rev-parse --git-common-dir', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const absCommon = path.resolve(repoRoot, commonDir);
    if (path.basename(absCommon) === '.git') {
      return path.dirname(absCommon);
    }
  } catch {
    // Fallback to current repoRoot if git command is unavailable
  }
  return repoRoot;
}

function resolveCohortCsvPath(): { filePath: string; isPrivate: boolean } {
  const mainRoot = resolveMainGitRoot();
  const candidates: Array<{ filePath: string; isPrivate: boolean }> = [
    { filePath: path.join(repoRoot, 'mbti_profiles.csv'), isPrivate: true },
    { filePath: path.join(mainRoot, 'mbti_profiles.csv'), isPrivate: true },
    { filePath: path.join(repoRoot, 'mbti_profiles_anon.csv'), isPrivate: false },
    { filePath: path.join(mainRoot, 'mbti_profiles_anon.csv'), isPrivate: false },
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand.filePath)) {
      return cand;
    }
  }
  throw new Error('Neither mbti_profiles.csv nor mbti_profiles_anon.csv could be found.');
}

const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.ico': 'image/x-icon',
};

function createCohortAndAssetsMiddleware() {
  const assetsRoot = path.join(repoRoot, 'assets', '16personalities');

  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const rawUrl = req.url?.split('?')[0] ?? '';

    if (rawUrl === '/__cohort.csv') {
      try {
        const resolved = resolveCohortCsvPath();
        const csvContent = fs.readFileSync(resolved.filePath, 'utf8');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('X-Cohort-Source', resolved.isPrivate ? 'local-private' : 'public-anon');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 200;
        res.end(csvContent);
        return;
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
        return;
      }
    }

    const prefix = '/assets/16personalities/';
    if (rawUrl.startsWith(prefix)) {
      const rel = decodeURIComponent(rawUrl.slice(prefix.length));
      const safePath = path.normalize(path.join(assetsRoot, rel));
      if (safePath.startsWith(assetsRoot) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        const ext = path.extname(safePath).toLowerCase();
        res.setHeader('Content-Type', MIME_BY_EXT[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.statusCode = 200;
        fs.createReadStream(safePath).pipe(res);
        return;
      }
    }

    next();
  };
}

function localCohortAndAssetsPlugin(): Plugin {
  return {
    name: 'local-cohort-and-16p-assets',
    configureServer(server) {
      server.middlewares.use(createCohortAndAssetsMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createCohortAndAssetsMiddleware());
    },
    closeBundle() {
      const distDir = path.join(__dirname, 'dist');
      if (!fs.existsSync(distDir)) return;

      // Copy 16personalities assets into dist for standalone static builds
      const srcAssets = path.join(repoRoot, 'assets', '16personalities');
      const dstAssets = path.join(distDir, 'assets', '16personalities');
      if (fs.existsSync(srcAssets)) {
        fs.cpSync(srcAssets, dstAssets, { recursive: true });
      }

      // Copy ONLY anonymized CSV as static fallback (never copy private mbti_profiles.csv to dist)
      const anonCsv = path.join(repoRoot, 'mbti_profiles_anon.csv');
      if (fs.existsSync(anonCsv)) {
        fs.copyFileSync(anonCsv, path.join(distDir, 'cohort_fallback.csv'));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localCohortAndAssetsPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-motion': ['framer-motion', 'lucide-react'],
          'vendor-lottie': ['lottie-web'],
        },
      },
    },
  },
});
