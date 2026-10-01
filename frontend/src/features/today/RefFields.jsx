import { FormField } from '../../components/ui/Field.jsx';
import { useList } from '../../lib/queries.js';

export function useRefs(productId) {
  const goals = useList('goals');
  const products = useList('products', { sort: 'name' });
  const experiments = useList('experiments', { productId }, { enabled: Boolean(productId) });
  return {
    goals: goals.data?.items ?? [],
    products: products.data?.items ?? [],
    experiments: (experiments.data?.items ?? []).filter((x) => String(x.productId) === String(productId)),
    errors: { goals: goals.error, products: products.error },
  };
}

export const goalOptions = (goals, selectedId) =>
  goals.filter((g) => g.status === 'active' || g._id === selectedId).map((g) => ({ value: g._id, label: g.title }));

export const productOptions = (products, selectedId) =>
  products.filter((p) => p.status !== 'killed' || p._id === selectedId).map((p) => ({ value: p._id, label: p.name }));

export function RefFields({ form, refs: { goals, products, experiments } }) {
  const { goalId, productId } = form.values;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormField
        form={form}
        name="goalId"
        label="Goal"
        as="select"
        placeholder="No goal"
        options={goalOptions(goals, goalId)}
        className="sm:col-span-2"
      />
      <FormField
        form={form}
        name="productId"
        label="Product"
        as="select"
        placeholder="No product"
        options={productOptions(products, productId)}
        onChange={(e) => form.setValues((v) => ({ ...v, productId: e.target.value, experimentId: '' }))}
      />
      <FormField
        form={form}
        name="experimentId"
        label="Experiment"
        as="select"
        disabled={!productId}
        placeholder={productId ? 'No experiment' : 'Pick a product first'}
        options={experiments.map((x) => ({ value: x._id, label: x.name }))}
      />
    </div>
  );
}

export const refValues = (source) => ({
  goalId: source?.goalId ? String(source.goalId) : '',
  productId: source?.productId ? String(source.productId) : '',
  experimentId: source?.experimentId ? String(source.experimentId) : '',
});

export const refBody = (v) => ({ goalId: v.goalId || null, productId: v.productId || null, experimentId: (v.productId && v.experimentId) || null });

export const refNames = (body, { goals, products, experiments }) => ({
  goalTitle: goals.find((g) => g._id === body.goalId)?.title ?? '',
  productName: products.find((p) => p._id === body.productId)?.name ?? '',
  experimentName: experiments.find((x) => x._id === body.experimentId)?.name ?? '',
});
