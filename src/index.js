import React, { useState, useEffect } from "react";
import "./index.css";

export default function App() {
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState("☀️ Sunny, 21°C");
  const [workers, setWorkers] = useState(24);
  const [deliveries, setDeliveries] = useState([
    "Cement truck - 10:30",
    "Steel beams - 13:00",
    "Scaffolding - 15:15",
  ]);
  const [alerts, setAlerts] = useState([
    "⚠️ Worker without helmet at Gate A",
    "⚡ Power outage reported in Plot 4",
  ]);
  const [plots, setPlots] = useState([
    { id: 1, status: "🚧 In Progress" },
    { id: 2, status: "✅ Complete" },
    { id: 3, status: "⏳ Pending" },
    { id: 4, status: "🚧 In Progress" },
  ]);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <h1>One.Site Assist</h1>
        <p className="time">{time.toLocaleTimeString()}</p>
        <p className="weather">{weather}</p>

        <div className="section">
          <h2>👷 Workers On Site</h2>
          <p>{workers}</p>
        </div>

        <div className="section">
          <h2>🚛 Deliveries</h2>
          <ul>
            {deliveries.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>

        <div className="section">
          <h2>⚡ Live Alerts</h2>
          <ul>
            {alerts.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main Site Map */}
      <main className="site-map">
        <h2>📍 Site Map</h2>
        <div className="plots">
          {plots.map((plot) => (
            <div key={plot.id} className="plot">
              <h3>Plot {plot.id}</h3>
              <p>{plot.status}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
