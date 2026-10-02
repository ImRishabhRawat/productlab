import { isISODate, isoDateIn } from '@product-lab/shared/dates';

export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    if (record.some((v) => v.trim())) records.push(record);
    record = [];
  };
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') field += text[i++];
      else quoted = false;
    } else if (c === '"' && !field) quoted = true;
    else if (c === ',') endField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRecord();
    } else field += c;
  }
  if (field || record.length) endRecord();
  const [head = [], ...rows] = records;
  return { headers: head.map((h, i) => h.trim() || `Column ${i + 1}`), rows };
}

export function parseNumber(value) {
  const cleaned = String(value ?? '')
    .replace(/[a-z]+\.?/gi, '')
    .replace(/[^\d.-]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}:?\d{2})$/i;
const YMD = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ]\d{1,2}:\d{2}.*)?$/;
const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[T ]\d{1,2}:\d{2}.*)?$/;

export function parseInstant(value) {
  const m = String(value ?? '')
    .trim()
    .match(DATE_TIME);
  if (!m) return null;
  const zone = m[3].toUpperCase() === 'Z' ? 'Z' : m[3].replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2');
  const date = new Date(`${m[1]}T${m[2]}${zone}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseDate(value, timeZone) {
  const text = String(value ?? '').trim();
  const instant = parseInstant(text);
  if (instant) return isoDateIn(instant, timeZone);
  const ymd = text.match(YMD);
  const dmy = text.match(DMY);
  const [y, m, d] = ymd ? ymd.slice(1) : dmy ? [dmy[3], dmy[2], dmy[1]] : [];
  const iso = y ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '';
  return isISODate(iso) ? iso : null;
}

export const headerCurrency = (header) => header.match(/\(([A-Z]{3})\)/)?.[1] ?? null;

const headerKey = (header) =>
  header
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');

export function autoMap(headers, fields) {
  const keys = headers.map(headerKey);
  const used = new Set();
  return Object.fromEntries(
    fields.map((f) => {
      const index = f.synonyms.map((s) => keys.findIndex((k, i) => k === s && !used.has(i))).find((i) => i >= 0) ?? -1;
      used.add(index);
      return [f.key, index >= 0 ? String(index) : ''];
    }),
  );
}
