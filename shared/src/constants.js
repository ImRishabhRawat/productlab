export const PRODUCT_STATUSES = ['idea', 'researching', 'ready_to_test', 'testing', 'iterating', 'scaling', 'paused', 'killed'];
export const IDEA_STATUSES = ['idea', 'researching', 'ready_to_test', 'killed', 'converted'];
export const EXPERIMENT_STATUSES = ['planned', 'running', 'completed', 'stopped'];
export const DECISIONS = ['continue', 'iterate', 'scale', 'pause', 'kill'];
export const ORDER_ITEM_KINDS = ['main', 'bump', 'upsell', 'bundle'];
export const PAYMENT_STATUSES = ['paid', 'pending', 'failed'];
export const REFUND_STATUSES = ['none', 'partial', 'full'];
export const CREATIVE_FORMATS = ['image', 'video', 'carousel', 'reel', 'story', 'ugc', 'other'];
export const GRANULARITIES = ['day', 'week', 'month'];
export const AI_KINDS = ['idea', 'experiment', 'product'];
export const IDEA_SIGNALS = ['demand', 'marketplace', 'social', 'search'];
export const LEVELS = ['low', 'medium', 'high'];
export const SMALL_SAMPLE_PURCHASES = 30;

export const DECISION_STATUS = {
  continue: 'testing',
  iterate: 'iterating',
  scale: 'scaling',
  pause: 'paused',
  kill: 'killed',
};

export const LABELS = {
  status: {
    idea: 'Idea',
    researching: 'Researching',
    ready_to_test: 'Ready to Test',
    testing: 'Testing',
    iterating: 'Iterating',
    scaling: 'Scaling',
    paused: 'Paused',
    killed: 'Killed',
    converted: 'Converted',
  },
  experimentStatus: { planned: 'Planned', running: 'Running', completed: 'Completed', stopped: 'Stopped' },
  decision: { continue: 'Continue Testing', iterate: 'Iterate', scale: 'Scale', pause: 'Pause', kill: 'Kill' },
  orderItemKind: { main: 'Main product', bump: 'Order bump', upsell: 'Upsell', bundle: 'Bundle' },
  paymentStatus: { paid: 'Paid', pending: 'Pending', failed: 'Failed' },
  refundStatus: { none: 'No refund', partial: 'Partial refund', full: 'Refunded' },
  creativeFormat: {
    image: 'Image',
    video: 'Video',
    carousel: 'Carousel',
    reel: 'Reel',
    story: 'Story',
    ugc: 'UGC',
    other: 'Other',
  },
  granularity: { day: 'Daily', week: 'Weekly', month: 'Monthly' },
  signal: {
    demand: 'Observed demand',
    marketplace: 'Marketplace evidence',
    social: 'Social engagement',
    search: 'Search interest',
  },
  level: { low: 'Low', medium: 'Medium', high: 'High' },
  aiKind: { idea: 'Idea', experiment: 'Experiment', product: 'Product' },
  variable: {
    price: 'Price',
    offer: 'Offer',
    audience: 'Audience',
    creative: 'Creative',
    angle: 'Ad angle',
    landingPage: 'Landing page',
    cta: 'CTA',
    dates: 'Dates',
    budget: 'Budget',
  },
};

export const EXPERIMENT_VARIABLES = ['price', 'offer', 'audience', 'creative', 'angle', 'landingPage', 'cta'].map((key) => ({
  key,
  label: LABELS.variable[key],
}));

export const METRIC_FIELDS = ['spend', 'impressions', 'reach', 'clicks', 'landingPageViews', 'checkouts', 'purchases', 'revenue'];
export const COST_FIELDS = ['fees', 'refunds', 'otherCosts'];

export const METRICS = {
  revenue: { label: 'Revenue', format: 'currency', better: 'up' },
  spend: { label: 'Ad spend', format: 'currency', better: null },
  contribution: { label: 'Profit contribution', format: 'currency', better: 'up' },
  contributionMargin: { label: 'Contribution margin', format: 'percent', better: 'up' },
  purchases: { label: 'Purchases', format: 'number', better: 'up' },
  cac: { label: 'CAC', format: 'currency', better: 'down' },
  conversionRate: { label: 'Conversion rate', format: 'percent', better: 'up' },
  aov: { label: 'AOV', format: 'currency', better: 'up' },
  roas: { label: 'ROAS', format: 'ratio', better: 'up' },
  ctr: { label: 'CTR', format: 'percent', better: 'up' },
  cpc: { label: 'CPC', format: 'currency', better: 'down' },
  cpm: { label: 'CPM', format: 'currency', better: 'down' },
  checkoutRate: { label: 'Checkout rate', format: 'percent', better: 'up' },
  impressions: { label: 'Impressions', format: 'number', better: 'up' },
  reach: { label: 'Reach', format: 'number', better: 'up' },
  clicks: { label: 'Clicks', format: 'number', better: 'up' },
  landingPageViews: { label: 'Landing page views', format: 'number', better: 'up' },
  checkouts: { label: 'Checkouts', format: 'number', better: 'up' },
  fees: { label: 'Payment fees', format: 'currency', better: 'down' },
  refunds: { label: 'Refunds', format: 'currency', better: 'down' },
  otherCosts: { label: 'Other variable costs', format: 'currency', better: 'down' },
  variableCosts: { label: 'Variable costs', format: 'currency', better: 'down' },
};

export const FUNNEL_STAGES = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'landingPageViews', label: 'Landing page views' },
  { key: 'checkouts', label: 'Checkouts' },
  { key: 'purchases', label: 'Purchases' },
];

export const RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom range' },
];

export const GOAL_LEVELS = ['monthly', 'yearly', 'long_term'];
export const GOAL_CATEGORIES = ['money', 'business', 'personal', 'fitness', 'learning', 'family', 'other'];
export const GOAL_STATUSES = ['active', 'achieved', 'paused', 'dropped'];
export const GOAL_TRACKING = ['manual', 'revenue', 'contribution', 'purchases', 'focus_hours'];
export const GOAL_PRODUCT_TRACKING = ['revenue', 'contribution', 'purchases'];
export const GOAL_MONEY_TRACKING = ['revenue', 'contribution'];
export const BLOCK_CATEGORIES = ['business', 'product', 'learning', 'fitness', 'personal', 'break', 'review', 'other'];
export const FOCUS_STATUSES = ['running', 'completed', 'cancelled'];
export const FOCUS_MAX_MINUTES = 240;
export const OUTCOME_MAX_TASKS = 10;
export const NOTIFICATION_CATEGORIES = ['schedule', 'outcome', 'focus', 'review', 'habit', 'business', 'system'];
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
export const LAST_WEEK_REVIEW_DAYS = [1, 2, 3];
export const PURCHASE_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
export const MIN_DATE = '2000-01-01';
export const MAX_SERIES_DAYS = 3660;

export const PRODUCTIVITY_LABELS = {
  goalLevel: { monthly: 'Monthly', yearly: 'Yearly', long_term: 'Long-term' },
  goalCategory: {
    money: 'Money',
    business: 'Business',
    personal: 'Personal',
    fitness: 'Fitness',
    learning: 'Learning',
    family: 'Family',
    other: 'Other',
  },
  goalStatus: { active: 'Active', achieved: 'Achieved', paused: 'Paused', dropped: 'Dropped' },
  goalTracking: { manual: 'Manual', revenue: 'Revenue', contribution: 'Contribution', purchases: 'Purchases', focus_hours: 'Focus hours' },
  goalTrackingHint: {
    manual: 'You enter the current value',
    revenue: 'Recorded revenue of linked products',
    contribution: 'Revenue after ad spend and costs',
    purchases: 'Purchases of linked products',
    focus_hours: 'Focus sessions logged on this goal',
  },
  blockCategory: {
    business: 'Business',
    product: 'Product',
    learning: 'Learning',
    fitness: 'Fitness',
    personal: 'Personal',
    break: 'Break',
    review: 'Review',
    other: 'Other',
  },
  notificationCategory: {
    schedule: 'Schedule',
    outcome: 'Daily outcome',
    focus: 'Focus',
    review: 'Review',
    habit: 'Habits',
    business: 'Business',
    system: 'System',
  },
  weekday: { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' },
};
