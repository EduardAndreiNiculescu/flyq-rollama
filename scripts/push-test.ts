/**
 * Sends one test notification to this phone through the FlyQ server's admin route.
 *   FLYQ_ADMIN_TOKEN=... DEVICE_TOKEN=<APNs token shown in the app's Test mode> npx tsx scripts/push-test.ts "Title" "Body"
 * The admin token and the device token come from the environment only: they are never read from a file, printed or committed.
 * The server must have PUSH_ENABLED=true and the APNs key configured (otherwise it answers FEATURE_DISABLED).
 */
const base = process.env.FLYQ_BASE ?? 'https://flyq-cra.duckdns.org';
const admin = process.env.FLYQ_ADMIN_TOKEN;
const deviceToken = process.env.DEVICE_TOKEN;
const [title = 'FlyQ', body = 'Test notification'] = process.argv.slice(2);
if (!admin || !deviceToken) {
  console.error('set FLYQ_ADMIN_TOKEN and DEVICE_TOKEN in the environment');
  process.exit(1);
}
const res = await fetch(`${base}/v1/admin/push/test`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${admin}` },
  body: JSON.stringify({ deviceToken, environment: process.env.PUSH_ENV === 'production' ? 'production' : 'sandbox', title, body }),
});
const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
console.log(JSON.stringify({ http: res.status, outcome: j.outcome, status: j.status, reason: j.reason, error: j.error }));
process.exit(res.ok ? 0 : 1);
