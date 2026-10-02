import { z } from 'zod';
import {
  AI_KINDS,
  BLOCK_CATEGORIES,
  CREATIVE_FORMATS,
  DECISIONS,
  EXPERIMENT_STATUSES,
  FOCUS_MAX_MINUTES,
  FOCUS_STATUSES,
  GOAL_CATEGORIES,
  GOAL_LEVELS,
  GOAL_PRODUCT_TRACKING,
  GOAL_STATUSES,
  GOAL_TRACKING,
  GRANULARITIES,
  IDEA_SIGNALS,
  IDEA_STATUSES,
  IMPORT_MODES,
  LEVELS,
  MAX_SERIES_DAYS,
  METRIC_FIELDS,
  METRIC_IMPORT_MAX_ROWS,
  NOTIFICATION_CATEGORIES,
  ORDER_IMPORT_MAX_ROWS,
  ORDER_ITEM_KINDS,
  OUTCOME_MAX_TASKS,
  PAYMENT_STATUSES,
  PRODUCT_STATUSES,
  REFUND_STATUSES,
} from './constants.js';
import { TIME_RE, blockSpan, daysBetween, isValidTimeZone } from './dates.js';

z.config({
  customError: (issue) => {
    if (issue.code === 'invalid_type') {
      if (issue.input === undefined || issue.input === null) return 'Required';
      if (issue.expected === 'int') return 'Enter a whole number';
      return issue.expected === 'number' ? 'Enter a number' : 'Invalid value';
    }
    if (issue.code === 'too_small' && issue.origin === 'number') return `Must be at least ${issue.minimum}`;
    if (issue.code === 'too_big' && issue.origin === 'number') return `Must be at most ${issue.maximum}`;
    if (issue.code === 'too_big' && issue.origin === 'string') return `Use at most ${issue.maximum} characters`;
    if (issue.code === 'invalid_value') return 'Choose a valid option';
    return undefined;
  },
});

const isLocale = (v) => {
  try {
    new Intl.NumberFormat(v);
    return true;
  } catch {
    return false;
  }
};

const text = (max) => z.string().trim().max(max);
const required = (max, label) => z.string().trim().min(1, `${label} is required`).max(max);

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const isoDate = z.iso.date('Use a YYYY-MM-DD date');
export const money = z.number().min(0).max(1e9);
export const pct = z.number().min(0).max(100);
export const count = z.number().int().min(0).max(1e12);
export const score = z.number().int().min(0).max(10);

const optScore = score.nullable().optional();
const optMoney = money.nullable().optional();

const signal = z.object({ score: optScore, note: text(1000).optional() });

export const validationSchema = z.object({
  competitors: z
    .array(z.object({ name: required(120, 'Name'), url: text(500).optional(), price: optMoney, notes: text(1000).optional() }))
    .max(50)
    .optional(),
  ads: z
    .array(z.object({ label: required(200, 'Label'), url: text(500).optional(), notes: text(1000).optional() }))
    .max(50)
    .optional(),
  priceExamples: z.array(z.object({ label: required(120, 'Label'), price: money })).max(50).optional(),
  signals: z.object(Object.fromEntries(IDEA_SIGNALS.map((k) => [k, signal.optional()]))).optional(),
  audience: text(2000).optional(),
  painDesire: text(2000).optional(),
  rightsNotes: text(2000).optional(),
});

export const ideaSchema = z.object({
  name: required(120, 'Name'),
  category: text(60).optional(),
  targetCustomer: text(300).optional(),
  problem: text(1000).optional(),
  format: text(120).optional(),
  deliverable: text(1000).optional(),
  expectedPrice: optMoney,
  effort: optScore,
  demonstrability: optScore,
  repeatPotential: optScore,
  legalRisk: optScore,
  source: text(300).optional(),
  notes: text(5000).optional(),
  status: z.enum(IDEA_STATUSES.filter((s) => s !== 'converted')).optional(),
  validation: validationSchema.optional(),
});
export const ideaUpdateSchema = ideaSchema.partial();

export const convertIdeaSchema = z.object({
  status: z.enum(['ready_to_test', 'testing']).optional(),
  price: money.optional(),
});

const costsSchema = z.object({ paymentFeePct: pct, refundRatePct: pct, variableCostPerSale: money }).partial();
const budgetSchema = z.object({ daily: optMoney, monthly: optMoney });

export const productSchema = z.object({
  name: required(120, 'Name'),
  category: text(60).optional(),
  description: text(2000).optional(),
  format: text(120).optional(),
  deliverable: text(1000).optional(),
  targetCustomer: text(300).optional(),
  price: money,
  status: z.enum(PRODUCT_STATUSES).optional(),
  version: text(20).optional(),
  costs: costsSchema.optional(),
  desiredMarginPct: pct.optional(),
  budget: budgetSchema.optional(),
  killReason: text(2000).optional(),
  learnings: text(5000).optional(),
  statusNote: text(500).optional(),
});
export const productUpdateSchema = productSchema.partial();

export const productEventSchema = z.object({
  date: isoDate,
  title: required(200, 'Title'),
  note: text(1000).optional(),
});

export const versionSchema = z.object({
  label: required(20, 'Version'),
  date: isoDate,
  price: optMoney,
  changes: text(2000).optional(),
  notes: text(2000).optional(),
});

const variablesSchema = z.object({
  price: optMoney,
  offer: text(300).optional(),
  audience: text(300).optional(),
  creative: text(300).optional(),
  angle: text(300).optional(),
  landingPage: text(300).optional(),
  cta: text(120).optional(),
});

export const experimentSchema = z.object({
  productId: objectId,
  name: required(120, 'Name'),
  hypothesis: text(2000).optional(),
  status: z.enum(EXPERIMENT_STATUSES).optional(),
  variables: variablesSchema.optional(),
  changeNote: text(1000).optional(),
  budget: optMoney,
  dailyBudget: optMoney,
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  campaign: text(200).optional(),
  notes: text(5000).optional(),
});
export const experimentUpdateSchema = experimentSchema.omit({ productId: true }).partial();

export const creativeSchema = z.object({
  experimentId: objectId,
  name: required(120, 'Name'),
  hook: text(500).optional(),
  format: z.enum(CREATIVE_FORMATS).optional(),
  angle: text(300).optional(),
  campaign: text(200).optional(),
  adSet: text(200).optional(),
  startDate: isoDate.nullable().optional(),
  url: text(500).optional(),
  notes: text(2000).optional(),
});
export const creativeUpdateSchema = creativeSchema.omit({ experimentId: true }).partial();

export const metricSchema = z.object({
  date: isoDate,
  productId: objectId.optional(),
  experimentId: objectId.nullable().optional(),
  creativeId: objectId.nullable().optional(),
  campaign: text(200).optional(),
  adSet: text(200).optional(),
  spend: money.optional(),
  impressions: count.optional(),
  reach: count.optional(),
  clicks: count.optional(),
  landingPageViews: count.optional(),
  checkouts: count.optional(),
  purchases: count.optional(),
  revenue: money.optional(),
  notes: text(1000).optional(),
});
export const metricImportRowSchema = metricSchema.omit({ productId: true, experimentId: true, creativeId: true });
export const metricUpdateSchema = metricImportRowSchema.partial();

const rowBatch = (max) => z.array(z.unknown()).min(1, 'Add at least one row').max(max, `Import at most ${max} rows at a time`);

export const metricImportSchema = z.object({
  productId: objectId,
  experimentId: objectId.nullable().optional(),
  mode: z.enum(IMPORT_MODES).default('replace'),
  columns: z.array(z.enum(METRIC_FIELDS)).min(1, 'Choose at least one metric').optional(),
  dryRun: z.boolean().optional(),
  rows: rowBatch(METRIC_IMPORT_MAX_ROWS),
});

export const customerSchema = z.object({
  name: text(120).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email').max(200)),
  phone: text(40).optional(),
  notes: text(2000).optional(),
});
export const customerUpdateSchema = customerSchema.partial();

const orderItemSchema = z.object({
  kind: z.enum(ORDER_ITEM_KINDS),
  name: text(200).optional(),
  amount: money,
});
const orderItems = (item) => z.array(item).min(1, 'Add at least one item').max(20);

export const orderSchema = z.object({
  productId: objectId,
  experimentId: objectId.nullable().optional(),
  customerId: objectId.optional(),
  customer: customerSchema.pick({ name: true, email: true }).optional(),
  items: orderItems(orderItemSchema),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  refundStatus: z.enum(REFUND_STATUSES).optional(),
  refundAmount: money.optional(),
  date: z.union([isoDate, z.iso.datetime({ offset: true })], { error: 'Use a YYYY-MM-DD date' }),
  campaign: text(200).optional(),
  notes: text(1000).optional(),
});
export const orderUpdateSchema = orderSchema.partial();

export const orderImportRowSchema = z.object({
  externalId: required(100, 'Order ID'),
  date: orderSchema.shape.date,
  ...customerSchema.pick({ email: true, name: true, phone: true }).shape,
  items: orderItems(orderItemSchema.extend({ name: required(200, 'Item name') })),
  paymentStatus: z.enum(PAYMENT_STATUSES),
  ...orderSchema.pick({ refundStatus: true, refundAmount: true, campaign: true, notes: true }).shape,
});

export const orderImportSchema = z.object({
  productId: objectId,
  dryRun: z.boolean().optional(),
  rows: rowBatch(ORDER_IMPORT_MAX_ROWS),
});

export const decisionSchema = z.object({
  productId: objectId,
  experimentId: objectId.nullable().optional(),
  decision: z.enum(DECISIONS),
  reason: required(2000, 'Reason'),
  notes: text(5000).optional(),
  date: isoDate,
  applyStatus: z.boolean().optional(),
});
export const decisionUpdateSchema = decisionSchema
  .pick({ reason: true, notes: true, date: true })
  .partial();

export const settingsSchema = z
  .object({
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
    locale: text(20).min(2).refine(isLocale, 'Unknown locale'),
    timezone: z.string().trim().refine(isValidTimeZone, 'Unknown timezone'),
    defaultPaymentFeePct: pct,
    defaultRefundRatePct: pct,
    defaultVariableCostPerSale: money,
    defaultDesiredMarginPct: pct,
  })
  .partial();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(200),
  password: z.string().min(1).max(200),
});

const AI_TARGET_REQUIRED = { idea: 'Choose an idea or describe one', experiment: 'Choose an experiment', product: 'Choose a product' };

export const aiAnalyzeSchema = z
  .object({
    kind: z.enum(AI_KINDS),
    targetId: objectId.optional(),
    prompt: text(4000).optional(),
  })
  .superRefine((body, ctx) => {
    if (!body.targetId && !(body.kind === 'idea' && body.prompt)) {
      ctx.addIssue({ code: 'custom', path: ['targetId'], message: AI_TARGET_REQUIRED[body.kind] });
    }
  });

const limit = z.coerce.number().int().min(1).max(500).optional();
const offset = z.coerce.number().int().min(0).optional();
const listBase = { q: text(200).optional(), sort: text(40).optional(), limit, offset };
const optId = objectId.optional();

export const rangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  granularity: z.enum(GRANULARITIES).optional(),
  productId: optId,
  experimentId: optId,
  creativeId: optId,
  campaign: text(200).optional(),
  status: text(40).optional(),
  ids: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(objectId).max(20))
    .optional(),
  limit,
});

export const ideaListQuery = z.object({
  ...listBase,
  status: z.enum(IDEA_STATUSES).optional(),
  category: text(60).optional(),
  potential: z.enum(LEVELS).optional(),
  difficulty: z.enum(LEVELS).optional(),
  risk: z.enum(LEVELS).optional(),
});

export const productListQuery = z.object({
  ...listBase,
  status: z.enum(PRODUCT_STATUSES).optional(),
  category: text(60).optional(),
});

export const experimentListQuery = z.object({
  ...listBase,
  productId: optId,
  status: z.enum(EXPERIMENT_STATUSES).optional(),
  campaign: text(200).optional(),
});

export const creativeListQuery = z.object({ ...listBase, productId: optId, experimentId: optId });

export const metricListQuery = z.object({
  ...listBase,
  productId: optId,
  experimentId: optId,
  creativeId: optId,
  campaign: text(200).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const customerListQuery = z.object({ ...listBase, productId: optId });

export const orderListQuery = z.object({
  ...listBase,
  productId: optId,
  experimentId: optId,
  customerId: optId,
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  refundStatus: z.enum(REFUND_STATUSES).optional(),
  kind: z.enum(ORDER_ITEM_KINDS).optional(),
  campaign: text(200).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const decisionListQuery = z.object({ productId: optId, experimentId: optId, limit });

export const aiListQuery = z.object({ kind: z.enum(AI_KINDS).optional(), targetId: optId, limit });

export function fieldErrors(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function parseRows(schema, rows) {
  const valid = [];
  const failed = [];
  for (const [row, value] of rows.entries()) {
    const result = schema.safeParse(value);
    if (result.success) {
      valid.push({ row, data: result.data });
      continue;
    }
    const fields = fieldErrors(result.error);
    const message = Object.entries(fields)
      .map(([key, error]) => (key === '_' ? error : `${key}: ${error}`))
      .join('; ');
    failed.push({ row, message, fields });
  }
  return { valid, failed };
}

const clock = z.string().regex(TIME_RE, 'Use a 24-hour HH:MM time');
const reminderMinutes = z.number().int().min(1).max(120);
const optRef = objectId.nullable().optional();

export const goalProductsError = (goal) =>
  GOAL_PRODUCT_TRACKING.includes(goal.tracking) && !goal.productIds?.length ? 'Link at least one product to track this' : null;

const goalBase = z.object({
  title: required(160, 'Title'),
  description: text(2000).optional(),
  level: z.enum(GOAL_LEVELS),
  category: z.enum(GOAL_CATEGORIES),
  tracking: z.enum(GOAL_TRACKING).optional(),
  targetValue: z.number().min(0).max(1e12).nullable().optional(),
  currentValue: z.number().min(-1e12).max(1e12).nullable().optional(),
  unit: text(20).optional(),
  startDate: isoDate.nullable().optional(),
  targetDate: isoDate.nullable().optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  notes: text(5000).optional(),
  productIds: z.array(objectId).max(20).optional(),
});
export const goalSchema = goalBase.superRefine((goal, ctx) => {
  const message = goalProductsError(goal);
  if (message) ctx.addIssue({ code: 'custom', path: ['productIds'], message });
});
export const goalUpdateSchema = goalBase.partial();

const timeBlockBase = z.object({
  name: required(80, 'Name'),
  start: clock,
  end: clock,
  days: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one day').max(7).optional(),
  category: z.enum(BLOCK_CATEGORIES).optional(),
  goalId: optRef,
  productId: optRef,
  enabled: z.boolean().optional(),
  reminders: z.object({ beforeStart: reminderMinutes.nullable(), atStart: z.boolean(), beforeEnd: reminderMinutes.nullable() }).partial().optional(),
});
export const beforeEndError = (block) =>
  block.reminders?.beforeEnd != null && block.reminders.beforeEnd >= blockSpan(block).minutes ? 'Must be shorter than the block' : null;
export const timeBlockSchema = timeBlockBase.superRefine((block, ctx) => {
  if (block.start === block.end) ctx.addIssue({ code: 'custom', path: ['end'], message: 'End must differ from start' });
  const message = beforeEndError(block);
  if (message) ctx.addIssue({ code: 'custom', path: ['reminders', 'beforeEnd'], message });
});
export const timeBlockUpdateSchema = timeBlockBase.partial();

export const dailyOutcomeSchema = z.object({
  title: text(200).optional(),
  done: z.boolean().optional(),
  goalId: optRef,
  productId: optRef,
  experimentId: optRef,
  tasks: z.array(z.object({ title: required(200, 'Task'), done: z.boolean().optional() })).max(OUTCOME_MAX_TASKS).optional(),
  completedBlocks: z.array(objectId).max(50).optional(),
});

export const focusStartSchema = z.object({
  label: text(120).optional(),
  category: z.enum(BLOCK_CATEGORIES).optional(),
  plannedMinutes: z.number().int().min(5, 'At least 5 minutes').max(FOCUS_MAX_MINUTES, 'At most 4 hours'),
  goalId: optRef,
  productId: optRef,
  experimentId: optRef,
});
export const focusUpdateSchema = z.object({
  status: z.enum(['completed', 'cancelled']).optional(),
  label: text(120).optional(),
  notes: text(1000).optional(),
  goalId: optRef,
  productId: optRef,
  experimentId: optRef,
});

export const habitSchema = z.object({
  name: required(60, 'Name'),
  targetPerWeek: z.number().int().min(1).max(7).optional(),
  archived: z.boolean().optional(),
  order: z.number().int().min(0).max(1000).optional(),
});
export const habitUpdateSchema = habitSchema.partial();

export const dailyReviewSchema = z.object({
  outcomeCompleted: z.boolean().nullable().optional(),
  accomplishment: text(500).optional(),
  lesson: text(500).optional(),
  blocker: text(500).optional(),
  tomorrowOutcome: text(200).optional(),
});

export const weeklyReviewSchema = z.object({
  wins: text(1000).optional(),
  lessons: text(1000).optional(),
  nextFocus: text(500).optional(),
});

const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'];
const isPushService = (url) => {
  const host = URL.canParse(url) ? new URL(url).hostname : '';
  return PUSH_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
};

export const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.url({ protocol: /^https$/ }).max(2048).refine(isPushService, 'Unsupported push service'),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: z.string().min(16).max(256), auth: z.string().min(8).max(64) }),
  }),
  label: text(120).optional(),
  sync: z.boolean().optional(),
});
export const pushEndpointSchema = z.object({ endpoint: z.string().min(1).max(2048) });

export const notificationPrefsSchema = z
  .object({
    enabled: z.boolean(),
    blockReminder: z.boolean(),
    blockStart: z.boolean(),
    blockEnd: z.boolean(),
    dailyOutcome: z.boolean(),
    dailyOutcomeTime: clock,
    dailyReview: z.boolean(),
    dailyReviewTime: clock,
    weeklyReview: z.boolean(),
    weeklyReviewDay: z.number().int().min(0).max(6),
    weeklyReviewTime: clock,
    habitReminders: z.boolean(),
    habitReminderTime: clock,
    focusEnd: z.boolean(),
    quietHours: z.boolean(),
    quietStart: clock,
    quietEnd: clock,
    business: z
      .object({
        newOrder: z.boolean(),
        refund: z.boolean(),
        conversionDrop: z.boolean(),
        experimentMilestone: z.boolean(),
        goalReached: z.boolean(),
        dailyRevenue: z.boolean(),
        dailyRevenueTime: clock,
        adSpendThreshold: z.boolean(),
      })
      .partial(),
  })
  .partial();

export const productivityRangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  granularity: z.enum(GRANULARITIES).optional(),
});
export const productivitySeriesQuery = productivityRangeQuery
  .extend({ goalId: objectId.optional(), productId: objectId.optional() })
  .superRefine(({ from, to }, ctx) => {
    if (!from || !to) return;
    if (from > to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'End date is before the start date' });
    else if (daysBetween(from, to) >= MAX_SERIES_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'Choose a range of at most 10 years' });
    }
  });
export const weekQuery = z.object({ start: isoDate.optional() });
export const goalListQuery = z.object({
  status: z.enum(GOAL_STATUSES).optional(),
  level: z.enum(GOAL_LEVELS).optional(),
  category: z.enum(GOAL_CATEGORIES).optional(),
});
const focusStatuses = z.string().refine((v) => v.split(',').every((s) => FOCUS_STATUSES.includes(s)), 'Choose a valid option');

export const focusListQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: focusStatuses.optional(),
  goalId: objectId.optional(),
  productId: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export const notificationListQuery = z.object({
  unread: z.stringbool().optional(),
  category: z.enum(NOTIFICATION_CATEGORIES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.iso.datetime({ offset: true }).optional(),
});
