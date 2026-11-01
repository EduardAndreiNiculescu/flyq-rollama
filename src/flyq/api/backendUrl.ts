import { type TurboModule, TurboModuleRegistry } from 'react-native';

import {
  BACKEND_PORT,
  BACKEND_URL_OVERRIDE,
  DEFAULT_BACKEND_URL,
} from '../config';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Host part of an http(s) URL, or null. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  const match = /^https?:\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(url.trim());
  return match ? match[1] : null;
}

/** Removes trailing slashes. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Decides the backend URL:
 * 1. an explicit override wins;
 * 2. if the JS bundle comes from Metro on another machine (a real iPhone on the Mac's Wi-Fi),
 *    the backend is on that same machine: http://<that host>:<port>;
 * 3. otherwise the fallback (localhost, which works in the simulator).
 */
export function deriveBackendUrl(options: {
  override: string | null;
  bundleUrl: string | null;
  port: number;
  fallback: string;
}): string {
  const { override, port, fallback } = options;
  if (override && override.trim().length > 0) {
    return normalizeBaseUrl(override);
  }
  const host = hostOf(options.bundleUrl);
  if (host && !LOOPBACK.has(host.toLowerCase())) {
    return `http://${host}:${port}`;
  }
  return normalizeBaseUrl(fallback);
}

interface SourceCodeSpec extends TurboModule {
  getConstants: () => { scriptURL: string };
}

/** URL the JS bundle was loaded from (Metro in debug), or null. */
export function currentBundleUrl(): string | null {
  try {
    const sourceCode = TurboModuleRegistry.get<SourceCodeSpec>('SourceCode');
    const url = sourceCode?.getConstants().scriptURL;
    return typeof url === 'string' && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

let cached: string | null = null;

export function backendBaseUrl(): string {
  if (cached === null) {
    cached = deriveBackendUrl({
      override: BACKEND_URL_OVERRIDE,
      bundleUrl: currentBundleUrl(),
      port: BACKEND_PORT,
      fallback: DEFAULT_BACKEND_URL,
    });
  }
  return cached;
}
