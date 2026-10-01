import { useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useList } from '../../lib/queries.js';
import { GoalFormModal } from './GoalFormModal.jsx';
import { GoalRow } from './GoalParts.jsx';

const LIMIT = 4;

export function GoalsSummary({ className = '' }) {
  const [creating, setCreating] = useState(false);
  const list = useList('goals');
  const goals = list.data?.items ?? [];
  const active = goals.filter((g) => g.status === 'active');
  const top = active.slice(0, LIMIT);

  return (
    <Card className={`flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <CardHeader
        title="Goals"
        subtitle={active.length > LIMIT ? `${LIMIT} of ${active.length} active, nearest target first` : 'Active, nearest target first'}
        actions={
          goals.length > 0 && (
            <ButtonLink to="/goals" size="sm" variant="ghost">
              All goals
            </ButtonLink>
          )
        }
      />
      <div className="mt-3 min-w-0 flex-1">
        {list.isPending ? (
          <div className="space-y-4 pt-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} compact />
        ) : !top.length ? (
          <EmptyState
            compact
            icon={Target}
            title={goals.length ? 'No active goals.' : 'No goals yet.'}
            action={
              <Button size="sm" variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                {goals.length ? 'New goal' : 'Create your first goal'}
              </Button>
            }
          />
        ) : (
          <ul className="-mx-2 space-y-1">
            {top.map((g) => (
              <li key={g._id}>
                <GoalRow goal={g} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <GoalFormModal open={creating} onClose={() => setCreating(false)} />
    </Card>
  );
}
