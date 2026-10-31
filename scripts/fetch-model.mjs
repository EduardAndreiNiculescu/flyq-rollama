// Downloads the RoLlama GGUF and verifies its size and SHA-256 before it is used.
//   MODEL_URL=https://... node scripts/fetch-model.mjs [destination-folder]
// The model is not stored in this repository (812 MB). MODEL_URL has no default: the project owners publish the file
// (for example as a release asset) and give you the link. The expected size and hash are the ones the app checks (src/llm/modelProvision.ts).
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';

const NAME = 'rollama-1b-dpo-q4.gguf';
const BYTES = 851469152;
const SHA256 = '54e17f65a03176a017167e04361d51e8b81d49ab1016f870370d691276e2e961';

const url = process.env.MODEL_URL;
if (!url) {
  console.error(`Set MODEL_URL to the link of ${NAME} (${(BYTES / 2 ** 20).toFixed(0)} MB) provided by the project owners.`);
  process.exit(2);
}
const dir = process.argv[2] ?? 'models';
mkdirSync(dir, { recursive: true });
const dest = join(dir, NAME);

const res = await fetch(url);
if (!res.ok || !res.body) {
  console.error(`download failed: HTTP ${res.status}`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));

const size = statSync(dest).size;
const hash = createHash('sha256');
await pipeline(createReadStream(dest), hash);
const got = hash.digest('hex');
if (size !== BYTES || got !== SHA256) {
  console.error(`REJECTED: size ${size} (expected ${BYTES}), sha256 ${got} (expected ${SHA256}). Delete ${dest} and try again.`);
  process.exit(1);
}
console.log(`OK ${dest}: ${size} bytes, sha256 verified.\nCopy it to the iPhone: scripts/mac/push-model.sh <UDID> ${dest}`);
