import { Directory, File, Paths } from 'expo-file-system';
import { loadLlamaModelInfo } from 'llama.rn';
import type { ModelTier } from '../store/live';

export interface ModelSpec {
  tier: Exclude<ModelTier, 'no-ai'>;
  name: string;
  /** Undefined means the artifact is private/local and must be copied manually. */
  url?: string;
  bytes: number;
  label: string;
  sha256?: string;
}

/** RoLlama 3.2 1B + SFT + DPO, Q4_0 GGUF. Private artifact: transferred by hand (scripts/mac/push-model.sh), never downloaded or bundled. */
export const MODEL_SPECS: Record<Exclude<ModelTier, 'no-ai'>, ModelSpec> = {
  rollama: {
    tier: 'rollama',
    name: 'rollama-1b-dpo-q4.gguf',
    bytes: 851469152,
    sha256: 'a7689c17e6d249be241d14969e7bcc2b82863a9d1000f98edc898cfbdf66e9d7', // repaired file (scripts/fix_gguf_rollama.py): F32 norms, RoPE settings, permuted Q/K
    label: 'RoLlama 1B (router, transfer manual, ~812 MB)',
  },
};

export const MODEL = MODEL_SPECS.rollama;

export function specForTier(tier: ModelTier = 'rollama'): ModelSpec | null {
  if (tier === 'no-ai') return null;
  return MODEL_SPECS[tier] ?? MODEL_SPECS.rollama;
}

const dir = () => new Directory(Paths.document, 'models');
const file = (name: string = MODEL.name) => new File(dir(), name);

export type ModelStatus = { state: 'missing' } | { state: 'manual'; reason: string } | { state: 'ready'; path: string } | { state: 'corrupt'; reason: string };

/** Offline-safe check: the size must match exactly and llama.cpp must parse the GGUF header. */
export async function checkModel(tier: ModelTier = 'rollama'): Promise<ModelStatus> {
  const spec = specForTier(tier);
  if (!spec) return { state: 'ready', path: '' };
  const f = file(spec.name);
  // The model is copied into Documents/models by scripts/mac/push-model.sh (see bundledUri).
  const uri = f.exists ? f.uri : await bundledUri();
  if (!uri) return spec.url ? { state: 'missing' } : { state: 'manual', reason: 'The model is not bundled in this build; copy the verified RoLlama GGUF into Documents/models (scripts/mac/push-model.sh).' };
  const size = new File(uri).size;
  if (size !== spec.bytes) return { state: 'corrupt', reason: `unexpected size ${size} (expected ${spec.bytes}): the file is incomplete` };
  try {
    await loadLlamaModelInfo(uri);
  } catch (e) {
    return { state: 'corrupt', reason: `GGUF header unreadable: ${String(e)}` };
  }
  return { state: 'ready', path: uri };
}

/**
 * Not bundled: Metro cannot pack an 812 MB asset into the JS bundle ("Cannot create a string longer than 0x1fffffe8 characters").
 * The Mac build copies the model into Documents/models with scripts/mac/push-model.sh after installing the app.
 */
async function bundledUri(): Promise<string | null> {
  return null;
}

/** There is nothing to download: RoLlama is transferred by hand. Kept so the test screen has one call for "prepare the model". */
export async function provisionModel(tier: ModelTier = 'rollama'): Promise<ModelStatus> {
  return checkModel(tier);
}

export function deleteModel(tier: ModelTier = 'rollama') {
  const spec = specForTier(tier);
  if (!spec) return;
  const f = file(spec.name);
  if (f.exists) f.delete();
}
