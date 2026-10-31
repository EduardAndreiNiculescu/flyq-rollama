/**
 * Qwen3 chat prompt, rendered exactly like the official HF template with enable_thinking=False,
 * so a raw-prompt backend (Ollama /api/generate with raw:true) behaves like the HF server and like
 * llama.rn on the phone (jinja + enable_thinking:false). Verified against golden strings produced by
 * the real tokenizer: tests/qwen-template.test.ts + tests/fixtures/qwen3-template-golden.json.
 */
export type TplMessage = {
  role: string;
  content?: string | null;
  tool_calls?: { id?: string; type?: string; function: { name: string; arguments: unknown } }[];
  tool_call_id?: string;
};

/** json.dumps(x, ensure_ascii=False) formatting: ", " and ": " separators, insertion order kept. */
export function pyJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(pyJson).join(', ')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${JSON.stringify(k)}: ${pyJson(x)}`).join(', ')}}`;
  }
  return JSON.stringify(v);
}

const TOOLS_HEADER =
  '\n\n# Tools\n\nYou may call one or more functions to assist with the user query.\n\nYou are provided with function signatures within <tools></tools> XML tags:\n<tools>';
const TOOLS_FOOTER =
  '\n</tools>\n\nFor each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:\n<tool_call>\n{"name": <function-name>, "arguments": <args-json-object>}\n</tool_call>';

const stripThink = (s: string) => s.replace(/^[\s\S]*<\/think>\n*/, '').replace(/^\n+/, '');

export function renderQwen3(messages: TplMessage[], tools?: unknown[]): string {
  let out = '';
  const hasTools = !!tools?.length;
  if (hasTools) {
    out += '<|im_start|>system\n';
    if (messages[0]?.role === 'system') out += String(messages[0].content ?? '');
    out += TOOLS_HEADER + (tools as unknown[]).map((t) => `\n${pyJson(t)}`).join('') + TOOLS_FOOTER + '<|im_end|>\n';
  } else if (messages[0]?.role === 'system') {
    out += `<|im_start|>system\n${String(messages[0].content ?? '')}<|im_end|>\n`;
  }
  messages.forEach((m, i) => {
    const content = String(m.content ?? '');
    if (m.role === 'system' && i === 0) return;
    if (m.role === 'user' || m.role === 'system') {
      out += `<|im_start|>${m.role === 'system' ? 'system' : 'user'}\n${content}<|im_end|>\n`;
    } else if (m.role === 'assistant') {
      out += `<|im_start|>assistant\n${content.includes('</think>') ? stripThink(content) : content}`;
      (m.tool_calls ?? []).forEach((c, j) => {
        if ((j === 0 && content) || j > 0) out += '\n';
        const args = c.function.arguments;
        out += `<tool_call>\n{"name": ${JSON.stringify(c.function.name)}, "arguments": ${typeof args === 'string' ? args : pyJson(args)}}\n</tool_call>`;
      });
      out += '<|im_end|>\n';
    } else if (m.role === 'tool') {
      if (messages[i - 1]?.role !== 'tool') out += '<|im_start|>user';
      out += `\n<tool_response>\n${content}\n</tool_response>`;
      if (messages[i + 1]?.role !== 'tool') out += '<|im_end|>\n';
    }
  });
  return out + '<|im_start|>assistant\n<think>\n\n</think>\n\n';
}

export type ParsedCall = { name: string; arguments: string };

/** Split generated text into plain content and tool calls (malformed blocks are ignored). */
export function parseToolCalls(text: string): { content: string; toolCalls: ParsedCall[] } {
  const calls: ParsedCall[] = [];
  const re = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  for (const m of text.matchAll(re)) {
    try {
      const o = JSON.parse(m[1]) as { name?: unknown; arguments?: unknown };
      if (typeof o.name !== 'string') continue;
      const a = o.arguments ?? {};
      calls.push({ name: o.name, arguments: typeof a === 'string' ? a : JSON.stringify(a) });
    } catch {
      /* malformed block: skip */
    }
  }
  const content = text.replace(re, '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { content, toolCalls: calls };
}
