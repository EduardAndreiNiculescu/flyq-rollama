/** Tiny JSON-schema subset validator for tool arguments (object of strings). No dependencies. */
export type ParamSchema = {
  type: 'object';
  properties: Record<string, { type: 'string'; description: string; maxLength?: number; pattern?: string; enum?: string[] }>;
  required?: string[];
  additionalProperties: false;
};

export type Validated = { ok: true; value: Record<string, string> } | { ok: false; error: string };

/** Parse a model-provided arguments string and validate it. Unknown keys are rejected, not ignored. */
export function validateArgs(schema: ParamSchema, raw: unknown): Validated {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 2000) return { ok: false, error: 'arguments too long' };
    try {
      obj = raw.trim() === '' ? {} : JSON.parse(raw);
    } catch {
      return { ok: false, error: 'arguments are not valid JSON' };
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'arguments must be an object' };
  const o = obj as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!Object.prototype.hasOwnProperty.call(schema.properties, k)) return { ok: false, error: `unknown argument "${k}"` };
  for (const k of schema.required ?? []) if (o[k] === undefined) return { ok: false, error: `missing argument "${k}"` };
  const out: Record<string, string> = {};
  for (const [k, spec] of Object.entries(schema.properties)) {
    const v = o[k];
    if (v === undefined) continue;
    if (typeof v !== 'string') return { ok: false, error: `argument "${k}" must be a string` };
    const t = v.trim();
    if (t.length === 0) return { ok: false, error: `argument "${k}" is empty` };
    if (spec.maxLength !== undefined && t.length > spec.maxLength) return { ok: false, error: `argument "${k}" too long` };
    if (spec.pattern && !new RegExp(spec.pattern, 'u').test(t)) return { ok: false, error: `argument "${k}" has an invalid format` };
    if (spec.enum && !spec.enum.includes(t)) return { ok: false, error: `argument "${k}" must be one of ${spec.enum.join(', ')}` };
    out[k] = t;
  }
  return { ok: true, value: out };
}
