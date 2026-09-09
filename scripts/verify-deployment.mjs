import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd());
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const normalizeText = (value) => value.replace(/\r\n/g, '\n').trim();
const serviceBlock = (source, serviceName) => {
  const lines = normalizeText(source).split('\n');
  const start = lines.findIndex((line) => line === `  ${serviceName}:`);
  assert(start >= 0, `Compose service is missing: ${serviceName}`);
  const nextService = lines.findIndex((line, index) => index > start && /^  [a-zA-Z0-9_-]+:$/.test(line));
  return lines.slice(start, nextService >= 0 ? nextService : lines.length).join('\n');
};

const compose = read('compose.yaml');
const synologyCompose = read('docker-compose.synology.yml');
const apiDockerfile = read('apps/api/Dockerfile');
const webDockerfile = read('apps/web/Dockerfile');
const deployRelease = read('scripts/deploy-release.sh');

assert(normalizeText(compose) === normalizeText(synologyCompose), 'Compose files have drifted');
for (const serviceName of ['api', 'web']) {
  const block = serviceBlock(compose, serviceName);
  for (const requiredSection of ['image:', 'environment:', 'healthcheck:']) {
    assert(block.includes(requiredSection), `${serviceName} Compose section is missing: ${requiredSection}`);
  }
}
const apiBlock = serviceBlock(compose, 'api');
for (const requiredEnvironment of [
  'DATA_DIR:',
  'SQLITE_PATH:',
  'BACKUP_DIR:',
  'UPLOAD_DIR:',
  'STUDENT_PHOTO_DIR:',
  'CORS_ORIGINS:',
  'KMA_AUTH_KEY:',
  'TEACHER_NOTEBOOK_ADMIN_BOOTSTRAP_TOKEN:',
  'DATA_VOLUME_REQUIRE_MARKER:',
]) {
  assert(apiBlock.includes(requiredEnvironment), `API Compose environment is missing: ${requiredEnvironment}`);
}
assert(apiBlock.includes(':/app/apps/api/.data'), 'API persistent data volume changed');
assert(apiBlock.includes('scripts/container-readiness.mjs'), 'API healthcheck command changed');
const webBlock = serviceBlock(compose, 'web');
assert(webBlock.includes('NEXT_PUBLIC_API_BASE_URL:'), 'Web API environment is missing');
assert(webBlock.includes("fetch('http://127.0.0.1:3000/')"), 'Web healthcheck command changed');
assert(!compose.includes('npm install'), 'Runtime Compose must not install dependencies');
assert(!compose.includes('/volume1/docker/teacher-notebook:/app'), 'Runtime Compose must not mount application source');
assert(compose.includes('/volume1/docker/teacher-notebook-data'), 'Persistent NAS data path changed');
assert(compose.includes('${API_PORT:-4000}:4000'), 'API external port default changed');
assert(compose.includes('${WEB_PORT:-3000}:3000'), 'Web external port default changed');
assert(compose.includes('condition: service_healthy'), 'Web does not wait for API readiness');
assert(apiDockerfile.includes('npm ci --omit=dev'), 'API image is not lockfile based');
assert(webDockerfile.includes('npm ci'), 'Web image is not lockfile based');
assert(!apiDockerfile.includes('npm install'), 'API Dockerfile uses npm install');
assert(!webDockerfile.includes('npm install'), 'Web Dockerfile uses npm install');
assert(
  deployRelease.includes('cmp -s compose.yaml docker-compose.synology.yml'),
  'Release script does not block Compose drift',
);

for (const requiredPath of [
  'apps/api/package-lock.json',
  'apps/web/package-lock.json',
  'apps/api/.dockerignore',
  'apps/web/.dockerignore',
  'apps/api/scripts/container-readiness.mjs',
  'apps/api/scripts/backup-sqlite.mjs',
  'apps/api/scripts/verify-sqlite-backup.mjs',
  'apps/api/scripts/data-bundle-utils.mjs',
  'apps/api/scripts/backup-data-bundle.mjs',
  'apps/api/scripts/verify-data-bundle.mjs',
  'apps/api/scripts/restore-data-bundle.mjs',
]) {
  assert(fs.existsSync(path.join(root, requiredPath)), `Missing deployment file: ${requiredPath}`);
}

console.log(JSON.stringify({
  ok: true,
  check: 'deployment-files',
  composeFilesMatch: true,
  composeServicesChecked: ['api', 'web'],
  composeSemanticsChecked: ['image', 'environment', 'volumes', 'healthcheck'],
}));
