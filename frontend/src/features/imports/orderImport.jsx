import { LABELS, ORDER_IMPORT_MAX_ROWS } from '@product-lab/shared/constants';
import { todayIn } from '@product-lab/shared/dates';
import { round } from '@product-lab/shared/metrics';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { FormField, Switch } from '../../components/ui/Field.jsx';
import { parseDate, parseInstant, parseNumber } from '../../lib/csv.js';
import { choices, fmtCurrency, fmtDate } from '../../lib/format.js';
import { ItemChips } from '../orders/OrderParts.jsx';

const TEST_BELOW = 10;
const EXTRA_KINDS = choices(['bundle', 'bump', 'upsell'], LABELS.orderItemKind);
const KIND_KEY = 'product-lab.import-extra-kind';
const PAYMENT = {
  paid: 'paid',
  success: 'paid',
  successful: 'paid',
  captured: 'paid',
  completed: 'paid',
  pending: 'pending',
  created: 'pending',
  attempted: 'pending',
  initiated: 'pending',
  failed: 'failed',
  refunded: 'refunded',
};

const FIELDS = [
  {
    key: 'externalId',
    label: 'Order ID',
    required: true,
    synonyms: ['orderid', 'ordernumber', 'orderno', 'order', 'id', 'paymentid', 'transactionid'],
  },
  { key: 'email', label: 'Email', required: true, synonyms: ['email', 'emailaddress', 'customeremail', 'buyeremail', 'emailid'] },
  { key: 'name', label: 'Name', synonyms: ['name', 'customername', 'fullname', 'buyername', 'billingname', 'customer'] },
  { key: 'phone', label: 'Phone', synonyms: ['mobile', 'phone', 'phonenumber', 'mobilenumber', 'contactnumber', 'contact', 'whatsapp'] },
  {
    key: 'amount',
    label: 'Amount',
    required: true,
    money: true,
    synonyms: ['amount', 'total', 'ordertotal', 'totalamount', 'amountpaid', 'grandtotal'],
  },
  { key: 'currency', label: 'Currency', synonyms: ['currency', 'currencycode'], hint: 'Used to skip orders in another currency' },
  {
    key: 'products',
    label: 'Products',
    synonyms: ['products', 'items', 'product', 'productname', 'productnames', 'lineitems'],
    hint: 'Names the add-ons, separated by “|”',
  },
  {
    key: 'paymentStatus',
    label: 'Payment status',
    required: true,
    synonyms: ['paymentstatus', 'status', 'orderstatus', 'financialstatus'],
  },
  {
    key: 'createdAt',
    label: 'Created at',
    required: true,
    synonyms: ['createdat', 'orderdate', 'date', 'createdon', 'created', 'orderedat'],
  },
  { key: 'paidAt', label: 'Paid at', synonyms: ['paidat', 'paymentdate', 'paidon', 'capturedat'], hint: 'Used as the date of paid orders' },
  { key: 'campaign', label: 'Campaign', synonyms: ['campaign', 'utmcampaign', 'campaignname'] },
];

function storedKind() {
  try {
    const kind = localStorage.getItem(KIND_KEY);
    return EXTRA_KINDS.some((k) => k.value === kind) ? kind : 'bundle';
  } catch {
    return 'bundle';
  }
}

function rememberKind(kind) {
  try {
    localStorage.setItem(KIND_KEY, kind);
  } catch {
    /* storage unavailable */
  }
}

function orderItems(amount, listed, product, kind) {
  if (amount <= product.price) return [{ kind: 'main', name: product.name, amount }];
  const named = listed
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(1);
  const extras = named.length ? named : ['Add-on'];
  const rest = round(amount - product.price);
  const share = round(rest / extras.length);
  return [
    { kind: 'main', name: product.name, amount: product.price },
    ...extras.map((name, i) => ({ kind, name, amount: i < extras.length - 1 ? share : round(rest - share * (extras.length - 1)) })),
  ];
}

function build(records, { product, options, timezone, currency }) {
  const rows = [];
  const skipped = [];
  const seen = new Set();
  const today = todayIn(timezone);
  const inFuture = (date) => (date.includes('T') ? new Date(date).getTime() > Date.now() + 5 * 60_000 : date > today);
  for (const { line, values: v } of records) {
    const amount = parseNumber(v.amount);
    const status = PAYMENT[v.paymentStatus.toLowerCase()];
    const when = (status === 'paid' || status === 'refunded' ? v.paidAt : '') || v.createdAt;
    const date = parseInstant(when) ?? parseDate(when, timezone);
    const reason = [
      [!v.externalId, 'Missing order ID'],
      [!v.amount, 'Missing amount'],
      [amount == null, `Amount “${v.amount}” is not a number`],
      [v.currency && v.currency.toUpperCase() !== currency, `Currency ${v.currency}, not ${currency}`],
      [options.skipTests && amount < TEST_BELOW, `Test order below ${fmtCurrency(TEST_BELOW)}`],
      [!v.paymentStatus, 'Missing payment status'],
      [!status, `Unknown payment status “${v.paymentStatus}”`],
      [!when, 'Missing date'],
      [!date, `Unrecognised date “${when}”`],
      [date && inFuture(date), 'Date is in the future: check the day/month order'],
      [!v.email, 'Missing email'],
      [seen.has(v.externalId), 'Duplicate order ID in this file'],
    ].find(([hit]) => hit)?.[1];
    if (reason) {
      skipped.push({ line, label: v.externalId || v.email || '', reason });
      continue;
    }
    seen.add(v.externalId);
    rows.push({
      line,
      label: v.externalId,
      body: {
        externalId: v.externalId,
        date,
        email: v.email.toLowerCase(),
        ...(v.name && { name: v.name }),
        ...(v.phone && { phone: v.phone }),
        items: orderItems(amount, v.products, product, options.extraKind),
        paymentStatus: status === 'refunded' ? 'paid' : status,
        ...(status === 'refunded' && { refundStatus: 'full' }),
        ...(v.campaign && { campaign: v.campaign }),
      },
    });
  }
  return { rows, skipped };
}

function Options({ form }) {
  return (
    <>
      <FormField
        form={form}
        name="extraKind"
        label="Extra items count as"
        as="select"
        options={EXTRA_KINDS}
        onChange={(e) => {
          form.set('extraKind', e.target.value);
          rememberKind(e.target.value);
        }}
      />
      <Switch className="sm:col-span-2" checked={form.values.skipTests} onChange={(on) => form.set('skipTests', on)}>
        Skip test orders below {fmtCurrency(TEST_BELOW)}
      </Switch>
    </>
  );
}

const columns = [
  { key: 'externalId', header: 'Order ID', className: 'whitespace-nowrap' },
  { key: 'date', header: 'Date', className: 'whitespace-nowrap', format: (v) => fmtDate(v) },
  { key: 'email', header: 'Customer', render: (r) => <div className="max-w-32 truncate">{r.name || r.email}</div> },
  { key: 'items', header: 'Items', render: (r) => <ItemChips items={r.items} /> },
  { key: 'amount', header: 'Amount', align: 'right', render: (r) => fmtCurrency(round(r.items.reduce((s, i) => s + i.amount, 0))) },
  { key: 'paymentStatus', header: 'Payment', render: (r) => <StatusBadge kind="paymentStatus" value={r.paymentStatus} /> },
].map((c) => ({ ...c, sortable: false }));

export const ORDER_IMPORT = {
  title: 'Import orders',
  description: 'From your store’s CSV export. Orders are matched by order ID, so re-importing never duplicates them.',
  endpoint: '/orders/import',
  chunkSize: ORDER_IMPORT_MAX_ROWS,
  noun: ['order', 'orders'],
  customers: true,
  fields: FIELDS,
  initialOptions: () => ({ extraKind: storedKind(), skipTests: true }),
  envelope: ({ productId }) => ({ productId }),
  groupKey: (row) => row.email,
  build,
  columns,
  Options,
};
