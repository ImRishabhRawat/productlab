import webpush from 'web-push';
import { config } from '../config.js';
import PushSubscription from '../models/PushSubscription.js';

const MAX_FAILURES = 5;
const STALE_MS = 3 * 86_400_000;
const MAX_DEVICES = 20;
const TIMEOUT = 10_000;
let vapid = { key: '', ok: false };

const BROWSERS = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/Firefox\/|FxiOS/, 'Firefox'],
  [/Chrome\/|CriOS/, 'Chrome'],
  [/Safari\/|iPhone|iPad/, 'Safari'],
];
const SYSTEMS = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X/, 'Mac'],
  [/Linux/, 'Linux'],
];
const match = (list, ua) => list.find(([re]) => re.test(ua))?.[1];

export function deviceLabel(ua = '') {
  const browser = match(BROWSERS, ua) ?? 'Browser';
  const os = match(SYSTEMS, ua);
  return os ? `${browser} on ${os}` : browser;
}

export function pushConfigured() {
  const { subject, publicKey, privateKey } = config.vapid;
  if (!subject || !publicKey || !privateKey) return false;
  const key = `${subject} ${publicKey} ${privateKey}`;
  if (vapid.key !== key) {
    vapid = { key, ok: true };
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } catch (err) {
      vapid.ok = false;
      console.error(`Push notifications are off: invalid VAPID keys (${err.message})`);
    }
  }
  return vapid.ok;
}

export async function capDevices(owner, keepId) {
  const extra = await PushSubscription.find({ owner, active: true, _id: { $ne: keepId } })
    .sort({ lastSeenAt: -1, _id: -1 })
    .skip(MAX_DEVICES - 1)
    .select('_id')
    .lean();
  if (extra.length) await PushSubscription.updateMany({ _id: { $in: extra.map((d) => d._id) } }, { $set: { active: false } });
}

export async function sendPush(owner, payload, { urgency = 'normal', ttl = 4 * 3600 } = {}) {
  if (!pushConfigured()) return { sent: 0, failed: 0, skipped: 'not_configured' };
  const subscriptions = await PushSubscription.find({ owner, active: true }).lean();
  if (!subscriptions.length) return { sent: 0, failed: 0, skipped: 'no_devices' };
  const body = JSON.stringify(payload);
  const results = await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: ttl, urgency, timeout: TIMEOUT });
        await PushSubscription.updateOne({ _id: s._id }, { $set: { lastSuccessAt: new Date(), failures: 0 } });
        return true;
      } catch (err) {
        const stale = s.failures + 1 >= MAX_FAILURES && (s.lastSuccessAt ?? s.createdAt) < Date.now() - STALE_MS;
        const gone = err.statusCode === 404 || err.statusCode === 410 || stale;
        await PushSubscription.updateOne({ _id: s._id }, { $inc: { failures: 1 }, ...(gone && { $set: { active: false } }) });
        return false;
      }
    }),
  );
  const sent = results.filter(Boolean).length;
  return { sent, failed: results.length - sent, skipped: '' };
}
