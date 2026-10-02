import React from 'react';
import ReactDOM from 'react-dom/client';
import { QuickCapture } from './components/QuickCapture';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import 'katex/dist/katex.min.css';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {new URLSearchParams(window.location.search).has('capture') ? <QuickCapture /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
