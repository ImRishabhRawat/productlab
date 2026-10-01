import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { startOutbox } from './lib/api.js';
import { startPwa } from './lib/pwa.js';
import { invalidateData } from './lib/queries.js';
import { startSession } from './lib/session.js';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
      retry: (count, error) => navigator.onLine && (error?.status === 0 || error?.status >= 500) && count < 2,
    },
    mutations: { networkMode: 'always' },
  },
});

onlineManager.setOnline(navigator.onLine);
startSession(queryClient);
startOutbox(() => invalidateData(queryClient));
startPwa();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
