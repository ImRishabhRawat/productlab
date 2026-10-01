import { productivitySeries, todaySummary } from '../services/productivity.js';

export const today = async (req, res) => res.json(await todaySummary());
export const series = async (req, res) => res.json(await productivitySeries(req.filters));
