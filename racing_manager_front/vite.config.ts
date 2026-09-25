import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const HEALTH_BODY = JSON.stringify({ status: 'ok' });

function healthEndpoint(): Plugin {
  const handler: Connect.NextHandleFunction = (_req, res, next) => {
    if (_req.url?.split('?')[0] !== '/health') {
      next();
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(HEALTH_BODY);
  };

  return {
    name: 'health-endpoint',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), healthEndpoint()],

  server: {
    host: '0.0.0.0',
    port: 5173,

    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        xfwd: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/media': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
