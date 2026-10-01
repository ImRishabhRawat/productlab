import * as analytics from '../services/analytics.js';
import { recentActivity } from '../services/timeline.js';

const range = (f) => (f.from && f.to && f.from > f.to ? { ...f, from: f.to, to: f.from } : f);

export const summary = async (req, res) => res.json(await analytics.summaryWithCompare(range(req.filters)));
export const timeseries = async (req, res) => res.json(await analytics.timeseries(range(req.filters)));
export const products = async (req, res) => res.json({ items: await analytics.productPerformance(range(req.filters)) });
export const experiments = async (req, res) => res.json({ items: await analytics.experimentPerformance(range(req.filters)) });
export const creatives = async (req, res) => res.json({ items: await analytics.creativePerformance(range(req.filters)) });
export const lifecycle = async (req, res) => res.json(await analytics.lifecycle());
export const scaling = async (req, res) => res.json({ items: await analytics.scaling() });
export const graveyard = async (req, res) => res.json(await analytics.graveyard());
export const orders = async (req, res) => res.json(await analytics.orderAnalytics(range(req.filters)));
export const customers = async (req, res) => res.json(await analytics.customerAnalytics(range(req.filters)));
export const activity = async (req, res) => res.json({ items: await recentActivity(Math.min(req.filters.limit ?? 12, 50)) });
