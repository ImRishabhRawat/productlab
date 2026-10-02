import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { AD_IMPORT } from './adImport.jsx';
import { CsvImportModal } from './CsvImportModal.jsx';
import { ORDER_IMPORT } from './orderImport.jsx';

const KINDS = {
  orders: { config: ORDER_IMPORT, label: 'Import CSV' },
  ads: { config: AD_IMPORT, label: 'Import ad results' },
};

export function ImportButton({ kind, defaults }) {
  const [open, setOpen] = useState(false);
  const { config, label } = KINDS[kind];
  return (
    <>
      <Button icon={Upload} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <CsvImportModal open={open} config={config} defaults={defaults} onClose={() => setOpen(false)} />
    </>
  );
}
