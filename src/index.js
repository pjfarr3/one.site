// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function ensureRoot() {
  let el = document.getElementById('root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'root';
    document.body.appendChild(el);
  }
  return el;
}

function createOverlay() {
  const el = document.createElement('div');
  el.id = 'error-overlay';
  el.style.position = 'fixed';
  el.style.zIndex = '99999';
  el.style.top = '0';
  el.style.left = '0';
  el.style.right = '0';
  el.style.background = '#fee2e2';
  el.style.color = '#991b1b';
  el.style.padding = '12px';
  el.style.borderBottom = '1px solid #fecaca';
  el.style.fontFamily = 'system-ui, sans-serif';
  el.style.whiteSpace = 'pre-wrap';
  document.body.appendChild(el);
  return el;
}
function showOverlay(msg) {
  const el = document.getElementById('error-overlay') || createOverlay();
  el.textContent = msg;
}

// Global runtime error catches (so we never blank)
window.addEventListener('error', (e) => showOverlay(`Runtime error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) =>
  showOverlay(`Promise rejection: ${e.reason?.message || String(e.reason)}`)
);

// Minimal loader so you *always* see something
const root = ReactDOM.createRoot(ensureRoot());
root.render(
  <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', color: '#111' }}>
    Loading UI shell…
  </div>
);

// Dynamically import App so if it fails, we can show the error instead of a white page
import('./App')
  .then(({ default: App }) => {
    class ErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { error: null }; }
      static getDerivedStateFromError(error) { return { error }; }
      componentDidCatch(error, info) { console.error('Uncaught error:', error, info); showOverlay(String(error)); }
      render() {
        if (this.state.error) {
          return (
            <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
              <h1>Something went wrong.</h1>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
            </div>
          );
        }
        return this.props.children;
      }
    }

    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  })
  .catch((err) => {
    console.error('Failed to load App:', err);
    showOverlay(`Failed to load App: ${err?.message || String(err)}`);
  });
