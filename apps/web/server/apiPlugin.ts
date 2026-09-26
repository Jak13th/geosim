import { resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { MODEL_EVENT } from '../src/api/contract.ts';
import { capturesMiddleware } from './captures.ts';
import { dataMiddleware } from './dataFiles.ts';
import { MODEL_PATH, modelMiddleware } from './modelFile.ts';

/**
 * Surveille config/model.yaml : à chaque changement sur le disque (éditeur de texte ou bouton
 * « Enregistrer » de l'onglet Modèle), l'interface est prévenue par un événement HMR et recharge
 * les coefficients à chaud (SPEC §6.4).
 */
function watchModel(server: ViteDevServer): void {
  server.watcher.add(MODEL_PATH);
  let timer: ReturnType<typeof setTimeout> | null = null;
  server.watcher.on('change', (file) => {
    if (resolve(file) !== MODEL_PATH) return;
    // Les éditeurs écrivent parfois en plusieurs fois : on attend que le fichier soit stable.
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      server.ws.send(MODEL_EVENT, { at: Date.now() });
    }, 150);
  });
}

/**
 * API locale servie par le serveur de Vite (pas de second processus), en développement comme en
 * prévisualisation du build : santé, état des données et fichiers de data/build (lecture seule),
 * coefficients de config/model.yaml (lecture, enregistrement, rechargement à chaud) et captures.
 */
export function geosimApi(): Plugin {
  const data = dataMiddleware();
  const model = modelMiddleware();
  const captures = capturesMiddleware();
  return {
    name: 'geosim-api',
    configureServer(server) {
      server.middlewares.use('/api/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true }));
      });
      server.middlewares.use(data);
      server.middlewares.use(model);
      server.middlewares.use(captures);
      watchModel(server);
    },
    configurePreviewServer(server) {
      server.middlewares.use(data);
      server.middlewares.use(model);
      server.middlewares.use(captures);
    },
  };
}
