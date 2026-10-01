export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const badRequest = (message, fields) => new HttpError(400, message, fields);
export const conflict = (message) => new HttpError(409, message);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const searchRegex = (q) => new RegExp(escapeRegex(q), 'i');

export function sortSpec(sort, allowed, fallback) {
  if (!sort) return fallback;
  const key = sort.replace(/^-/, '');
  if (!allowed.includes(key)) return fallback;
  return { [key]: sort.startsWith('-') ? -1 : 1, _id: -1 };
}

export const idMap = (docs) => new Map(docs.map((d) => [String(d._id), d]));
