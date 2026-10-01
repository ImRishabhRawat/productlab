import { BLOCK_CATEGORIES, PRODUCTIVITY_LABELS, WEEKDAYS } from '@product-lab/shared/constants';
import { blockSpan, minutesToTime } from '@product-lab/shared/dates';
import { BLOCK_COLORS } from '../../components/charts/palette.js';
import { fmtDuration } from '../../lib/format.js';

const WEEK = 7 * 1440;

export const DAY_PRESETS = [
  { label: 'Every day', days: WEEKDAYS },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Weekends', days: [6, 0] },
];

export const dayLabel = (day) => PRODUCTIVITY_LABELS.weekday[day];
export const categoryLabel = (category) => PRODUCTIVITY_LABELS.blockCategory[category] ?? category;
export const blockColor = (category) => BLOCK_COLORS[category] ?? BLOCK_COLORS.other;
export const sortDays = (days) => WEEKDAYS.filter((d) => days.includes(d));
export const clockLabel = (minutes) => `${minutesToTime(minutes)}${minutes >= 1440 ? ' +1' : ''}`;

export function daysLabel(days) {
  const sorted = sortDays(days);
  const preset = DAY_PRESETS.find((p) => p.days.join() === sorted.join());
  if (preset) return preset.label;
  const runs = [];
  for (const d of sorted) {
    const run = runs.at(-1);
    if (run && WEEKDAYS.indexOf(d) === WEEKDAYS.indexOf(run.at(-1)) + 1) run.push(d);
    else runs.push([d]);
  }
  return runs.map((run) => (run.length >= 3 ? `${dayLabel(run[0])}–${dayLabel(run.at(-1))}` : run.map(dayLabel).join(', '))).join(', ');
}

export function spanLabel(block) {
  const { to, minutes } = blockSpan(block);
  return `${fmtDuration(minutes)}${to > 1440 ? ' · ends next day' : ''}`;
}

export const blockTitle = (b) => `${b.name} · ${b.start}–${b.end} · ${spanLabel(b)} · ${categoryLabel(b.category)}`;

const REMINDERS = [
  { key: 'beforeStart', setting: 'blockReminder', name: 'Reminder before a block', label: (m) => `${m} min before` },
  { key: 'atStart', setting: 'blockStart', name: 'Block start', label: () => 'at start' },
  { key: 'beforeEnd', setting: 'blockEnd', name: 'Block ending', label: (m) => `${m} min before end` },
];

export const remindersOff = (prefs) => (prefs ? REMINDERS.filter((r) => !prefs.enabled || prefs[r.setting] === false) : []);

export function reminderLabel(reminders = {}, off = []) {
  const set = REMINDERS.filter((r) => reminders[r.key]);
  const live = set.some((r) => !off.includes(r));
  const parts = set.map((r) => `${r.label(reminders[r.key])}${live && off.includes(r) ? ' (off in settings)' : ''}`);
  return { parts: set.length && !live ? [...parts, 'off in settings'] : parts, live };
}

function weekSpans(block) {
  const { from, to } = blockSpan(block);
  return block.days.map((d) => [d * 1440 + from, d * 1440 + to]);
}

export function overlapping(block, others) {
  const mine = weekSpans(block);
  return others.filter((other) =>
    weekSpans(other).some(([s2, e2]) => mine.some(([s1, e1]) => [-WEEK, 0, WEEK].some((k) => s1 < e2 + k && s2 + k < e1))),
  );
}

function layoutDay(blocks) {
  const items = blocks.map((block) => ({ block, ...blockSpan(block) })).sort((a, b) => a.from - b.from || b.to - a.to);
  const groups = [];
  for (const item of items) {
    let group = groups.at(-1);
    if (!group || item.from >= group.end) groups.push((group = { start: item.from, end: 0, lanes: [], items: [] }));
    const free = group.lanes.findIndex((end) => end <= item.from);
    item.lane = free === -1 ? group.lanes.length : free;
    group.lanes[item.lane] = item.to;
    group.end = Math.max(group.end, item.to);
    group.items.push(item);
  }
  return groups;
}

export function planWeek(blocks) {
  return WEEKDAYS.map((day) => {
    const groups = layoutDay(blocks.filter((b) => b.days.includes(day)));
    const items = groups.flatMap((g) => g.items.map((item) => ({ ...item, lanes: g.lanes.length })));
    return {
      day,
      label: dayLabel(day),
      items,
      count: items.length,
      minutes: groups.reduce((sum, g) => sum + g.end - g.start, 0),
      first: groups.length ? clockLabel(groups[0].start) : null,
      last: groups.length ? clockLabel(groups.at(-1).end) : null,
    };
  });
}

export function categoryLegend(blocks) {
  const items = [];
  for (const category of BLOCK_CATEGORIES.filter((c) => blocks.some((b) => b.category === c))) {
    const color = blockColor(category);
    const same = items.find((i) => i.color === color);
    if (same) same.label += `, ${categoryLabel(category)}`;
    else items.push({ key: category, label: categoryLabel(category), color });
  }
  return items;
}
