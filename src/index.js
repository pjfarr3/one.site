// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

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

window.addEventListener('error', (e) => showOverlay(`Runtime error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) =>
  showOverlay(`Promise rejection: ${e.reason?.message || String(e.reason)}`)
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Uncaught error:', error, info);
    showOverlay(String(error));
  }
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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
