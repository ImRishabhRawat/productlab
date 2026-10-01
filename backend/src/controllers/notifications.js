import Notification from '../models/Notification.js';
import NotificationPreference from '../models/NotificationPreference.js';
import PushSubscription from '../models/PushSubscription.js';
import { notify, preferences, unreadCount } from '../services/notify.js';
import { capDevices, deviceLabel, pushConfigured } from '../services/push.js';
import { config } from '../config.js';
import { HttpError, notFound } from '../utils/http.js';

const kept = (req) => ({ _id: req.params.id, owner: req.user.email, deletedAt: null });

export async function list(req, res) {
  const { unread, category, limit = 30, before } = req.filters;
  const filter = { owner: req.user.email, deletedAt: null };
  if (unread) filter.readAt = null;
  if (category) filter.category = category;
  if (before) filter.createdAt = { $lt: new Date(before) };
  const [items, count] = await Promise.all([
    Notification.find(filter).select('-owner -dedupeKey -deletedAt').sort({ createdAt: -1 }).limit(limit).lean(),
    unreadCount(req.user.email),
  ]);
  res.json({ items, unread: count });
}

export async function unread(req, res) {
  res.json({ unread: await unreadCount(req.user.email) });
}

export async function markRead(req, res) {
  const result = await Notification.updateOne({ ...kept(req), readAt: null }, { $set: { readAt: new Date() } });
  if (!result.matchedCount && !(await Notification.exists(kept(req)))) throw notFound('Notification');
  res.json({ unread: await unreadCount(req.user.email) });
}

export async function markAllRead(req, res) {
  await Notification.updateMany({ owner: req.user.email, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ unread: 0 });
}

export async function remove(req, res) {
  const now = new Date();
  const result = await Notification.updateOne(kept(req), { $set: { deletedAt: now, readAt: now } });
  if (!result.matchedCount) throw notFound('Notification');
  res.status(204).end();
}

export async function getPreferences(req, res) {
  res.json(await preferences(req.user.email));
}

export async function updatePreferences(req, res) {
  const { business, ...rest } = req.body;
  const set = { ...rest };
  for (const [k, v] of Object.entries(business ?? {})) set[`business.${k}`] = v;
  const prefs = await NotificationPreference.findOneAndUpdate(
    { owner: req.user.email },
    { $set: set, $setOnInsert: { owner: req.user.email } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  res.json(prefs);
}

export function pushKey(req, res) {
  res.json({ configured: pushConfigured(), publicKey: pushConfigured() ? config.vapid.publicKey : null });
}

export async function subscribe(req, res) {
  const { subscription, label, sync } = req.body;
  const device = await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint, ...(sync && { removedAt: null }) },
    {
      $set: {
        owner: req.user.email,
        keys: subscription.keys,
        label: label || deviceLabel(req.get('user-agent')),
        userAgent: (req.get('user-agent') ?? '').slice(0, 300),
        active: true,
        failures: 0,
        lastSeenAt: new Date(),
        removedAt: null,
      },
    },
    { upsert: !sync, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  if (!device) throw new HttpError(410, 'This device is no longer registered. Enable notifications on it to add it again.');
  await capDevices(req.user.email, device._id);
  res.status(sync ? 200 : 201).json({ _id: device._id, active: device.active });
}

export async function unsubscribe(req, res) {
  await PushSubscription.deleteOne({ endpoint: req.body.endpoint, owner: req.user.email });
  res.status(204).end();
}

export async function devices(req, res) {
  const items = await PushSubscription.find({ owner: req.user.email, removedAt: null })
    .select('endpoint label userAgent active lastSeenAt lastSuccessAt failures createdAt')
    .sort({ lastSeenAt: -1 })
    .lean();
  res.json({ items, configured: pushConfigured() });
}

export async function removeDevice(req, res) {
  const result = await PushSubscription.updateOne(
    { _id: req.params.id, owner: req.user.email, removedAt: null },
    { $set: { active: false, removedAt: new Date() } },
  );
  if (!result.matchedCount) throw notFound('Device');
  res.status(204).end();
}

export async function test(req, res) {
  const sent = await notify({
    category: 'system',
    type: 'test',
    title: 'Product Lab notifications are on',
    body: 'You will only get the reminders and alerts you switch on.',
    url: '/settings',
  });
  res.json({ pushed: sent?.pushed ?? { sent: 0, failed: 0, skipped: 'disabled' } });
}
