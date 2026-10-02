import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';

const Surface = new URLSearchParams(window.location.search).has('capture')
  ? lazy(() => import('./components/QuickCapture').then(module => ({ default: module.QuickCapture })))
  : lazy(() => import('./App').then(module => ({ default: module.App })));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div className="h-screen bg-[var(--editor-bg)]" />}><Surface /></Suspense>
    </ErrorBoundary>
  </React.StrictMode>,
);
