import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getApiApp } from './server/createApiApp';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

function resolveServerPort(): number {
  const portFlagIndex = process.argv.findIndex((arg) => arg === '--port' || arg.startsWith('--port='));
  if (portFlagIndex !== -1) {
    const raw = process.argv[portFlagIndex].includes('=')
      ? process.argv[portFlagIndex].split('=')[1]
      : process.argv[portFlagIndex + 1];
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  const envPort = Number(process.env.PORT);
  // In Cloud Run / AI Studio dev containers, nginx listens on 8080 and proxies to dev server on 3000.
  if (!isProduction && envPort === 8080) {
    return 3000;
  }

  return Number.isInteger(envPort) && envPort > 0 ? envPort : 3000;
}

const PORT = resolveServerPort();
const app = getApiApp();

// -----------------------------------------------------------------------------
// VITE DEV SERVER / PRODUCTION STATIC SERVING
// -----------------------------------------------------------------------------
async function startServer() {
  const publicPath = path.resolve(__dirname, 'public');
  app.use(express.static(publicPath, { dotfiles: 'allow' }));

  let viteServer: any = null;
  if (!isProduction) {
    process.env.DISABLE_HMR = 'true';
    const { createServer: createViteServer } = await import('vite');
    viteServer = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Shopcart Full-Stack Server running on port ${PORT}`);
  });

  const shutdown = async () => {
    try {
      if (viteServer) {
        await viteServer.close();
      }
    } catch {
      // ignore close errors during shutdown
    }
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
