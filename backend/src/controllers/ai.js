import AIAnalysis from '../models/AIAnalysis.js';
import { analyze as runAnalysis } from '../services/ai/analyze.js';
import { aiStatus } from '../services/ai/gemini.js';
import { notFound } from '../utils/http.js';

export const status = (req, res) => res.json(aiStatus());

export async function list(req, res) {
  const { kind, targetId, limit = 50 } = req.filters;
  const filter = {};
  if (kind) filter.kind = kind;
  if (targetId) filter.targetId = targetId;
  const items = await AIAnalysis.find(filter).select('-input').sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  res.json({ items });
}

export async function get(req, res) {
  const analysis = await AIAnalysis.findById(req.params.id).lean();
  if (!analysis) throw notFound('Analysis');
  res.json(analysis);
}

export async function analyze(req, res) {
  res.status(201).json(await runAnalysis(req.body));
}

export async function remove(req, res) {
  const analysis = await AIAnalysis.findByIdAndDelete(req.params.id);
  if (!analysis) throw notFound('Analysis');
  res.status(204).end();
}
