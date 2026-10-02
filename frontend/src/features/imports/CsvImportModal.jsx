import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, FileSpreadsheet, Upload } from 'lucide-react';
import { Meter } from '../../components/charts/Meter.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Stat } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { api } from '../../lib/api.js';
import { autoMap, parseCsv } from '../../lib/csv.js';
import { DASH, fmtNumber, plural, truncate } from '../../lib/format.js';
import { useForm } from '../../lib/form.js';
import { useList, useMutate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';

const MAX_BYTES = 5 * 1024 * 1024;
const STEPS = ['File', 'Columns', 'Preview', 'Import'];
const SHOWN = 20;
const COUNTS = ['created', 'updated', 'unchanged', 'customersCreated'];
const NONE = { created: 0, updated: 0, unchanged: 0, customersCreated: 0, failed: [], error: null };
const byLine = (a, b) => (a.line ?? Infinity) - (b.line ?? Infinity);

function toChunks(rows, size, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row.body);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const chunks = [[]];
  for (const group of groups.values()) {
    if (chunks.at(-1).length && chunks.at(-1).length + group.length > size) chunks.push([]);
    chunks.at(-1).push(...group);
  }
  return chunks.filter((c) => c.length);
}

function reasonOf(failure, fields) {
  const errors = Object.entries(failure.fields ?? {}).filter(([, message]) => message !== failure.message);
  if (!errors.length) return failure.message;
  return errors
    .map(([key, message]) => {
      const label = fields.find((f) => f.key === key)?.label;
      return label ? `${label}: ${message}` : message;
    })
    .join('; ');
}

function Steps({ current }) {
  return (
    <ol aria-label="Import steps" className="mb-5 flex flex-wrap gap-x-4 gap-y-1">
      {STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? 'step' : undefined}
          className={`flex items-center gap-1.5 text-xs font-medium ${i <= current ? 'text-ink' : 'text-muted'}`}
        >
          <span
            className={`flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums ${i <= current ? 'bg-ink text-canvas' : 'bg-tint'}`}
          >
            {i < current ? <Check className="size-3" aria-hidden /> : i + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function FileDrop({ onFile, error, tip }) {
  const [over, setOver] = useState(false);
  const tone = over ? 'border-accent bg-tint' : error ? 'border-negative' : 'border-hairline hover:bg-tint/50';
  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFile(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center rounded-lg border border-dashed px-4 py-10 text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${tone}`}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-invalid={Boolean(error) || undefined}
          onChange={(e) => {
            onFile(e.target.files[0]);
            e.target.value = '';
          }}
        />
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-tint text-muted">
          <Upload className="size-5" aria-hidden />
        </span>
        <span className="text-sm font-medium text-ink">Choose a CSV file or drop it here</span>
        <span className="mt-1 text-[13px] text-muted">.csv up to 5 MB</span>
      </label>
      {error ? (
        <p className="mt-2 text-xs text-negative" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">{tip}</p>
      )}
    </div>
  );
}

function Summary({ totals, skipped, customers }) {
  const tiles = [
    { label: 'New', value: totals.created, sub: customers ? plural(totals.customersCreated, 'new customer') : null },
    { label: 'Updated', value: totals.updated },
    { label: 'Unchanged', value: totals.unchanged, sub: 'Already imported' },
    { label: 'Not imported', value: totals.failed.length + skipped },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((t) => (
        <Stat key={t.label} label={t.label} value={fmtNumber(t.value)} sub={t.sub} className="rounded-lg bg-tint/60 px-3 py-2.5" />
      ))}
    </div>
  );
}

function RowList({ title, rows }) {
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-medium text-body">{title}</h3>
      <ul className="divide-y divide-hairline-soft rounded-lg border border-hairline text-[13px]">
        {rows.slice(0, SHOWN).map((r, i) => (
          <li
            key={`${r.line}-${i}`}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 px-3 py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <span className="text-muted tabular-nums">{r.line ? `Row ${r.line}` : DASH}</span>
            <span className="truncate text-ink">{r.label || DASH}</span>
            <span className="col-start-2 text-muted sm:col-start-auto">{r.reason}</span>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && <p className="mt-1.5 text-xs text-muted">and {plural(rows.length - SHOWN, 'more row')}</p>}
    </section>
  );
}

function ImportDialog({ config, defaults, onClose }) {
  const { timezone } = useSettings().data;
  const products = useList('products', { sort: 'name' });
  const form = useForm(() => ({ productId: defaults?.productId ?? '', ...config.initialOptions(defaults), map: {} }));
  const [step, setStep] = useState(0);
  const [table, setTable] = useState(null);
  const [fileError, setFileError] = useState('');
  const [plan, setPlan] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stopping, setStopping] = useState(false);
  const stopped = useRef(false);
  const body = useRef(null);
  const productItems = products.data?.items ?? [];
  const [noun, nouns] = config.noun;

  useEffect(() => {
    if (step) body.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    const block = (e) => e.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  async function send(target, dryRun) {
    const total = { ...NONE, failed: [] };
    let sent = 0;
    for (const chunk of target.chunks) {
      if (!dryRun && stopped.current) break;
      try {
        const res = await api(config.endpoint, { method: 'POST', body: { ...target.envelope, dryRun, rows: chunk.map((r) => r.body) } });
        for (const key of COUNTS) total[key] += res[key] ?? 0;
        for (const f of res.failed) {
          const row = chunk[f.row];
          total.failed.push({ line: row?.line, label: row?.label ?? f.externalId ?? DASH, reason: reasonOf(f, config.fields) });
        }
      } catch (error) {
        if (dryRun) throw error;
        total.error = error;
        break;
      }
      sent += chunk.length;
      if (!dryRun) setProgress(sent);
    }
    return total;
  }

  const check = useMutation({ mutationFn: (target) => send(target, true) });
  const run = useMutate((target) => send(target, false));

  useEffect(() => {
    if (!run.isPending) return;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [run.isPending]);

  async function readFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return setFileError('Choose a .csv file.');
    if (file.size > MAX_BYTES) return setFileError('This file is larger than 5 MB. Export a shorter date range.');
    let parsed;
    try {
      parsed = parseCsv(await file.text());
    } catch {
      return setFileError('Couldn’t read this file. Export it again and retry.');
    }
    if (!parsed.rows.length) return setFileError('This file has no rows below the header.');
    const live = productItems.filter((p) => p.status !== 'killed');
    form.setValues((v) => ({
      ...v,
      productId: v.productId || (live.length === 1 ? live[0]._id : ''),
      map: autoMap(parsed.headers, config.fields),
    }));
    form.setErrors({});
    setTable({ name: file.name, ...parsed });
    setFileError('');
    setStep(1);
  }

  function preview() {
    const v = form.values;
    const errors = {};
    if (!v.productId) errors.productId = 'Choose a product';
    for (const f of config.fields) if (f.required && !v.map[f.key]) errors[`map.${f.key}`] = 'Choose the column that holds this';
    if (Object.keys(errors).length) return form.serverErrors({ fields: errors });
    const mapped = new Set(config.fields.filter((f) => v.map[f.key]).map((f) => f.key));
    const records = table.rows.map((cells, i) => ({
      line: i + 2,
      values: Object.fromEntries(config.fields.map((f) => [f.key, mapped.has(f.key) ? (cells[v.map[f.key]] ?? '').trim() : ''])),
    }));
    const built = config.build(records, { product: productItems.find((p) => p._id === v.productId), options: v, timezone, mapped });
    const next = { ...built, chunks: toChunks(built.rows, config.chunkSize, config.groupKey), envelope: config.envelope(v) };
    setPlan(next);
    setStep(2);
    check.reset();
    if (next.chunks.length) check.mutate(next);
  }

  function startImport() {
    stopped.current = false;
    setProgress(0);
    setStep(3);
    run.mutate(plan);
  }

  function restart() {
    run.reset();
    check.reset();
    setPlan(null);
    setTable(null);
    setStep(0);
  }

  const totals = plan && (plan.chunks.length ? check.data : NONE);
  const changes = totals ? totals.created + totals.updated : 0;
  const notImported = (result) => [...(plan?.skipped ?? []), ...result.failed].sort(byLine);
  const sample = (index) =>
    table.rows
      .slice(0, 50)
      .find((r) => r[index]?.trim())
      ?.[index].trim();
  const hintFor = (f) => {
    const index = form.values.map[f.key];
    if (!index) return f.hint;
    const value = sample(index);
    return value ? `e.g. ${truncate(value, 40)}` : 'Empty in the first rows';
  };
  const requestClose = () => (run.isPending ? setStopping(true) : onClose());
  const submit = () => (step === 1 ? preview() : step === 2 && changes ? startImport() : undefined);

  const footers = [
    <Button key="cancel" onClick={onClose}>
      Cancel
    </Button>,
    <>
      <Button onClick={restart}>Change file</Button>
      <Button type="submit" variant="primary" disabled={!productItems.length}>
        Preview
      </Button>
    </>,
    <>
      <Button onClick={() => setStep(1)}>Back</Button>
      <Button type="submit" variant="primary" loading={check.isPending} disabled={!changes}>
        {!totals ? 'Import' : changes ? `Import ${plural(changes, noun, nouns)}` : 'Nothing to import'}
      </Button>
    </>,
    run.isPending ? (
      <Button onClick={() => setStopping(true)}>Stop import</Button>
    ) : (
      <>
        <Button onClick={restart}>Import another file</Button>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </>
    ),
  ];

  return (
    <Modal
      open
      onClose={requestClose}
      title={config.title}
      description={config.description}
      size="lg"
      onSubmit={submit}
      footer={footers[step]}
    >
      <Steps current={run.data && !run.data.error ? STEPS.length : step} />
      <div ref={body} tabIndex={-1} className="space-y-5 focus:outline-none">
        {step === 0 && (
          <FileDrop
            onFile={readFile}
            error={fileError}
            tip={`${config.tip ?? ''} Needs columns for ${config.fields
              .filter((f) => f.required)
              .map((f) => f.label)
              .join(', ')}.`.trim()}
          />
        )}

        {step === 1 && (
          <>
            <p className="flex min-w-0 items-center gap-2 text-[13px]">
              <FileSpreadsheet className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="truncate font-medium text-ink">{table.name}</span>
              <span className="shrink-0 text-muted">{plural(table.rows.length, 'row')}</span>
            </p>
            <section>
              <h3 className="mb-3 text-[13px] font-semibold text-ink">Import into</h3>
              {products.error && !productItems.length ? (
                <ErrorState error={products.error} onRetry={products.refetch} compact />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    form={form}
                    name="productId"
                    label="Product"
                    as="select"
                    required
                    disabled={products.isPending}
                    hint={products.isSuccess && !productItems.length ? 'Add a product on the Products page first' : undefined}
                    placeholder="Choose a product"
                    options={productItems.map((p) => ({ value: p._id, label: p.status === 'killed' ? `${p.name} (killed)` : p.name }))}
                    onChange={(e) => {
                      form.set('productId', e.target.value);
                      form.set('experimentId', '');
                    }}
                  />
                  <config.Options form={form} />
                </div>
              )}
            </section>
            <section>
              <h3 className="text-[13px] font-semibold text-ink">Columns</h3>
              <p className="mt-0.5 mb-3 text-[13px] text-muted">Matched from the file’s headers. Change any that are wrong.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {config.fields.map((f) => (
                  <FormField
                    key={f.key}
                    form={form}
                    name={`map.${f.key}`}
                    label={f.label}
                    required={f.required}
                    as="select"
                    placeholder="Not in file"
                    options={table.headers.map((h, i) => ({ value: String(i), label: h }))}
                    hint={hintFor(f)}
                  />
                ))}
              </div>
            </section>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-[13px] text-muted">
              {table.name} checked against what is already in Product Lab. Nothing is saved until you import.
            </p>
            <div aria-live="polite" aria-busy={check.isPending} className="space-y-5">
              {totals ? (
                <Summary totals={totals} skipped={plan.skipped.length} customers={config.customers} />
              ) : check.error ? (
                <ErrorState error={check.error} onRetry={() => check.mutate(plan)} compact />
              ) : (
                <Skeleton className="h-20" />
              )}
              {totals && !changes && (
                <p className="text-[13px] text-body">
                  {totals.unchanged ? 'Everything in this file is already in Product Lab.' : 'No row in this file can be imported.'}
                </p>
              )}
            </div>
            {totals && notImported(totals).length > 0 && <RowList title="Won’t be imported" rows={notImported(totals)} />}
            {plan.rows.length > 0 && (
              <section>
                <h3 className="mb-2 text-[13px] font-medium text-body">First rows</h3>
                <div className="rounded-lg border border-hairline">
                  <DataTable
                    dense
                    rowKey="line"
                    columns={config.columns}
                    rows={plan.rows.slice(0, 5).map((r) => ({ line: r.line, ...r.body }))}
                  />
                </div>
              </section>
            )}
          </>
        )}

        {step === 3 && (
          <div aria-live="polite" className="space-y-5">
            {run.data ? (
              <>
                <Summary totals={run.data} skipped={plan.skipped.length} customers={config.customers} />
                {run.data.error && (
                  <p className="rounded-lg border border-negative/30 px-3 py-2.5 text-[13px] text-body" role="alert">
                    <span className="font-medium text-negative">Import stopped: {run.data.error.message.replace(/\.?$/, '.')}</span>{' '}
                    {plural(plan.rows.length - progress, 'row')} not sent. Import the same file again to finish; nothing is duplicated.
                  </p>
                )}
                {notImported(run.data).length > 0 && <RowList title="Not imported" rows={notImported(run.data)} />}
              </>
            ) : (
              <div className="py-4">
                <Meter
                  value={progress}
                  max={plan.rows.length}
                  label="Importing…"
                  valueLabel={`${fmtNumber(progress)} of ${plural(plan.rows.length, 'row')}`}
                />
                <p className="mt-3 text-[13px] text-muted">Keep this window open until the import finishes.</p>
              </div>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={stopping}
        onClose={() => setStopping(false)}
        onConfirm={() => {
          stopped.current = true;
          onClose();
        }}
        title="Stop the import?"
        message="Rows already sent stay imported. Import the same file again later to finish; nothing is duplicated."
        confirmLabel="Stop import"
      />
    </Modal>
  );
}

export function CsvImportModal({ open, ...props }) {
  return open ? <ImportDialog {...props} /> : null;
}
