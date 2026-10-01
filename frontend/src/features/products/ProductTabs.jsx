import { TabLinks } from '../../components/ui/Tabs.jsx';
import { useAnalytics } from '../../lib/queries.js';

export function ProductTabs() {
  const stages = useAnalytics('lifecycle').data?.stages;
  const count = (status) => stages?.find((s) => s.status === status)?.products;
  return (
    <TabLinks
      className="mb-5"
      tabs={[
        { to: '/products', label: 'All products', count: stages?.reduce((n, s) => n + s.products, 0) },
        { to: '/products/scaling', label: 'Scaling', count: count('scaling') },
        { to: '/products/graveyard', label: 'Graveyard', count: count('killed') },
      ]}
    />
  );
}
