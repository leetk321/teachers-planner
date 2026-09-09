import path from 'path';
import { restoreDataBundle, valueAfter } from './data-bundle-utils.mjs';

if (!process.argv.includes('--confirm-restore')) {
  throw new Error('Restore refused. Stop the API and add --confirm-restore after verifying the bundle and target paths.');
}

const requestedBundle = valueAfter('--bundle');
const requestedTarget = valueAfter('--target-data-dir');
if (!requestedBundle) throw new Error('A verified data bundle is required. Use --bundle <path>.');
if (!requestedTarget) throw new Error('An explicit target DATA_DIR is required. Use --target-data-dir <path>.');

const result = await restoreDataBundle({
  bundleDir: path.resolve(requestedBundle),
  targetDataDir: path.resolve(requestedTarget),
  safetyOutputRoot: valueAfter('--safety-backup-root')
    ? path.resolve(valueAfter('--safety-backup-root'))
    : undefined,
});

console.log(JSON.stringify(result));
