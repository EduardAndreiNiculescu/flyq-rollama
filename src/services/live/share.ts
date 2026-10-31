import * as SecureStore from 'expo-secure-store';
import type { FlightRecord } from '../../core/types';
import { FLYQ_BASE, flyqToken } from './gatewayClient';

/**
 * "Send to family": a link to a web page that shows the FLIGHT (aircraft position, status, gate, estimated landing) and nothing about the passenger.
 * The server (FlyQ-backend, see docs/SHARE_FLIGHT.md) creates an unguessable token with an expiry; the page reads it without any login.
 * Nothing is created unless the passenger taps the share button and confirms.
 */
const KEY = 'flyq.share';

export type ShareState = { shareId: string; url: string; expiresAt: string };
export type ShareResult = { ok: true; share: ShareState } | { ok: false; message: string };

const localDate = (iso: string) => iso.slice(0, 10);

export async function activeShare(): Promise<ShareState | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ShareState;
    return Date.parse(s.expiresAt) > Date.now() ? s : null;
  } catch {
    return null;
  }
}

async function authed(path: string, init: RequestInit): Promise<Response> {
  const call = async (force: boolean) => fetch(`${FLYQ_BASE}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}), authorization: `Bearer ${await flyqToken(force)}` } });
  const res = await call(false);
  return res.status === 401 ? call(true) : res;
}

export async function createShare(record: FlightRecord): Promise<ShareResult> {
  try {
    const res = await authed('/v1/shares', { method: 'POST', body: JSON.stringify({ flightNumber: record.flightNumber, date: localDate(record.scheduledDeparture) }) });
    if (res.status === 404 || res.status === 405) return { ok: false, message: 'Serverul FlyQ nu are încă partajarea de zbor (ruta /v1/shares lipsește).' };
    if (res.status === 401 || res.status === 403) return { ok: false, message: `Serverul a răspuns ${res.status} chiar și cu o sesiune nouă: ruta /v1/shares nu există încă pe server (o rută necunoscută primește 401) sau cheia FlyQ nu e validă. Verifică cu „Testează cheia FlyQ” din Mod test.` };
    if (!res.ok) return { ok: false, message: `Serverul a răspuns ${res.status}.` };
    const j = (await res.json()) as { shareId?: unknown; url?: unknown; expiresAt?: unknown };
    if (typeof j.shareId !== 'string' || typeof j.url !== 'string' || typeof j.expiresAt !== 'string' || !/^https:\/\//.test(j.url)) return { ok: false, message: 'Răspuns neașteptat de la server.' };
    const share = { shareId: j.shareId, url: j.url, expiresAt: j.expiresAt };
    await SecureStore.setItemAsync(KEY, JSON.stringify(share));
    return { ok: true, share };
  } catch {
    return { ok: false, message: 'Nu pot contacta serverul (cheie FlyQ lipsă sau fără rețea).' };
  }
}

/** Stops sharing: the link stops working at once. The local copy is removed even if the server is unreachable, so the button does not stay stuck. */
export async function stopShare(): Promise<string> {
  const share = await activeShare();
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
  if (!share) return 'Nu era nicio partajare activă.';
  try {
    const res = await authed(`/v1/shares/${encodeURIComponent(share.shareId)}`, { method: 'DELETE' });
    return res.ok || res.status === 404 ? 'Partajarea a fost oprită: linkul nu mai funcționează.' : `Serverul a răspuns ${res.status}; linkul expiră singur.`;
  } catch {
    return 'Nu am putut contacta serverul; linkul expiră singur.';
  }
}
