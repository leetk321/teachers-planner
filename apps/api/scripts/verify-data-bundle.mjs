import path from 'path';
import { valueAfter, verifyDataBundle } from './data-bundle-utils.mjs';

const positional = process.argv.slice(2).find((value, index, values) => {
  if (value.startsWith('--')) return false;
  return index === 0 || values[index - 1] !== '--bundle';
});
const requestedBundle = valueAfter('--bundle') || positional;
if (!requestedBundle) throw new Error('A data bundle path is required. Use --bundle <path>.');

const result = await verifyDataBundle(path.resolve(requestedBundle));
console.log(JSON.stringify({
  ok: true,
  bundle: result.bundle,
  manifestSha256: result.manifestSha256,
  files: result.files,
  bytes: result.bytes,
  database: result.database,
  assetRoots: result.assetRoots,
}));
