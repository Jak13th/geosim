import type { Plugin } from 'vite';

/**
 * API locale servie par le serveur de développement de Vite (pas de second processus).
 * Accueillera la lecture et l'écriture des scénarios, des captures et de config/model.yaml.
 */
export function geosimApi(): Plugin {
  return {
    name: 'geosim-api',
    configureServer(server) {
      server.middlewares.use('/api/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true }));
      });
    },
  };
}
