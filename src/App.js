import React from 'react';

export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>App loaded ✅</h1>
      <p>If you can see this, the white-screen issue is gone. Next we’ll paste the full app.</p>
      <p>Time: {new Date().toLocaleString()}</p>
    </div>
  );
}
