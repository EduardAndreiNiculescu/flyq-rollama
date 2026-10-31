/** Tokens in a composed answer that are absent from the successful tool result. */
export function unsupportedFacts(answer: string, data: unknown): string[] {
  const source = JSON.stringify(data) ?? '';
  const numbers = new Set(source.match(/\d+/g) ?? []);
  const codes = new Set(source.match(/\b[A-Z]{1,5}\d{1,5}\b/g) ?? []);
  const missingNumbers = (answer.match(/\d+/g) ?? []).filter((n) => !numbers.has(n));
  const missingCodes = (answer.match(/\b[A-Z]{1,5}\d{1,5}\b/g) ?? []).filter((code) => !codes.has(code));
  return [...new Set([...missingNumbers, ...missingCodes])];
}
