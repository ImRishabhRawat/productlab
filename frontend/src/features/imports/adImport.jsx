import { METRIC_FIELDS } from '@product-lab/shared/constants';
import { round } from '@product-lab/shared/metrics';
import { FormField } from '../../components/ui/Field.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { parseDate, parseNumber } from '../../lib/csv.js';
import { fmtDate } from '../../lib/format.js';
import { metricColumn, moneyColumn } from '../../lib/metricDisplay.js';
import { useList } from '../../lib/queries.js';

const MONEY = ['spend', 'revenue'];
const MODES = [
  { value: 'replace', label: 'Replace with the file' },
  { value: 'skip', label: 'Keep what is recorded' },
];

const FIELDS = [
  { key: 'date', label: 'Day', required: true, synonyms: ['day', 'date', 'reportingstarts', 'startdate'] },
  { key: 'campaign', label: 'Campaign', synonyms: ['campaignname', 'campaign'] },
  { key: 'adSet', label: 'Ad set', synonyms: ['adsetname', 'adset'] },
  { key: 'spend', label: 'Amount spent', required: true, synonyms: ['amountspent', 'spend', 'cost'] },
  { key: 'impressions', label: 'Impressions', synonyms: ['impressions'] },
  { key: 'reach', label: 'Reach', synonyms: ['reach'] },
  { key: 'clicks', label: 'Link clicks', synonyms: ['linkclicks', 'clicks'] },
  { key: 'landingPageViews', label: 'Landing page views', synonyms: ['landingpageviews', 'websitelandingpageviews'] },
  {
    key: 'checkouts',
    label: 'Checkouts initiated',
    synonyms: ['checkoutsinitiated', 'websitecheckoutsinitiated', 'initiatecheckout', 'checkouts'],
  },
  { key: 'purchases', label: 'Purchases', synonyms: ['purchases', 'websitepurchases', 'results'] },
  {
    key: 'revenue',
    label: 'Purchase value',
    synonyms: ['purchasesconversionvalue', 'purchaseconversionvalue', 'websitepurchasesconversionvalue', 'conversionvalue', 'revenue'],
  },
];
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

function build(records, { timezone, mapped }) {
  const rows = [];
  const skipped = [];
  const metrics = METRIC_FIELDS.filter((k) => mapped.has(k));
  for (const { line, values: v } of records) {
    const date = parseDate(v.date, timezone);
    const numbers = Object.fromEntries(metrics.map((k) => [k, v[k] === '' ? 0 : parseNumber(v[k])]));
    const invalid = metrics.find((k) => numbers[k] == null || numbers[k] < 0);
    const label = [v.date, v.campaign, v.adSet].filter(Boolean).join(' · ');
    const reason = [
      [mapped.has('campaign') && !v.campaign, 'No campaign name (summary row)'],
      [!v.date, 'Missing day'],
      [!date, `Unrecognised date “${v.date}”`],
      [invalid, `${LABEL[invalid]} “${v[invalid]}” is not a number`],
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
        ...Object.fromEntries(metrics.map((k) => [k, MONEY.includes(k) ? round(numbers[k]) : Math.round(numbers[k])])),
      },
    });
  }
  return { rows, skipped };
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
          Days already recorded
        </p>
        <SegmentedControl label="Days already recorded" options={MODES} value={mode} onChange={(next) => form.set('mode', next)} />
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
  description: 'From a Meta Ads Manager export with a daily breakdown. Days already recorded are matched, never duplicated.',
  tip: 'In Ads Manager, choose Breakdown › By time › Day before exporting.',
  endpoint: '/metrics/import',
  chunkSize: 2000,
  noun: ['row', 'rows'],
  customers: false,
  fields: FIELDS,
  initialOptions: (defaults) => ({ experimentId: defaults?.experimentId ?? '', mode: 'replace' }),
  envelope: ({ productId, experimentId, mode }) => ({ productId, experimentId: experimentId || null, mode }),
  groupKey: (row) => [row.date, row.campaign ?? '', row.adSet ?? ''].join('|'),
  build,
  columns,
  Options,
};
