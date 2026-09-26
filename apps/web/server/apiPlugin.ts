import type { Plugin } from 'vite';
import { dataMiddleware } from './dataFiles.ts';

/**
 * API locale servie par le serveur de Vite (pas de second processus), en développement comme en
 * prévisualisation du build : santé, état des données et fichiers de data/build (lecture seule).
 * Accueillera la lecture et l'écriture des scénarios, des captures et de config/model.yaml.
 */
export function geosimApi(): Plugin {
  const data = dataMiddleware();
  return {
    name: 'geosim-api',
    configureServer(server) {
      server.middlewares.use('/api/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true }));
      });
      server.middlewares.use(data);
    },
    configurePreviewServer(server) {
      server.middlewares.use(data);
    },
  };
}
