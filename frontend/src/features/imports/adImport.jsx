import { IMPORT_MODES, LABELS, METRIC_FIELDS, METRIC_IMPORT_MAX_ROWS, METRICS } from '@product-lab/shared/constants';
import { todayIn } from '@product-lab/shared/dates';
import { round } from '@product-lab/shared/metrics';
import { FormField } from '../../components/ui/Field.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { parseDate, parseNumber } from '../../lib/csv.js';
import { choices, fmtDate, fmtRange, plural } from '../../lib/format.js';
import { metricColumn, moneyColumn } from '../../lib/metricDisplay.js';
import { useList } from '../../lib/queries.js';

const MODES = choices(IMPORT_MODES, LABELS.importMode);
const MODE_LABEL = 'Rows already imported';

const FIELDS = [
  { key: 'date', label: 'Day', required: true, synonyms: ['day', 'date', 'reportingstarts', 'startdate'] },
  { key: 'until', label: 'Reporting ends', synonyms: ['reportingends', 'enddate'], hint: 'Used to skip rows that cover several days' },
  { key: 'campaign', label: 'Campaign', synonyms: ['campaignname', 'campaign'] },
  { key: 'adSet', label: 'Ad set', synonyms: ['adsetname', 'adset'] },
  { key: 'spend', label: 'Amount spent', required: true, money: true, synonyms: ['amountspent', 'spend', 'cost'] },
  { key: 'impressions', label: 'Impressions', synonyms: ['impressions'] },
  { key: 'reach', label: 'Reach', synonyms: ['reach'] },
  { key: 'clicks', label: 'Link clicks', synonyms: ['linkclicks', 'clicks'] },
  { key: 'landingPageViews', label: 'Landing page views', synonyms: ['landingpageviews', 'websitelandingpageviews'] },
  {
    key: 'checkouts',
    label: 'Checkouts initiated',
    synonyms: ['checkoutsinitiated', 'websitecheckoutsinitiated', 'initiatecheckout', 'checkouts'],
  },
  {
    key: 'purchases',
    label: 'Purchases',
    synonyms: ['purchases', 'websitepurchases'],
    hint: 'Without it, Results of purchase rows are used',
  },
  {
    key: 'revenue',
    label: 'Purchase value',
    money: true,
    synonyms: ['purchasesconversionvalue', 'purchaseconversionvalue', 'websitepurchasesconversionvalue', 'conversionvalue', 'revenue'],
  },
  { key: 'results', label: 'Results', synonyms: ['results'], hint: 'Used when Purchases is not in the file' },
  {
    key: 'resultType',
    label: 'Result indicator',
    synonyms: ['resultindicator', 'resulttype'],
    hint: 'Results count only on purchase rows',
  },
];
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));
const keyOf = (row) => JSON.stringify([row.date, row.campaign ?? '', row.adSet ?? '']);

function build(records, { timezone, mapped }) {
  const rows = [];
  const skipped = [];
  const fromResults = !mapped.has('purchases') && mapped.has('results');
  const metrics = METRIC_FIELDS.filter((k) => mapped.has(k) || (k === 'purchases' && fromResults));
  const names = { ...LABEL, ...(fromResults && { purchases: LABEL.results }) };
  const today = todayIn(timezone);
  for (const { line, values } of records) {
    const v = fromResults ? { ...values, purchases: /purchase/i.test(values.resultType) ? values.results : '' } : values;
    const date = parseDate(v.date, timezone);
    const until = v.until ? parseDate(v.until, timezone) : date;
    const numbers = Object.fromEntries(metrics.map((k) => [k, v[k] === '' ? 0 : parseNumber(v[k])]));
    const invalid = metrics.find((k) => numbers[k] == null || numbers[k] < 0);
    const label = [v.date, v.campaign, v.adSet].filter(Boolean).join(' · ');
    const reason = [
      [mapped.has('campaign') && !v.campaign, 'No campaign name (summary row)'],
      [!v.date, 'Missing day'],
      [!date, `Unrecognised date “${v.date}”`],
      [!until, `Unrecognised end date “${v.until}”`],
      [date > today, 'Date is in the future: check the day/month order'],
      [until !== date, `Covers ${fmtRange({ from: date, to: until })}, not one day. Export with Breakdown › By time › Day`],
      [invalid, `${names[invalid]} “${v[invalid]}” is not a number`],
    ].find(([hit]) => hit)?.[1];
    if (reason) {
      skipped.push({ line, label, reason });
      continue;
    }
    rows.push({
      line,
      label,
      body: {
        date,
        ...(v.campaign && { campaign: v.campaign }),
        ...(v.adSet && { adSet: v.adSet }),
        ...Object.fromEntries(metrics.map((k) => [k, METRICS[k].format === 'currency' ? round(numbers[k]) : Math.round(numbers[k])])),
      },
    });
  }
  const days = new Set(rows.map((r) => keyOf(r.body))).size;
  const merged = `${plural(rows.length, 'file row')} become ${plural(days, 'daily row')}`;
  return { rows, skipped, note: days < rows.length ? `Rows sharing a day, campaign and ad set are added together: ${merged}.` : null };
}

function Options({ form }) {
  const { productId, mode } = form.values;
  const experiments = useList('experiments', { productId }, { enabled: Boolean(productId) });
  return (
    <>
      <FormField
        form={form}
        name="experimentId"
        label="Experiment"
        as="select"
        disabled={!productId || experiments.isPlaceholderData}
        placeholder="No experiment"
        options={(experiments.data?.items ?? []).map((x) => ({ value: x._id, label: x.name }))}
      />
      <div className="sm:col-span-2">
        <p className="mb-1.5 text-[13px] font-medium text-body" aria-hidden>
          {MODE_LABEL}
        </p>
        <SegmentedControl label={MODE_LABEL} options={MODES} value={mode} onChange={(next) => form.set('mode', next)} />
      </div>
    </>
  );
}

const columns = [
  { key: 'date', header: 'Day', className: 'whitespace-nowrap', format: (v) => fmtDate(v, { year: true }) },
  { key: 'campaign', header: 'Campaign', render: (r) => <div className="max-w-52 truncate">{r.campaign}</div> },
  { key: 'adSet', header: 'Ad set', render: (r) => <div className="max-w-44 truncate">{r.adSet}</div> },
  moneyColumn('spend', 'Spend'),
  metricColumn('purchases'),
  moneyColumn('revenue', 'Revenue'),
].map((c) => ({ ...c, sortable: false }));

export const AD_IMPORT = {
  title: 'Import ad results',
  description: 'From Meta Ads Manager. Rows are matched by experiment, day, campaign and ad set, so re-importing never duplicates them.',
  tip: 'In Ads Manager, export the table as .csv with Breakdown › By time › Day.',
  endpoint: '/metrics/import',
  chunkSize: METRIC_IMPORT_MAX_ROWS,
  noun: ['daily row', 'daily rows'],
  customers: false,
  fields: FIELDS,
  initialOptions: (defaults) => ({ experimentId: defaults?.experimentId ?? '', mode: 'replace' }),
  envelope: ({ productId, experimentId, mode, map }) => ({
    productId,
    experimentId: experimentId || null,
    mode,
    columns: METRIC_FIELDS.filter((k) => map[k] || (k === 'purchases' && map.results)),
  }),
  groupKey: keyOf,
  build,
  columns,
  Options,
};
