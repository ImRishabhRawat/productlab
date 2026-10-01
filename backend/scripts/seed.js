import mongoose from 'mongoose';
import { DECISION_STATUS, LABELS, PURCHASE_MILESTONES } from '@product-lab/shared/constants';
import {
  addDays,
  addMonths,
  bucketStart,
  daysBetween,
  minutesToTime,
  startOfDayIn,
  timeToMinutes,
  todayIn,
  toUTCDate,
  weekdayOf,
} from '@product-lab/shared/dates';
import { countsTowardProgress, deriveMetrics, round, sumTotals, variableCosts } from '@product-lab/shared/metrics';
import { config } from '../src/config.js';
import { connectDb } from '../src/db.js';
import AdCreative from '../src/models/AdCreative.js';
import AIAnalysis from '../src/models/AIAnalysis.js';
import CampaignMetric from '../src/models/CampaignMetric.js';
import Customer from '../src/models/Customer.js';
import DailyOutcome from '../src/models/DailyOutcome.js';
import DailyReview from '../src/models/DailyReview.js';
import Decision from '../src/models/Decision.js';
import Experiment from '../src/models/Experiment.js';
import FocusSession from '../src/models/FocusSession.js';
import Goal from '../src/models/Goal.js';
import Habit from '../src/models/Habit.js';
import HabitCompletion from '../src/models/HabitCompletion.js';
import Notification from '../src/models/Notification.js';
import NotificationPreference from '../src/models/NotificationPreference.js';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import ProductIdea from '../src/models/ProductIdea.js';
import ProductVersion from '../src/models/ProductVersion.js';
import Setting from '../src/models/Setting.js';
import TimeBlock from '../src/models/TimeBlock.js';
import WeeklyReview from '../src/models/WeeklyReview.js';

const MODELS = [
  AdCreative,
  AIAnalysis,
  CampaignMetric,
  Customer,
  DailyOutcome,
  DailyReview,
  Decision,
  Experiment,
  FocusSession,
  Goal,
  Habit,
  HabitCompletion,
  Notification,
  NotificationPreference,
  Order,
  Product,
  ProductIdea,
  ProductVersion,
  Setting,
  TimeBlock,
  WeeklyReview,
];
const TZ = 'Asia/Kolkata';

let seed = 20260929;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + (b - a) * rand();
const chance = (p) => rand() < p;
const pick = (list) => list[Math.floor(rand() * list.length)];
function poisson(lambda) {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rand();
  } while (p > limit);
  return k - 1;
}
const oid = () => new mongoose.Types.ObjectId();

const today = todayIn(TZ);
const day = (offset) => addDays(today, offset);
const at = (offset, hour = 10) => new Date(startOfDayIn(day(offset), TZ).getTime() + hour * 3_600_000);

const PRODUCTS = [
  {
    name: 'AI Kids Videos',
    category: 'Parenting',
    format: 'Video pack',
    deliverable: '100 ready-to-post animated kids videos with captions',
    targetCustomer: 'Parents and kids-content creators',
    description: 'Ready-to-post AI animated videos for kids channels and reels.',
    price: 199,
    created: -88,
    costs: { paymentFeePct: 2.5, refundRatePct: 2, variableCostPerSale: 0 },
    budget: { daily: 2000, monthly: 60000 },
    idea: {
      created: -95,
      research: -93,
      expectedPrice: 99,
      effort: 3,
      demonstrability: 9,
      repeatPotential: 6,
      legalRisk: 3,
      source: 'Instagram Reels trend',
      signals: { demand: 8, marketplace: 7, social: 8, search: 6 },
      competitors: [
        { name: 'KidsReel Pack', price: 299, notes: '50 videos, no captions' },
        { name: 'Toddler Toons Bundle', price: 499, notes: 'Strong ads, weak landing page' },
      ],
      ads: [{ label: 'Faceless kids channel ads on Meta', notes: 'Running 60+ days' }],
      priceExamples: [
        { label: 'KidsReel Pack', price: 299 },
        { label: 'Etsy video bundles', price: 350 },
      ],
      audience: 'Parents who run kids channels and mom creators.',
      painDesire: 'Wants consistent kids content without editing skills.',
      rightsNotes: 'Generate originals only; no licensed characters.',
    },
    offers: {
      bump: { name: 'Coloring pages pack', amount: 49, rate: 0.28 },
      upsell: { name: 'Bedtime stories bundle', amount: 149, rate: 0.14, from: -35 },
      bundle: { name: 'Complete creator kit', amount: 349, rate: 0.06, from: -35 },
    },
    versions: [
      { label: 'v1', offset: -86, price: 99, changes: '30 videos, basic thumbnails' },
      { label: 'v2', offset: -58, price: 199, changes: '100 videos, HD exports, captions' },
    ],
    milestones: [
      { offset: -87, title: 'MVP completed' },
      { offset: -35, title: 'Upsell added', note: 'Bedtime stories bundle at ₹149' },
    ],
    experiments: [
      {
        name: 'Price Test #1',
        start: -84,
        end: -70,
        daily: 800,
        variables: { price: 99, offer: '30 videos pack', audience: 'Broad', creative: 'Ready-to-post angle', angle: 'Save hours of editing', landingPage: 'LP v1', cta: 'Buy now' },
        hypothesis: 'A low ₹99 price maximises first purchases.',
        campaign: 'KV | Price test',
        quality: { ctr: 0.019, lpv: 0.78, checkout: 0.14, purchase: 0.46 },
        creatives: [
          { name: 'Creative A · Montage', hook: 'Your kids channel, on autopilot', format: 'reel', angle: 'Time saving', ctr: 1 },
          { name: 'Creative B · Before/after', hook: 'From blank channel to 30 videos', format: 'video', angle: 'Transformation', ctr: 0.82 },
        ],
      },
      {
        name: 'Price Test #2',
        start: -58,
        end: -44,
        daily: 900,
        variables: { price: 199, offer: '100 videos pack', audience: 'Broad', creative: '100 videos angle', angle: 'Volume value', landingPage: 'LP v2', cta: 'Get all 100' },
        hypothesis: 'A bigger offer at ₹199 keeps conversion while doubling AOV.',
        changeNote: 'Price ₹99 → ₹199 with the 100-video offer',
        campaign: 'KV | Price test',
        quality: { ctr: 0.02, lpv: 0.8, checkout: 0.13, purchase: 0.45 },
        creatives: [
          { name: 'Creative C · 100 videos scroll', hook: '100 videos for less than one coffee a week', format: 'reel', angle: 'Volume value', ctr: 1 },
          { name: 'Creative D · Price anchor', hook: 'Agencies charge ₹5,000 for this', format: 'image', angle: 'Price anchor', ctr: 0.9 },
        ],
      },
      {
        name: 'Creative Test · UGC hooks',
        start: -40,
        end: -21,
        daily: 1100,
        variables: { price: 199, offer: '100 videos pack', audience: 'Parents 25-40', creative: 'UGC mom testimonial', angle: 'Social proof', landingPage: 'LP v2', cta: 'Get all 100' },
        hypothesis: 'UGC hooks lift CTR enough to lower CAC.',
        changeNote: 'UGC creatives and parent-interest audience',
        campaign: 'KV | Creative test',
        quality: { ctr: 0.026, lpv: 0.81, checkout: 0.13, purchase: 0.45 },
        creatives: [
          { name: 'Creative E · Mom UGC', hook: 'I posted 30 days straight without editing', format: 'ugc', angle: 'Social proof', ctr: 1.1 },
          { name: 'Creative F · Kid reaction', hook: 'My son asked for "the dinosaur one" again', format: 'ugc', angle: 'Kid delight', ctr: 0.95 },
        ],
      },
      {
        name: 'Scale · Broad Advantage+',
        start: -20,
        end: null,
        daily: 2000,
        variables: { price: 199, offer: '100 videos pack + upsell', audience: 'Broad (Advantage+)', creative: 'UGC winners', angle: 'Social proof', landingPage: 'LP v3', cta: 'Get all 100' },
        hypothesis: 'Winning UGC creatives hold CAC under ₹130 at 2x budget.',
        changeNote: 'Budget ₹1,100 → ₹2,000/day on winning creatives',
        campaign: 'KV | Scale',
        quality: { ctr: 0.023, lpv: 0.8, checkout: 0.125, purchase: 0.45 },
        creatives: [
          { name: 'Creative E · Mom UGC', hook: 'I posted 30 days straight without editing', format: 'ugc', angle: 'Social proof', ctr: 1.05 },
          { name: 'Creative G · Carousel proof', hook: 'Real channels using these videos', format: 'carousel', angle: 'Proof', ctr: 0.9 },
        ],
      },
    ],
    decisions: [
      { offset: -69, decision: 'iterate', reason: 'Buyers convert but ₹99 leaves no room for ad costs (ROAS under 1x).', notes: 'Test ₹199 with a bigger 100-video offer.', experiment: 0 },
      { offset: -43, decision: 'continue', reason: 'ROAS improved at ₹199 without hurting conversion.', notes: 'Next: UGC creatives to push CTR.', experiment: 1 },
      { offset: -20, decision: 'scale', reason: 'CAC well below break-even for three weeks.', notes: 'Scale on Advantage+ at ₹2,000/day.', experiment: 2 },
    ],
  },
  {
    name: 'Notion Budget Planner',
    category: 'Finance',
    format: 'Notion template',
    deliverable: 'Budget planner template with savings trackers',
    targetCustomer: 'Salaried professionals 22-35',
    description: 'A monthly budget system in Notion.',
    price: 149,
    created: -30,
    costs: { paymentFeePct: 2.5, refundRatePct: 3, variableCostPerSale: 0 },
    idea: { created: -40, research: -38, expectedPrice: 149, effort: 2, demonstrability: 7, repeatPotential: 3, legalRisk: 1, source: 'Reddit r/IndiaInvestments', signals: { demand: 6, marketplace: 7, social: 5, search: 7 } },
    offers: { bump: { name: 'Savings tracker add-on', amount: 49, rate: 0.2 } },
    experiments: [
      {
        name: 'Launch test · Notion users',
        start: -14,
        end: null,
        daily: 700,
        variables: { price: 149, offer: 'Planner + tutorial', audience: 'Interest: Notion, productivity', creative: 'Screen recording', angle: 'Control your salary', landingPage: 'LP v1', cta: 'Get the planner' },
        hypothesis: 'Notion users will buy a finance template at ₹149.',
        campaign: 'Notion | Launch',
        quality: { ctr: 0.016, lpv: 0.75, checkout: 0.16, purchase: 0.45 },
        creatives: [
          { name: 'Walkthrough reel', hook: 'Where did my salary go?', format: 'reel', angle: 'Pain', ctr: 1 },
          { name: 'Static dashboard', hook: 'Your money on one page', format: 'image', angle: 'Clarity', ctr: 0.8 },
        ],
      },
    ],
    decisions: [
      { offset: -5, decision: 'continue', reason: 'Early CAC near break-even; need more data.', notes: 'Try a pain-led hook.', experiment: 0, apply: false },
    ],
  },
  {
    name: 'Reels Hook Library',
    category: 'Creator tools',
    format: 'Swipe file',
    deliverable: '500 proven hooks sorted by niche',
    targetCustomer: 'Instagram creators and coaches',
    description: 'Hooks library for short-form video.',
    price: 249,
    created: -50,
    costs: { paymentFeePct: 2.5, refundRatePct: 4, variableCostPerSale: 0 },
    idea: { created: -56, research: -54, expectedPrice: 249, effort: 4, demonstrability: 8, repeatPotential: 5, legalRisk: 2, source: 'Own audience poll', signals: { demand: 7, marketplace: 6, social: 7, search: 5 } },
    offers: {
      bump: { name: 'Caption templates', amount: 79, rate: 0.22 },
      upsell: { name: '1:1 hook review', amount: 499, rate: 0.05 },
    },
    versions: [{ label: 'v2', offset: -28, price: 249, changes: 'Landing page with video demo' }],
    experiments: [
      {
        name: 'Hook angle test',
        start: -45,
        end: -31,
        daily: 900,
        variables: { price: 249, offer: '500 hooks', audience: 'Creators 20-35', creative: 'Text-on-screen hooks', angle: 'Go viral', landingPage: 'LP v1', cta: 'Get the hooks' },
        hypothesis: 'Creators pay for a curated hook library.',
        campaign: 'Hooks | Angle test',
        quality: { ctr: 0.022, lpv: 0.7, checkout: 0.07, purchase: 0.4 },
        creatives: [
          { name: 'Viral hooks reel', hook: '3 hooks that got me 1M views', format: 'reel', angle: 'Viral', ctr: 1 },
          { name: 'Swipe file preview', hook: 'Steal my hook library', format: 'carousel', angle: 'Shortcut', ctr: 0.85 },
        ],
      },
      {
        name: 'LP v2 · video demo',
        start: -12,
        end: null,
        daily: 800,
        variables: { price: 249, offer: '500 hooks + captions', audience: 'Creators 20-35', creative: 'Text-on-screen hooks', angle: 'Go viral', landingPage: 'LP v2 (video demo)', cta: 'See the hooks' },
        hypothesis: 'A video demo lifts checkout rate above 10%.',
        changeNote: 'New landing page with demo video',
        campaign: 'Hooks | LP test',
        quality: { ctr: 0.021, lpv: 0.74, checkout: 0.115, purchase: 0.42 },
        creatives: [{ name: 'Viral hooks reel', hook: '3 hooks that got me 1M views', format: 'reel', angle: 'Viral', ctr: 1 }],
      },
    ],
    decisions: [
      { offset: -30, decision: 'iterate', reason: 'Strong CTR but checkout rate stuck near 7%.', notes: 'Landing page is the bottleneck; add a demo video.', experiment: 0 },
    ],
  },
  {
    name: 'Wedding Invite Templates',
    category: 'Design',
    format: 'Canva templates',
    deliverable: '40 editable wedding invite templates',
    targetCustomer: 'Engaged couples',
    description: 'Editable invites for Indian weddings.',
    price: 299,
    created: -75,
    costs: { paymentFeePct: 2.5, refundRatePct: 5, variableCostPerSale: 0 },
    idea: { created: -80, research: -78, expectedPrice: 299, effort: 5, demonstrability: 8, repeatPotential: 1, legalRisk: 3, source: 'Pinterest trend', signals: { demand: 6, marketplace: 8, social: 6, search: 7 } },
    offers: { bump: { name: 'Save-the-date pack', amount: 99, rate: 0.18 } },
    experiments: [
      {
        name: 'Launch test · Engaged couples',
        start: -70,
        end: -52,
        daily: 1000,
        variables: { price: 299, offer: '40 templates', audience: 'Engaged, 24-32', creative: 'Template slideshow', angle: 'Save on printing', landingPage: 'LP v1', cta: 'Browse templates' },
        hypothesis: 'Couples pay ₹299 to skip designers.',
        campaign: 'Wedding | Launch',
        quality: { ctr: 0.011, lpv: 0.7, checkout: 0.07, purchase: 0.4 },
        creatives: [
          { name: 'Slideshow', hook: 'Invites your guests will screenshot', format: 'video', angle: 'Aesthetic', ctr: 1 },
          { name: 'Price compare', hook: 'Designers charge ₹5,000', format: 'image', angle: 'Savings', ctr: 0.9 },
        ],
      },
      {
        name: 'Creative refresh',
        start: -50,
        end: -40,
        daily: 800,
        variables: { price: 299, offer: '40 templates + RSVP page', audience: 'Engaged, 24-32', creative: 'Customisation demo', angle: 'Personalised', landingPage: 'LP v1', cta: 'Customise yours' },
        hypothesis: 'Showing customisation raises purchase intent.',
        changeNote: 'Customisation demo creative and RSVP bonus',
        campaign: 'Wedding | Refresh',
        quality: { ctr: 0.013, lpv: 0.72, checkout: 0.075, purchase: 0.4 },
        creatives: [{ name: 'Customise demo', hook: 'Add your names in 30 seconds', format: 'reel', angle: 'Personalised', ctr: 1 }],
      },
    ],
    decisions: [
      {
        offset: -38,
        decision: 'kill',
        reason: 'CAC stayed ~2x above break-even after two tests.',
        notes: 'Seasonal demand and free Canva templates undercut the offer. Buyers wanted personalised design, not templates.',
      },
    ],
  },
  {
    name: 'UPSC Notes Pack',
    category: 'Education',
    format: 'PDF notes',
    deliverable: 'Topic-wise GS notes with maps',
    targetCustomer: 'UPSC aspirants',
    description: 'Concise notes for revision.',
    price: 399,
    created: -55,
    costs: { paymentFeePct: 2.5, refundRatePct: 2, variableCostPerSale: 0 },
    idea: { created: -62, research: -60, expectedPrice: 399, effort: 7, demonstrability: 5, repeatPotential: 7, legalRisk: 4, source: 'Telegram groups', signals: { demand: 7, marketplace: 6, social: 6, search: 8 } },
    offers: { bump: { name: 'Current affairs digest', amount: 99, rate: 0.3 } },
    experiments: [
      {
        name: 'Launch test · Aspirants',
        start: -48,
        end: -25,
        daily: 700,
        variables: { price: 399, offer: 'GS notes pack', audience: 'Interest: UPSC, IAS', creative: 'Notes flip-through', angle: 'Revise faster', landingPage: 'LP v1', cta: 'Download notes' },
        hypothesis: 'Aspirants buy concise notes before prelims.',
        campaign: 'UPSC | Launch',
        quality: { ctr: 0.019, lpv: 0.8, checkout: 0.09, purchase: 0.35 },
        creatives: [
          { name: 'Flip-through', hook: 'All of GS in 300 pages', format: 'video', angle: 'Speed', ctr: 1 },
          { name: 'Topper quote', hook: 'What toppers revise in the last 30 days', format: 'image', angle: 'Authority', ctr: 0.85 },
        ],
      },
    ],
    decisions: [
      { offset: -24, decision: 'pause', reason: 'Exam season ended; demand dropped sharply.', notes: 'Relaunch 60 days before the next prelims.', experiment: 0 },
    ],
  },
  {
    name: 'Yoga for Desk Workers',
    category: 'Health',
    format: 'Video course',
    deliverable: '21 ten-minute desk yoga sessions',
    targetCustomer: 'Remote and office workers',
    description: 'Short routines for back and neck pain.',
    price: 199,
    created: -6,
    costs: { paymentFeePct: 2.5, refundRatePct: 3, variableCostPerSale: 0 },
    idea: { created: -20, research: -18, expectedPrice: 199, effort: 6, demonstrability: 8, repeatPotential: 4, legalRisk: 2, source: 'Office colleagues', signals: { demand: 7, marketplace: 5, social: 6, search: 7 } },
    offers: {},
    experiments: [],
    decisions: [],
  },
  {
    name: 'Excel Dashboards for SMBs',
    category: 'Business',
    format: 'Excel templates',
    deliverable: '12 dashboard templates for small businesses',
    targetCustomer: 'Small business owners',
    description: 'Plug-and-play sales and inventory dashboards.',
    price: 499,
    created: -80,
    costs: { paymentFeePct: 2.5, refundRatePct: 3, variableCostPerSale: 0 },
    offers: {},
    experiments: [
      {
        name: 'Smoke test',
        start: -75,
        end: -65,
        daily: 600,
        variables: { price: 499, offer: '12 dashboards', audience: 'Small business owners', creative: 'Dashboard GIF', angle: 'Know your numbers', landingPage: 'LP v1', cta: 'Get dashboards' },
        hypothesis: 'SMB owners buy ready dashboards.',
        campaign: 'Excel | Smoke',
        quality: { ctr: 0.009, lpv: 0.65, checkout: 0.03, purchase: 0.15 },
        creatives: [{ name: 'Dashboard GIF', hook: 'Your business on one screen', format: 'image', angle: 'Clarity', ctr: 1 }],
      },
    ],
    decisions: [
      { offset: -60, decision: 'kill', reason: 'Almost no purchase signal after ₹6,000 spend.', notes: 'Audience does not buy from Instagram ads; try LinkedIn or skip.', experiment: 0 },
    ],
  },
];

const IDEAS = [
  {
    name: 'Instagram Carousel Templates for Coaches',
    category: 'Creator tools',
    status: 'researching',
    created: -12,
    targetCustomer: 'Fitness and business coaches',
    problem: 'Need polished carousels without a designer',
    format: 'Canva templates',
    deliverable: '60 carousel templates',
    expectedPrice: 299,
    effort: 4,
    demonstrability: 9,
    repeatPotential: 5,
    legalRisk: 2,
    source: 'Coach Facebook groups',
    signals: { demand: 7, marketplace: 8, social: 7, search: 5 },
    competitors: [
      { name: 'CoachCarousels', price: 999, notes: 'US pricing, strong reviews' },
      { name: 'Etsy carousel packs', price: 450 },
    ],
    priceExamples: [
      { label: 'CoachCarousels', price: 999 },
      { label: 'Etsy packs', price: 450 },
    ],
    audience: 'Coaches posting 3+ times a week',
  },
  { name: 'Kids Handwriting Worksheets', category: 'Parenting', status: 'idea', created: -9, expectedPrice: 149, effort: 3, demonstrability: 7, repeatPotential: 7, legalRisk: 1, format: 'Printable PDF', source: 'AI Kids Videos buyers' },
  {
    name: 'Resume Templates for Freshers',
    category: 'Career',
    status: 'ready_to_test',
    created: -16,
    expectedPrice: 99,
    effort: 2,
    demonstrability: 8,
    repeatPotential: 2,
    legalRisk: 1,
    format: 'Word + Canva templates',
    source: 'Campus placement season',
    signals: { demand: 8, marketplace: 7, social: 6, search: 9 },
  },
  { name: 'Astrology Birth Chart Reports', category: 'Spirituality', status: 'idea', created: -7, expectedPrice: 499, effort: 6, demonstrability: 6, repeatPotential: 6, legalRisk: 7, source: 'Astro content performance' },
  { name: 'Meme Marketing Pack', category: 'Creator tools', status: 'killed', created: -45, expectedPrice: 199, effort: 3, demonstrability: 5, repeatPotential: 1, legalRisk: 6, notes: 'Too generic and copyright-heavy.' },
  { name: 'Festive Rangoli Design Pack', category: 'Design', status: 'idea', created: -3, expectedPrice: 99, effort: 3, demonstrability: 9, repeatPotential: 2, legalRisk: 1, source: 'Diwali season' },
];

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Ishaan', 'Rohan', 'Karan', 'Nikhil', 'Ananya', 'Diya', 'Saanvi', 'Myra', 'Aarohi', 'Anika', 'Riya', 'Priya', 'Neha', 'Kavya', 'Meera', 'Pooja', 'Sneha', 'Divya', 'Tanvi', 'Kabir', 'Dev', 'Sara', 'Isha', 'Aditi', 'Rahul', 'Simran'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Iyer', 'Nair', 'Reddy', 'Patel', 'Shah', 'Mehta', 'Joshi', 'Kulkarni', 'Desai', 'Singh', 'Das', 'Bose', 'Menon', 'Rao', 'Pillai', 'Chopra', 'Malhotra'];

const PERSONAL_DAYS = 42;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WORK_DAYS = [1, 2, 3, 4, 5];
const SILENT = { beforeStart: null, atStart: false, beforeEnd: null };

const BLOCKS = [
  { key: 'morning', name: 'Morning', start: '06:00', end: '06:15', category: 'personal', days: EVERY_DAY, reminders: SILENT },
  {
    key: 'walk',
    name: 'Walk',
    start: '06:15',
    end: '07:00',
    category: 'fitness',
    days: EVERY_DAY,
    reminders: { ...SILENT, atStart: true },
  },
  { key: 'breakfast', name: 'Breakfast', start: '08:00', end: '08:30', category: 'break', days: EVERY_DAY, reminders: SILENT },
  {
    key: 'money',
    name: 'Money Block',
    start: '10:00',
    end: '12:30',
    category: 'business',
    days: [1, 2, 3, 4, 5, 6],
    goal: 'revenue',
    product: 'AI Kids Videos',
    reminders: { beforeStart: 5, atStart: true, beforeEnd: 5 },
  },
  { key: 'lunch', name: 'Break', start: '12:30', end: '13:00', category: 'break', days: WORK_DAYS, reminders: SILENT },
  {
    key: 'lab',
    name: 'Product Lab',
    start: '13:00',
    end: '14:30',
    category: 'product',
    days: WORK_DAYS,
    goal: 'contribution',
    product: 'Reels Hook Library',
    reminders: { beforeStart: 10, atStart: true, beforeEnd: null },
  },
  {
    key: 'skill',
    name: 'Skill Block',
    start: '14:30',
    end: '16:00',
    category: 'learning',
    days: WORK_DAYS,
    goal: 'learning',
    reminders: { ...SILENT, atStart: true },
  },
  { key: 'tea', name: 'Break', start: '16:00', end: '16:30', category: 'break', days: WORK_DAYS, reminders: SILENT },
  {
    key: 'gym',
    name: 'Gym',
    start: '18:00',
    end: '19:15',
    category: 'fitness',
    days: [1, 3, 5, 6],
    goal: 'fitness',
    reminders: { ...SILENT, beforeStart: 15 },
  },
  { key: 'review', name: 'Daily Review', start: '22:00', end: '22:15', category: 'review', days: EVERY_DAY, reminders: SILENT },
];

const HABITS = [
  { name: 'Walk', targetPerWeek: 7, rate: 0.82, doneAt: 7 },
  { name: 'Gym', targetPerWeek: 4, rate: 0.8, doneAt: 19.25, days: [1, 3, 5, 6] },
  { name: 'Reading', targetPerWeek: 5, rate: 0.62, doneAt: 21.5 },
  { name: 'Sleep by 23:00', targetPerWeek: 7, rate: 0.58, doneAt: 23 },
];

const FOCUS = [
  {
    hour: 10.1,
    days: [1, 2, 3, 4, 5, 6],
    chance: 0.85,
    planned: [90, 120],
    category: 'business',
    goal: 'revenue',
    products: ['AI Kids Videos'],
    labels: ["Analyze yesterday's Meta data", 'Scale budget check', 'Creative briefs', 'Cut losing ad sets'],
  },
  {
    hour: 13.1,
    days: WORK_DAYS,
    chance: 0.75,
    planned: [60, 75],
    category: 'product',
    goal: 'contribution',
    products: ['Reels Hook Library', 'Notion Budget Planner'],
    labels: ['Landing page v2', 'Checkout copy', 'Demo video edit', 'Template polish'],
  },
  {
    hour: 14.6,
    days: WORK_DAYS,
    chance: 0.65,
    planned: [45, 60, 75],
    category: 'learning',
    goal: 'learning',
    labels: ['Copywriting drills', 'Meta ads course', 'Landing page teardown', 'Offer design notes'],
  },
  { hour: 11, days: [0], chance: 0.35, planned: [45, 60], category: 'learning', goal: 'learning', labels: ['Ad psychology reading'] },
];

const OUTCOMES = [
  { title: "Analyze yesterday's Meta data", product: 'AI Kids Videos' },
  { title: 'Create three ad creatives', product: 'AI Kids Videos' },
  { title: 'Finish landing page v2 with the demo video', product: 'Reels Hook Library' },
  { title: 'Write 10 new hooks for the UGC test', product: 'AI Kids Videos' },
  { title: 'Ship the planner checkout copy test', product: 'Notion Budget Planner' },
  { title: 'Record the hooks library demo video', product: 'Reels Hook Library' },
  { title: 'Review CAC by creative and pause the losers' },
  { title: "Plan next week's experiments" },
  { title: 'Outline the festive rangoli pack' },
  { title: 'Answer every customer email' },
];
const TASKS = ['Export the Meta report', 'Brief the video editor', 'Check refunds', 'Update the budget sheet', 'Reply to DMs'];
const ACCOMPLISHMENTS = [
  'Shipped the landing page update',
  'Found a hook with twice the CTR',
  'Paused two losing ad sets',
  'Finished the creative batch',
  'Cleared the customer inbox',
  'Launched the test on time',
  'Wrote the full upsell page',
];
const LESSONS = [
  'UGC hooks beat polished edits',
  'Price anchors lift checkout rate',
  'Morning focus is my best work',
  'Change one variable per test',
  'Short videos win on Reels',
  'Set budgets before opening Ads Manager',
];
const BLOCKERS = ['Ad review delayed the launch', 'Payment page was slow', 'Too many calls', 'Editor missed the deadline', 'Low energy'];
const WEEKLY = [
  {
    wins: 'AI Kids Videos held its ROAS at the higher budget; the planner test earned a continue.',
    lessons: 'Checkout friction hurts the planner more than its price.',
    nextFocus: 'Push LP v2 traffic and fix the planner checkout.',
  },
  {
    wins: 'Launched the hooks library LP v2 and the Notion planner test.',
    lessons: 'A demo video answers objections the copy could not.',
    nextFocus: 'Get both tests to 20 purchases before judging them.',
  },
  {
    wins: 'Moved AI Kids Videos to scale on the winning UGC creatives.',
    lessons: 'UGC hooks keep CAC low; budget jumps above 50% unsettle delivery.',
    nextFocus: 'Protect the Money Blocks and write 20 new hooks.',
  },
];

function signalsDoc(signals = {}) {
  return Object.fromEntries(Object.entries(signals).map(([k, score]) => [k, { score, note: '' }]));
}

function ideaDoc(def, extra = {}) {
  const history = [{ at: at(def.created), to: 'idea' }];
  if (def.research) history.push({ at: at(def.research, 14), from: 'idea', to: 'researching' });
  if (['researching', 'ready_to_test', 'killed'].includes(def.status) && !def.research) {
    history.push({ at: at(def.created + 2, 15), from: 'idea', to: def.status });
  }
  return {
    _id: oid(),
    name: def.name,
    category: def.category ?? '',
    targetCustomer: def.targetCustomer ?? '',
    problem: def.problem ?? def.description ?? '',
    format: def.format ?? '',
    deliverable: def.deliverable ?? '',
    expectedPrice: def.expectedPrice ?? null,
    effort: def.effort ?? null,
    demonstrability: def.demonstrability ?? null,
    repeatPotential: def.repeatPotential ?? null,
    legalRisk: def.legalRisk ?? null,
    source: def.source ?? '',
    notes: def.notes ?? '',
    status: def.status ?? 'idea',
    validation: {
      competitors: def.competitors ?? [],
      ads: def.ads ?? [],
      priceExamples: def.priceExamples ?? [],
      signals: signalsDoc(def.signals),
      audience: def.audience ?? '',
      painDesire: def.painDesire ?? '',
      rightsNotes: def.rightsNotes ?? '',
    },
    history,
    createdAt: at(def.created),
    updatedAt: at(def.research ?? def.created),
    ...extra,
  };
}

const docs = { ideas: [], products: [], versions: [], experiments: [], creatives: [], metrics: [], orders: [], decisions: [] };
const customers = [];

function customerFor() {
  if (customers.length > 20 && chance(0.09)) return pick(customers);
  const first = pick(FIRST);
  const last = pick(LAST);
  const c = {
    _id: oid(),
    name: `${first} ${last}`,
    email: `${first}.${last}.${customers.length + 1}@example.com`.toLowerCase(),
    orders: [],
  };
  customers.push(c);
  return c;
}

function orderTime(dayStart, offset, hours, from, to) {
  if (offset !== 0) return new Date(dayStart + hours * 3_600_000);
  const elapsed = Math.max(Date.now() - 60_000 - dayStart, 0);
  const start = Math.min(from * 3_600_000, elapsed / 2);
  return new Date(dayStart + start + ((hours - from) / (to - from)) * (elapsed - start));
}

function makeOrders(p, experiment, date, offset, count, price) {
  let revenue = 0;
  const dayStart = startOfDayIn(date, TZ).getTime();
  for (let i = 0; i < count; i++) {
    const offers = p.def.offers;
    const active = (o) => o && offset >= (o.from ?? -Infinity);
    const items = [];
    if (active(offers.bundle) && chance(offers.bundle.rate)) items.push({ kind: 'bundle', name: offers.bundle.name, amount: offers.bundle.amount });
    else items.push({ kind: 'main', name: p.doc.name, amount: price });
    if (active(offers.bump) && chance(offers.bump.rate)) items.push({ kind: 'bump', name: offers.bump.name, amount: offers.bump.amount });
    if (active(offers.upsell) && chance(offers.upsell.rate)) items.push({ kind: 'upsell', name: offers.upsell.name, amount: offers.upsell.amount });
    const amount = items.reduce((s, it) => s + it.amount, 0);
    const refunded = chance((p.doc.costs.refundRatePct / 100) * 0.8);
    const customer = customerFor();
    const time = orderTime(dayStart, offset, between(7, 23.5), 7, 23.5);
    const order = {
      _id: oid(),
      productId: p.doc._id,
      experimentId: experiment._id,
      customerId: customer._id,
      items,
      amount,
      paymentStatus: 'paid',
      refundStatus: refunded ? 'full' : 'none',
      refundAmount: refunded ? amount : 0,
      date: time,
      campaign: experiment.campaign,
      createdAt: time,
      updatedAt: time,
    };
    customer.orders.push(order);
    docs.orders.push(order);
    revenue += amount;
  }
  if (count && chance(0.25)) {
    const customer = customerFor();
    const date = orderTime(dayStart, offset, between(8, 22), 8, 22);
    const failed = {
      _id: oid(),
      productId: p.doc._id,
      experimentId: experiment._id,
      customerId: customer._id,
      items: [{ kind: 'main', name: p.doc.name, amount: price }],
      amount: price,
      paymentStatus: chance(0.5) ? 'failed' : 'pending',
      date,
      campaign: experiment.campaign,
      createdAt: date,
      updatedAt: date,
    };
    customer.orders.push(failed);
    docs.orders.push(failed);
  }
  return revenue;
}

function simulateExperiment(p, def, index) {
  const experiment = {
    _id: oid(),
    productId: p.doc._id,
    name: def.name,
    hypothesis: def.hypothesis ?? '',
    status: def.end == null ? 'running' : 'completed',
    variables: def.variables,
    changeNote: def.changeNote ?? '',
    budget: def.daily * ((def.end ?? 0) - def.start + 1),
    dailyBudget: def.daily,
    startDate: day(def.start),
    endDate: def.end == null ? null : day(def.end),
    campaign: def.campaign,
    createdAt: at(def.start - 2),
    updatedAt: at(def.end ?? 0),
  };
  docs.experiments.push(experiment);
  const creatives = def.creatives.map((c, i) => ({
    _id: oid(),
    experimentId: experiment._id,
    productId: p.doc._id,
    name: c.name,
    hook: c.hook,
    format: c.format,
    angle: c.angle,
    campaign: def.campaign,
    adSet: `${def.variables.audience} · ${i + 1}`,
    startDate: day(def.start),
    createdAt: at(def.start - 1),
    updatedAt: at(def.start - 1),
    ctr: c.ctr,
  }));
  docs.creatives.push(...creatives.map(({ ctr, ...c }) => c));

  const q = def.quality;
  for (let offset = def.start; offset <= (def.end ?? 0); offset++) {
    const date = day(offset);
    const weekday = toUTCDate(date).getUTCDay();
    const partial = offset === 0 ? 0.55 : 1;
    const warmup = Math.min(1, 0.75 + (offset - def.start) * 0.05);
    const wave = 1 + 0.07 * Math.sin((offset + index * 3) / 3.5) + (weekday === 0 || weekday === 6 ? 0.05 : 0);
    for (const c of creatives) {
      const share = c.ctr / creatives.reduce((s, x) => s + x.ctr, 0);
      const spend = round(def.daily * share * between(0.88, 1.1) * partial);
      const impressions = Math.round((spend / between(95, 150)) * 1000);
      const clicks = Math.round(impressions * q.ctr * c.ctr * wave * between(0.88, 1.12));
      const landingPageViews = Math.round(clicks * q.lpv * between(0.93, 1.04));
      const checkouts = Math.min(landingPageViews, poisson(landingPageViews * q.checkout * warmup * wave));
      const purchases = Math.min(checkouts, poisson(checkouts * q.purchase));
      const revenue = makeOrders(p, experiment, date, offset, purchases, def.variables.price);
      docs.metrics.push({
        _id: oid(),
        date,
        productId: p.doc._id,
        experimentId: experiment._id,
        creativeId: c._id,
        campaign: def.campaign,
        adSet: c.adSet,
        spend,
        impressions,
        reach: Math.round(impressions * between(0.62, 0.78)),
        clicks,
        landingPageViews,
        checkouts,
        purchases,
        revenue,
        createdAt: at(offset, 22),
        updatedAt: at(offset, 22),
      });
    }
  }
  return experiment;
}

function evidence(productId, experimentId, untilDate, costs) {
  const rows = docs.metrics.filter(
    (m) => String(m.productId) === String(productId) && (!experimentId || String(m.experimentId) === String(experimentId)) && m.date <= untilDate,
  );
  const totals = deriveMetrics(sumTotals(rows.map((r) => ({ ...r, ...variableCosts(r, costs) }))));
  return Object.fromEntries(['purchases', 'revenue', 'spend', 'cac', 'roas', 'conversionRate', 'aov', 'ctr', 'contribution'].map((k) => [k, totals[k]]));
}

function buildProduct(def) {
  const idea = def.idea ? ideaDoc({ ...def, ...def.idea, status: 'converted' }) : null;
  const product = {
    _id: oid(),
    name: def.name,
    category: def.category,
    description: def.description,
    format: def.format,
    deliverable: def.deliverable,
    targetCustomer: def.targetCustomer,
    price: def.versions?.find((v) => v.label === 'v1')?.price ?? def.price,
    status: 'ready_to_test',
    version: 'v1',
    ideaId: idea?._id ?? null,
    costs: def.costs,
    desiredMarginPct: 20,
    budget: def.budget ?? { daily: null, monthly: null },
    events: [{ date: day(def.created), at: at(def.created), type: 'created', title: idea ? 'Converted from idea' : 'Product created', to: 'ready_to_test' }],
    createdAt: at(def.created),
  };
  if (idea) {
    idea.history.push({ at: at(def.created), from: 'researching', to: 'converted' });
    Object.assign(idea, { productId: product._id, convertedAt: at(def.created) });
    docs.ideas.push(idea);
  }
  const p = { def, doc: product };
  const setStatus = (to, offset, note = '') => {
    if (product.status === to) return;
    product.events.push({ date: day(offset), at: at(offset, 18), type: 'status', title: `${LABELS.status[product.status]} → ${LABELS.status[to]}`, from: product.status, to, note });
    product.status = to;
    product.statusChangedAt = at(offset, 18);
    if (to === 'killed') product.killedAt = at(offset, 18);
  };

  const timeline = [
    ...(def.milestones ?? []).map((m) => ({ offset: m.offset, kind: 'milestone', m })),
    ...(def.versions ?? []).map((v) => ({ offset: v.offset, kind: 'version', v })),
    ...def.experiments.map((x, i) => ({ offset: x.start, kind: 'experiment', x, i })),
    ...def.decisions.map((d) => ({ offset: d.offset, kind: 'decision', d })),
  ].sort((a, b) => a.offset - b.offset);

  const experiments = [];
  for (const step of timeline) {
    if (step.kind === 'milestone') {
      product.events.push({ date: day(step.offset), at: at(step.offset, 12), type: 'milestone', title: step.m.title, note: step.m.note ?? '' });
    } else if (step.kind === 'version') {
      docs.versions.push({ _id: oid(), productId: product._id, label: step.v.label, date: day(step.offset), price: step.v.price, changes: step.v.changes, createdAt: at(step.offset, 11) });
      if (step.v.price !== product.price) {
        product.events.push({ date: day(step.offset), at: at(step.offset, 11), type: 'price', title: 'Price changed', from: product.price, to: step.v.price });
        product.price = step.v.price;
      }
      product.version = step.v.label;
    } else if (step.kind === 'experiment') {
      if (product.status === 'ready_to_test') setStatus('testing', step.offset);
      experiments[step.i] = simulateExperiment(p, step.x, step.i);
    } else {
      const d = step.d;
      const experiment = d.experiment != null ? experiments[d.experiment] : null;
      const apply = d.apply ?? true;
      const statusFrom = product.status;
      const statusTo = apply ? DECISION_STATUS[d.decision] : null;
      docs.decisions.push({
        _id: oid(),
        productId: product._id,
        experimentId: experiment?._id ?? null,
        decision: d.decision,
        reason: d.reason,
        notes: d.notes ?? '',
        date: day(d.offset),
        evidence: evidence(product._id, experiment?._id, day(d.offset), def.costs),
        statusFrom,
        statusTo,
        createdAt: at(d.offset, 18),
        updatedAt: at(d.offset, 18),
      });
      if (apply) setStatus(statusTo, d.offset, d.reason);
      if (d.decision === 'kill') Object.assign(product, { killReason: d.reason, learnings: d.notes ?? '' });
    }
  }
  product.statusChangedAt ??= product.createdAt;
  product.updatedAt = product.events.at(-1).at;
  docs.products.push(product);
}

function buildPersonal() {
  const same = (a, b) => String(a) === String(b);
  const product = (name) => docs.products.find((p) => p.name === name);
  const liveExperiment = (productId, date) =>
    docs.experiments.find((x) => same(x.productId, productId) && x.startDate <= date && (x.endDate ?? today) >= date)?._id ?? null;
  const costs = new Map(docs.products.map((p) => [String(p._id), p.costs]));
  const totals = (rows) => deriveMetrics(sumTotals(rows.map((r) => ({ ...r, ...variableCosts(r, costs.get(String(r.productId))) }))));
  const roundUp = (value, step) => Math.max(step, Math.ceil(value / step) * step);
  const past = (date) => date.getTime() <= Date.now() - 60_000;
  const first = 1 - PERSONAL_DAYS;
  const created = at(first - 1, 9);

  const kids = product('AI Kids Videos');
  const year = today.slice(0, 4);
  const monthStart = `${today.slice(0, 8)}01`;
  const monthEnd = addDays(addMonths(monthStart, 1), -1);
  const month = new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' }).format(toUTCDate(monthStart));
  const monthRevenue = totals(docs.metrics.filter((m) => same(m.productId, kids._id) && m.date >= monthStart)).revenue;
  const monthPace = (monthRevenue / (daysBetween(monthStart, today) + 1)) * (daysBetween(monthStart, monthEnd) + 1);
  const yearContribution = totals(docs.metrics.filter((m) => m.date >= `${year}-01-01`)).contribution;
  const goal = (def) => ({
    _id: oid(),
    description: '',
    currentValue: null,
    startDate: `${year}-01-01`,
    targetDate: `${year}-12-31`,
    status: 'active',
    notes: 'Demo goal from the seed script. Edit or replace it.',
    productIds: [],
    createdAt: created,
    updatedAt: created,
    ...def,
  });
  const goals = {
    revenue: goal({
      title: `AI Kids Videos revenue in ${month}`,
      level: 'monthly',
      category: 'money',
      tracking: 'revenue',
      targetValue: roundUp(monthPace * 1.15, 5000),
      unit: 'INR',
      startDate: monthStart,
      targetDate: monthEnd,
      productIds: [kids._id],
    }),
    contribution: goal({
      title: `Profit contribution in ${year}`,
      level: 'yearly',
      category: 'business',
      tracking: 'contribution',
      targetValue: roundUp(yearContribution * 3, 50000),
      unit: 'INR',
      productIds: docs.products.filter((p) => docs.metrics.some((m) => same(m.productId, p._id))).map((p) => p._id),
    }),
    fitness: goal({ title: 'Deadlift 120 kg', level: 'yearly', category: 'fitness', currentValue: 95, targetValue: 120, unit: 'kg' }),
    learning: goal({
      title: 'Performance marketing skills',
      description: 'Deliberate practice: ad analysis, copywriting and landing pages.',
      level: 'yearly',
      category: 'learning',
      tracking: 'focus_hours',
      targetValue: 120,
      unit: 'hours',
      startDate: day(first),
    }),
  };
  const stamps = { createdAt: created, updatedAt: created };
  const blocks = Object.fromEntries(
    BLOCKS.map(({ key, goal: goalKey, product: name, ...def }) => [
      key,
      { _id: oid(), ...def, goalId: goals[goalKey]?._id ?? null, productId: name ? product(name)._id : null, ...stamps },
    ]),
  );
  const habits = HABITS.map(({ name, targetPerWeek }, order) => ({ _id: oid(), name, targetPerWeek, order, ...stamps }));

  const completions = [];
  const sessions = [];
  const outcomes = [];
  const reviews = [];
  for (let offset = first; offset <= 0; offset++) {
    const date = day(offset);
    const weekday = weekdayOf(date);
    const trend = 0.85 + (0.15 * (offset - first)) / PERSONAL_DAYS;
    HABITS.forEach((def, i) => {
      const doneAt = at(offset, def.doneAt + between(0, 0.5));
      if (chance(def.days && !def.days.includes(weekday) ? 0.04 : def.rate * trend) && past(doneAt)) {
        completions.push({ _id: oid(), habitId: habits[i]._id, date, createdAt: doneAt, updatedAt: doneAt });
      }
    });

    for (const plan of FOCUS) {
      if (!plan.days.includes(weekday) || !chance(plan.chance)) continue;
      const plannedMinutes = pick(plan.planned);
      const cancelled = chance(0.05);
      const minutes = Math.round(plannedMinutes * (cancelled ? between(0.15, 0.4) : between(0.85, 1.03)));
      const startedAt = at(offset, plan.hour + between(0, 0.15));
      const endedAt = new Date(startedAt.getTime() + minutes * 60_000);
      const focusProduct = plan.products ? product(pick(plan.products)) : null;
      const label = pick(plan.labels);
      if (!past(endedAt)) continue;
      sessions.push({
        _id: oid(),
        label,
        category: plan.category,
        plannedMinutes,
        startedAt,
        endedAt,
        minutes,
        status: cancelled ? 'cancelled' : 'completed',
        goalId: goals[plan.goal]._id,
        productId: focusProduct?._id ?? null,
        experimentId: focusProduct ? liveExperiment(focusProduct._id, date) : null,
        endNotified: true,
        createdAt: startedAt,
        updatedAt: endedAt,
      });
    }

    const planned = chance(offset < 0 ? 0.9 : 1);
    const def = pick(OUTCOMES);
    const done = offset < 0 && chance(0.7);
    const doneAt = at(offset, between(13, 20));
    const due = BLOCKS.filter((b) => countsTowardProgress(b) && b.days.includes(weekday));
    const completedBlocks = due.filter((b) => chance(0.75) && past(at(offset, timeToMinutes(b.end) / 60))).map((b) => blocks[b.key]._id);
    const tasks = TASKS.filter(() => chance(0.2)).map((title) => ({ title, done: chance(0.6) }));
    const reviewAt = at(offset, 22 + between(0.1, 0.6));
    if (!planned) continue;
    const setAt = at(offset - 1, 22.2);
    const outcomeProduct = def.product ? product(def.product) : null;
    outcomes.push({
      _id: oid(),
      date,
      title: def.title,
      done,
      doneAt: done ? doneAt : null,
      goalId: outcomeProduct === kids ? goals.revenue._id : null,
      productId: outcomeProduct?._id ?? null,
      experimentId: outcomeProduct ? liveExperiment(outcomeProduct._id, date) : null,
      tasks,
      completedBlocks,
      createdAt: setAt,
      updatedAt: done ? doneAt : setAt,
    });
    if (chance(0.85) && past(reviewAt)) {
      reviews.push({
        _id: oid(),
        date,
        outcomeCompleted: done,
        accomplishment: pick(ACCOMPLISHMENTS),
        lesson: pick(LESSONS),
        blocker: chance(0.4) ? pick(BLOCKERS) : '',
        createdAt: reviewAt,
        updatedAt: reviewAt,
      });
    }
  }
  for (const r of reviews) r.tomorrowOutcome = outcomes.find((o) => o.date === addDays(r.date, 1))?.title ?? '';

  const thisWeek = bucketStart(today, 'week');
  const weekly = WEEKLY.map((def, i) => {
    const weekStart = addDays(thisWeek, -7 * (i + 1));
    const writtenAt = at(daysBetween(today, addDays(weekStart, 6)), 19.5);
    return { _id: oid(), weekStart, ...def, createdAt: writtenAt, updatedAt: writtenAt };
  });

  const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format;
  const notifications = [];
  const notice = (createdAt, n, read = true) => {
    if (!past(createdAt)) return;
    const readAt = read ? new Date(createdAt.getTime() + 15 * 60_000) : null;
    const pushed = { sent: 0, failed: 0, skipped: 'no_devices' };
    notifications.push({ _id: oid(), owner: config.adminEmail, ...n, readAt, pushed, createdAt, updatedAt: createdAt });
  };
  const yesterday = day(-1);
  const lastWeek = addDays(thisWeek, -7);
  const lastWeekMinutes = sessions
    .filter((s) => s.status === 'completed' && s.startedAt >= startOfDayIn(lastWeek, TZ) && s.startedAt < startOfDayIn(thisWeek, TZ))
    .reduce((sum, s) => sum + s.minutes, 0);
  const lastWeekRevenue = totals(docs.metrics.filter((m) => m.date >= lastWeek && m.date < thisWeek)).revenue;
  notice(at(daysBetween(today, thisWeek) - 1, 19), {
    category: 'review',
    type: 'weekly_review',
    title: 'Weekly review is ready',
    body: `${fmt(lastWeekRevenue)} revenue · ${round(lastWeekMinutes / 60, 1)}h focus this week`,
    url: `/reviews/weekly?week=${lastWeek}`,
    dedupeKey: `weekly:${lastWeek}`,
  });
  const y = totals(docs.metrics.filter((m) => m.date === yesterday));
  notice(at(-1, 21.5), {
    category: 'business',
    type: 'daily_revenue',
    title: `Today: ${fmt(y.revenue)} revenue`,
    body: `${y.purchases} purchases · ${fmt(y.spend)} ad spend${y.roas ? ` · ROAS ${y.roas}x` : ''}`,
    url: '/',
    dedupeKey: `revenue:${yesterday}`,
  });
  notice(at(-1, 22), {
    category: 'review',
    type: 'daily_review',
    title: 'Daily Review',
    body: "Record today's result and choose tomorrow's #1 outcome.",
    url: '/today?review=1',
    dedupeKey: `review:${yesterday}`,
  });
  const refunds = docs.orders.filter((o) => o.refundStatus === 'full' && o.date >= at(-3, 0)).sort((a, b) => a.date - b.date);
  for (const o of refunds.slice(-2)) {
    notice(
      new Date(o.date.getTime() + 2 * 3_600_000),
      {
        category: 'business',
        type: 'refund',
        title: `Refund · ${fmt(o.refundAmount)}`,
        body: `${docs.products.find((p) => same(p._id, o.productId)).name} · Refunded`,
        url: `/products/${o.productId}`,
        dedupeKey: `refund:${o._id}:full`,
      },
      false,
    );
  }
  for (const x of docs.experiments.filter((e) => !e.endDate)) {
    const rows = docs.metrics.filter((m) => same(m.experimentId, x._id));
    for (const date of [...new Set(rows.map((r) => r.date))].sort().filter((d) => d >= day(-6))) {
      const upTo = rows.filter((r) => r.date <= date);
      const total = upTo.reduce((s, r) => s + r.purchases, 0);
      const before = total - rows.filter((r) => r.date === date).reduce((s, r) => s + r.purchases, 0);
      const milestone = PURCHASE_MILESTONES.filter((m) => before < m && total >= m).at(-1);
      if (!milestone) continue;
      const t = totals(upTo);
      notice(
        at(daysBetween(today, date), 22),
        {
          category: 'business',
          type: 'experiment_milestone',
          title: `${x.name} crossed ${milestone} purchases`,
          body: `CAC ${fmt(t.cac)}${t.roas == null ? '' : ` · ROAS ${t.roas}x`} so far`,
          url: `/experiments/${x._id}`,
          dedupeKey: `milestone:${x._id}:${milestone}`,
        },
        date < yesterday,
      );
    }
  }
  const todayOutcome = outcomes.find((o) => o.date === today);
  notice(
    at(0, 8),
    {
      category: 'outcome',
      type: 'daily_outcome',
      title: `Today's #1: ${todayOutcome.title}`,
      body: 'Give it your first focus block.',
      url: '/today',
      dedupeKey: `outcome:${today}`,
    },
    false,
  );
  if (blocks.money.days.includes(weekdayOf(today))) {
    notice(
      at(0, 9 + 55 / 60),
      {
        category: 'schedule',
        type: 'block_reminder',
        title: 'Money Block starts in 5 min',
        body: `Today's #1: ${todayOutcome.title}`,
        url: '/today',
        dedupeKey: `block:${blocks.money._id}:${today}:before:${minutesToTime(timeToMinutes(blocks.money.start) - 5)}`,
      },
      false,
    );
  }

  return {
    goals: Object.values(goals),
    blocks: Object.values(blocks),
    habits,
    completions,
    sessions,
    outcomes,
    reviews,
    weekly,
    notifications,
  };
}

async function main() {
  await connectDb(config.mongoUri);
  const existing = await Promise.all(
    [Product, ProductIdea, CampaignMetric, Order, Goal, TimeBlock, Habit, FocusSession].map((m) => m.estimatedDocumentCount()),
  );
  if (existing.some(Boolean) && !process.argv.includes('--reset')) {
    console.error('Database already has data. Run "npm run seed -- --reset" to replace everything with demo data.');
    process.exit(1);
  }
  await Promise.all(MODELS.map((m) => m.deleteMany({})));
  await Promise.all(MODELS.map((m) => m.createIndexes()));

  for (const def of PRODUCTS) buildProduct(def);
  for (const def of IDEAS) docs.ideas.push(ideaDoc(def));
  const personal = buildPersonal();

  const customerDocs = customers.map((c) => {
    const paid = c.orders.filter((o) => o.paymentStatus === 'paid');
    const dates = paid.map((o) => o.date.getTime());
    const created = new Date(Math.min(...c.orders.map((o) => o.date.getTime())));
    return {
      _id: c._id,
      name: c.name,
      email: c.email,
      totalSpent: round(paid.reduce((s, o) => s + o.amount - (o.refundAmount ?? 0), 0)),
      orderCount: paid.length,
      firstPurchaseAt: dates.length ? new Date(Math.min(...dates)) : null,
      lastPurchaseAt: dates.length ? new Date(Math.max(...dates)) : null,
      productIds: [...new Set(paid.map((o) => String(o.productId)))].map((id) => new mongoose.Types.ObjectId(id)),
      createdAt: created,
      updatedAt: created,
    };
  });

  await Setting.create({ key: 'app', timezone: TZ });
  await ProductIdea.insertMany(docs.ideas);
  await Product.insertMany(docs.products);
  await ProductVersion.insertMany(docs.versions);
  await Experiment.insertMany(docs.experiments);
  await AdCreative.insertMany(docs.creatives);
  await CampaignMetric.insertMany(docs.metrics);
  await Customer.insertMany(customerDocs);
  await Order.insertMany(docs.orders);
  await Decision.insertMany(docs.decisions);
  await Goal.insertMany(personal.goals);
  await TimeBlock.insertMany(personal.blocks);
  await Habit.insertMany(personal.habits);
  await HabitCompletion.insertMany(personal.completions);
  await FocusSession.insertMany(personal.sessions);
  await DailyOutcome.insertMany(personal.outcomes);
  await DailyReview.insertMany(personal.reviews);
  await WeeklyReview.insertMany(personal.weekly);
  if (config.adminEmail) {
    await NotificationPreference.create({ owner: config.adminEmail });
    await Notification.insertMany(personal.notifications);
  }

  console.log('Seeded DEMO data for trying Product Lab. None of it is real: replace it with your own records.');
  console.log(
    `Business: ${docs.products.length} products, ${docs.ideas.length} ideas, ${docs.experiments.length} experiments, ${docs.creatives.length} creatives, ${docs.metrics.length} metric rows, ${docs.orders.length} orders, ${customerDocs.length} customers.`,
  );
  console.log(
    `Personal: ${personal.goals.length} goals, ${personal.blocks.length} time blocks, ${personal.habits.length} habits (${personal.completions.length} check-ins), ${personal.sessions.length} focus sessions, ${personal.outcomes.length} daily outcomes, ${personal.reviews.length} daily reviews, ${personal.weekly.length} weekly reviews, ${config.adminEmail ? personal.notifications.length : 0} notifications.`,
  );
  await mongoose.disconnect();
}

await main();
