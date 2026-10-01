import {
  ChevronRight,
  CornerDownRight,
  Eye,
  FlaskConical,
  Funnel,
  Info,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageCircleWarning,
  Package,
  PanelsTopLeft,
  Route,
  ShoppingBag,
  Sparkles,
  Square,
  Tag,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
  Wrench,
} from 'lucide-react';
import { LABELS, LEVELS } from '@product-lab/shared/constants';
import { CHART, SERIES, TRACK } from '../../components/charts/palette.js';
import { niceScale } from '../../components/charts/scale.js';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Skeleton, Spinner } from '../../components/ui/States.jsx';
import { fmtCurrency } from '../../lib/format.js';

const some = (items) => items?.length > 0;
const text = 'text-[13px] leading-relaxed';

export function AiNote({ className = '' }) {
  return (
    <p className={`flex items-center gap-1.5 text-xs text-muted ${className}`}>
      <Info className="size-3.5 shrink-0" aria-hidden />
      AI-generated hypotheses, not facts. Check them against your numbers.
    </p>
  );
}

export function AiGenerating({ label }) {
  return (
    <div role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-[13px] text-body">
        <Spinner className="shrink-0" />
        <span>
          Analyzing {label ?? 'the data'}. This can take up to a minute.
        </span>
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="mt-3 h-28" />
    </div>
  );
}

function Block({ title, icon: Icon, children }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Summary({ value }) {
  return value ? <p className="text-[15px] leading-relaxed text-ink">{value}</p> : null;
}

function Fact({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0 rounded-md bg-tint/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </p>
      <p className={`mt-1.5 text-ink ${text}`}>{value}</p>
    </div>
  );
}

function Chips({ items }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="min-w-0 rounded-md bg-tint px-2 py-1 text-[13px] text-body">
          {item}
        </li>
      ))}
    </ul>
  );
}

function Bullets({ items, icon: Icon, tone = 'text-faint' }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className={`flex gap-2 text-body ${text}`}>
          <Icon className={`mt-[3px] size-3.5 shrink-0 ${tone}`} aria-hidden />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Tile({ title, children }) {
  return (
    <div className="min-w-0 rounded-md border border-hairline p-3">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {children}
    </div>
  );
}

function PriceRange({ range, marker }) {
  const values = [range.min, range.max].filter((v) => typeof v === 'number' && v >= 0);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const top = niceScale([Math.max(hi, marker ?? 0) * 1.2]).domain[1];
  const at = (v) => (v / top) * 100;
  const label = lo === hi ? fmtCurrency(lo) : `${fmtCurrency(lo)} – ${fmtCurrency(hi)}`;
  return (
    <div>
      <p className="text-lg font-semibold text-ink">{label}</p>
      <div className="relative mt-3 h-2 rounded-full" style={{ backgroundColor: TRACK }} role="img" aria-label={`Suggested price ${label}`}>
        <div
          className="absolute inset-y-0 rounded-full"
          style={{ left: `${at(lo)}%`, width: `max(${at(hi) - at(lo)}%, 8px)`, backgroundColor: SERIES[0] }}
        />
        {marker != null && (
          <div className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink" style={{ left: `calc(${at(marker)}% - 1px)` }} aria-hidden />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted tabular-nums">
        <span>{fmtCurrency(0)}</span>
        <span>{fmtCurrency(top)}</span>
      </div>
      {marker != null && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <span className="h-3 w-0.5 rounded-full bg-ink" aria-hidden />
          Your expected price {fmtCurrency(marker)}
        </p>
      )}
      {range.rationale && <p className={`mt-2 text-body ${text}`}>{range.rationale}</p>}
    </div>
  );
}

function Confidence({ level }) {
  const n = LEVELS.indexOf(level) + 1;
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="flex items-end gap-0.5" aria-hidden>
        {LEVELS.map((l, i) => (
          <span key={l} className="w-1 rounded-[1px]" style={{ height: 5 + i * 3, backgroundColor: i < n ? SERIES[0] : CHART.grid }} />
        ))}
      </span>
      {LABELS.level[level]} confidence
    </span>
  );
}

function IdeaView({ o, input }) {
  const range = o.priceRange ?? {};
  const hasPrice = [range.min, range.max].some((v) => typeof v === 'number' && v >= 0);
  const risks = [...(o.risks ?? [])].sort((a, b) => LEVELS.indexOf(b.severity) - LEVELS.indexOf(a.severity));
  return (
    <>
      <Summary value={o.summary} />
      {(o.targetAudience || o.problemDesire || o.purchaseMotivation) && (
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          <Fact icon={Users} label="Target audience" value={o.targetAudience} />
          <Fact icon={Target} label="Problem or desire" value={o.problemDesire} />
          <Fact icon={ShoppingBag} label="Purchase motivation" value={o.purchaseMotivation} />
        </div>
      )}
      {(some(o.productFormats) || hasPrice) && (
        <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
          {some(o.productFormats) && (
            <Block title="Possible formats" icon={Package}>
              <Chips items={o.productFormats} />
            </Block>
          )}
          {hasPrice && (
            <Block title="Possible price range" icon={Tag}>
              <PriceRange range={range} marker={input?.idea?.expectedPrice} />
            </Block>
          )}
        </div>
      )}
      {some(o.adAngles) && (
        <Block title="Ad angles" icon={Megaphone}>
          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
            {o.adAngles.map((a, i) => (
              <Tile key={i} title={a.angle}>
                {a.hook && <p className={`mt-1.5 border-l-2 border-accent/60 pl-2 text-body ${text}`}>{a.hook}</p>}
              </Tile>
            ))}
          </div>
        </Block>
      )}
      {o.landingPageAngle && (
        <Block title="Landing page angle" icon={PanelsTopLeft}>
          <p className={`rounded-md bg-tint/60 p-3 text-ink ${text}`}>{o.landingPageAngle}</p>
        </Block>
      )}
      {some(o.objections) && (
        <Block title="Objections" icon={MessageCircleWarning}>
          <ul className="divide-y divide-hairline-soft rounded-md border border-hairline">
            {o.objections.map((x, i) => (
              <li key={i} className="grid grid-cols-1 gap-1 p-3 @2xl:grid-cols-2 @2xl:gap-6">
                <p className={`font-medium text-ink ${text}`}>{x.objection}</p>
                {x.response && (
                  <p className={`flex gap-1.5 text-body ${text}`}>
                    <CornerDownRight className="mt-[3px] size-3.5 shrink-0 text-faint" aria-hidden />
                    <span className="min-w-0">{x.response}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}
      {(some(risks) || some(o.productionConsiderations)) && (
        <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
          {some(risks) && (
            <Block title="Risks" icon={TriangleAlert}>
              <ul className="space-y-2">
                {risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="w-[4.75rem] shrink-0">
                      <StatusBadge kind="level" value={r.severity} />
                    </span>
                    <span className={`min-w-0 text-body ${text}`}>{r.risk}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}
          {some(o.productionConsiderations) && (
            <Block title="Production considerations" icon={Wrench}>
              <Bullets items={o.productionConsiderations} icon={ChevronRight} />
            </Block>
          )}
        </div>
      )}
      {some(o.validationSuggestions) && (
        <Block title="Validation checklist" icon={ListChecks}>
          <Bullets items={o.validationSuggestions} icon={Square} tone="text-muted" />
        </Block>
      )}
    </>
  );
}

function ExperimentView({ o }) {
  const bottleneck = o.bottleneck ?? {};
  return (
    <>
      <Summary value={o.summary} />
      {(bottleneck.stage || bottleneck.detail) && (
        <div className="flex gap-3 rounded-md border border-hairline bg-tint/50 p-3.5">
          <Funnel className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Bottleneck</p>
            {bottleneck.stage && <p className="mt-1 text-sm font-medium text-ink">{bottleneck.stage}</p>}
            {bottleneck.detail && <p className={`mt-0.5 text-body ${text}`}>{bottleneck.detail}</p>}
          </div>
        </div>
      )}
      {(some(o.strongest) || some(o.weakest)) && (
        <div className="grid grid-cols-1 gap-6 @xl:grid-cols-2">
          {some(o.strongest) && (
            <Block title="Strongest" icon={TrendingUp}>
              <Chips items={o.strongest} />
            </Block>
          )}
          {some(o.weakest) && (
            <Block title="Weakest" icon={TrendingDown}>
              <Chips items={o.weakest} />
            </Block>
          )}
        </div>
      )}
      {some(o.observations) && (
        <Block title="Observations" icon={Eye}>
          <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
            {o.observations.map((x, i) => (
              <Tile key={i} title={x.title}>
                {x.detail && <p className={`mt-1 text-body ${text}`}>{x.detail}</p>}
              </Tile>
            ))}
          </div>
        </Block>
      )}
      {some(o.hypotheses) && (
        <Block title="Hypotheses" icon={Sparkles}>
          <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
            {o.hypotheses.map((h, i) => (
              <article key={i} className="min-w-0 rounded-md border border-hairline p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge>
                    <Sparkles className="size-3 text-accent" aria-hidden />
                    AI hypothesis
                  </Badge>
                  <Confidence level={h.confidence} />
                </div>
                <p className={`mt-2 font-medium text-ink ${text}`}>{h.hypothesis}</p>
                {h.rationale && <p className={`mt-1 text-muted ${text}`}>{h.rationale}</p>}
              </article>
            ))}
          </div>
        </Block>
      )}
      {some(o.nextSteps) && (
        <Block title="What to investigate next" icon={ListChecks}>
          <ol className="space-y-3">
            {o.nextSteps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-tint text-[11px] font-semibold text-ink tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className={`font-medium text-ink ${text}`}>{s.action}</p>
                  {s.why && <p className={`text-muted ${text}`}>{s.why}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Block>
      )}
    </>
  );
}

function Step({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </p>
      <p className={`mt-1 text-ink ${text}`}>{value || '—'}</p>
    </div>
  );
}

function ProductView({ o }) {
  return (
    <>
      <Summary value={o.summary} />
      {some(o.insights) && (
        <Block title="Observation → hypothesis → next test" icon={Route}>
          <ol className="space-y-3">
            {o.insights.map((x, i) => (
              <li
                key={i}
                className="grid grid-cols-1 divide-y divide-hairline-soft rounded-md border border-hairline @2xl:grid-cols-3 @2xl:divide-x @2xl:divide-y-0"
              >
                <Step icon={Eye} label="Observation" value={x.observation} />
                <Step icon={Sparkles} label="AI hypothesis" value={x.hypothesis} />
                <Step icon={FlaskConical} label="Next test" value={x.nextTest} />
              </li>
            ))}
          </ol>
        </Block>
      )}
      {(some(o.risks) || some(o.opportunities)) && (
        <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
          {some(o.risks) && (
            <Block title="Risks" icon={TriangleAlert}>
              <Bullets items={o.risks} icon={TriangleAlert} tone="text-warning" />
            </Block>
          )}
          {some(o.opportunities) && (
            <Block title="Opportunities" icon={Lightbulb}>
              <Bullets items={o.opportunities} icon={TrendingUp} tone="text-positive" />
            </Block>
          )}
        </div>
      )}
    </>
  );
}

const VIEWS = { idea: IdeaView, experiment: ExperimentView, product: ProductView };

export function AnalysisView({ analysis, input }) {
  const View = VIEWS[analysis.kind];
  return (
    <div className="space-y-6 @container">
      <View o={analysis.output ?? {}} input={input} />
    </div>
  );
}
