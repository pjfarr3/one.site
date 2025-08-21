import React from 'react';
import ReactDOM from 'react-dom/client';

const rootEl =
  document.getElementById('root') ||
  (() => {
    const d = document.createElement('div');
    d.id = 'root';
    document.body.appendChild(d);
    return d;
  })();

function TestApp() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
      <h1>Test A ✅</h1>
      <p>If you see this, React is rendering. Next we’ll restore the full app.</p>
      <p>Time: {new Date().toLocaleString()}</p>
      <p>HTML marker present: {String(!!window.__HTML_OK__)}</p>
    </div>
  );
}

const root = ReactDOM.createRoot(rootEl);
root.render(<TestApp />);

