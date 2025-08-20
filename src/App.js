import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Mapbox comes from the CDN script in index.html
const mapboxgl = window.mapboxgl;

// --- Supabase client (your project + anon key) ---
const supabase = createClient(
  "https://woahoxnnnctszdzyjnjf.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYWhveG5ubmN0c3pkenlqbmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2MzgxNDUsImV4cCI6MjA3MTIxNDE0NX0.byPU10k40RgB9Xypg1RbtBvjZor_hCfCWjhbuZ6gz28"
);

// --- Mapbox token (env first, fallback to your token) ---
const MAPBOX_TOKEN =
  process.env.REACT_APP_MAPBOX_TOKEN ||
  "pk.eyJ1IjoicGpmYXJyMyIsImEiOiJjbWVqM3BhYjEwMG1vMm1xdGJwb3lpd290In0.B5vwM_eiKFnm32GBNipinQ";

// London centre
const MAP_CENTER = [-0.1276, 51.5072];

export default function App() {
  const [plots, setPlots] = useState([]);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [workers, setWorkers] = useState(28);
  const [deliveries] = useState([
    { id: "D-1001", time: "08:17", gate: "North", for: "Plot 2" },
  ]);
  const [alerts] = useState([
    { id: "A-2001", type: "PPE", detail: "No hard hat at Plot 1", time: "08:05" },
  ]);
  const [weather, setWeather] = useState(null);

  const mapRef = useRef(null);
  const markersRef = useRef([]);

  // 1) Fetch plots from Supabase (expects columns: id, name, status, lng, lat)
  useEffect(() => {
    supabase
      .from("plots")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          console.error("Supabase error:", error.message);
          return;
        }
        setPlots(data || []);
      });
  }, []);

  // 2) Init the Map once
  useEffect(() => {
    if (mapRef.current) return;
    if (!mapboxgl) {
      console.error("Mapbox GL not found on window. Check index.html CDN script.");
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/streets-v12",
      center: MAP_CENTER,
      zoom: 15,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-left");
    mapRef.current = map;
    return () => map.remove();
  }, []);

  // 3) Draw markers each time plots change
  useEffect(() => {
    if (!mapRef.current || !mapboxgl) return;

    // clear old
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    plots.forEach((p) => {
      if (typeof p.lng !== "number" || typeof p.lat !== "number") return;
      const marker = new mapboxgl.Marker()
        .setLngLat([p.lng, p.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`<strong>${p.name}</strong><br/>${p.status}`))
        .addTo(mapRef.current);
      marker.getElement().addEventListener("click", () => setSelectedPlot(p));
      markersRef.current.push(marker);
    });
  }, [plots]);

  // 4) Weather (Open-Meteo, no key)
  useEffect(() => {
    const [lng, lat] = MAP_CENTER;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`
    )
      .then((r) => r.json())
      .then((d) => setWeather(d.current_weather))
      .catch(() => setWeather(null));
  }, []);

  return (
    <div className="layout">
      <div id="map" className="map" />

      <aside className="sidebar">
        <h1>One.Site Assist</h1>

        <section className="panel">
          <h2>Weather</h2>
          {!weather ? (
            <p>Loading…</p>
          ) : (
            <div className="row">
              <div>Temp: {weather.temperature}°C</div>
              <div>Wind: {weather.windspeed} km/h</div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Workers</h2>
          <div className="big">{workers}</div>
          <div className="row">
            <button onClick={() => setWorkers((w) => Math.max(0, w - 1))}>-1</button>
            <button onClick={() => setWorkers((w) => w + 1)}>+1</button>
          </div>
        </section>

        <section className="panel">
          <h2>Plots</h2>
          {plots.length === 0 ? (
            <p>No plots yet</p>
          ) : (
            <ul className="list">
              {plots.map((p) => (
                <li key={p.id}>
                  <button className="pill" onClick={() => setSelectedPlot(p)}>
                    {p.name}: {p.status}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedPlot && (
            <div className="selected">
              <div className="muted">Selected</div>
              <div>
                <strong>{selectedPlot.name}</strong>
              </div>
              <div>{selectedPlot.status}</div>
              <div>
                📍 {selectedPlot.lat}, {selectedPlot.lng}
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Deliveries</h2>
          <ul className="list">
            {deliveries.map((d) => (
              <li key={d.id}>
                <strong>{d.id}</strong> • {d.time} • {d.gate} • {d.for}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Alerts</h2>
          <ul className="list">
            {alerts.map((a) => (
              <li key={a.id}>
                <strong>{a.type}</strong> • {a.detail} • {a.time}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
