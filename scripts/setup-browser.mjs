/**
 * Installe le Chromium headless de Playwright, utilisé par `npm run check:console`.
 * Playwright ne publie plus de binaires pour Ubuntu 20.04 : on y force la cible Ubuntu 22.04,
 * dont le binaire Chromium fonctionne avec la glibc 2.31 (vérifié le 25/09/2026).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const env = { ...process.env };
if (existsSync('/etc/os-release')) {
  const osRelease = readFileSync('/etc/os-release', 'utf8');
  if (/^ID=ubuntu$/m.test(osRelease) && /^VERSION_ID="20\.04"$/m.test(osRelease)) {
    env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ??= 'ubuntu22.04-x64';
    console.log('Ubuntu 20.04 détecté : cible Playwright forcée sur ubuntu22.04-x64.');
  }
}

const result = spawnSync('npx', ['playwright', 'install', 'chromium', '--only-shell'], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
