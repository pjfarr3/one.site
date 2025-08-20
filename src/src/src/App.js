import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import mapboxgl from "mapbox-gl";
import { createClient } from "@supabase/supabase-js";
import "./index.css";

// Mapbox public token (yours)
mapboxgl.accessToken =
  "pk.eyJ1IjoicGpmYXJyMyIsImEiOiJjbWVqM3BhYjEwMG1vMm1xdGJwb3lpd290In0.B5vwM_eiKFnm32GBNipinQ";

// Supabase setup
const supabaseUrl = "https://woahoxnnnctszdzyjnjf.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYWhveG5ubmN0c3pkenlqbmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2MzgxNDUsImV4cCI6MjA3MTIxNDE0NX0.byPU10k40RgB9Xypg1RbtBvjZor_hCfCWjhbuZ6gz28";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// London centre
const MAP_CENTER = [-0.1276, 51.5072];

// Status colors
const statusColors = {
  "Not Started": "#8b8b8b",
  "In Progress": "#f59e0b",
  Completed: "#10b981",
};

function App() {
  const [plots, setPlots] = useState([]);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [workers, setWorkers] = useState(28);
  const [deliveries, setDeliveries] = useState([
    { id: "D-1001", time: "08:17", gate: "North Gate", for: "Plot 6" },
  ]);
  const [alerts, setAlerts] = useState([
    {
      id: "A-2001",
      type: "PPE",
      detail: "No hard hat detected at Plot 12",
      time: "08:05",
    },
  ]);
  const [weather, setWeather] = useState(null);

  // Load plots from Supabase
  useEffect(() => {
    const loadPlots = async () => {
      const { data, error } = await supabase.from("plots").select("*");
      if (error) {
        console.error(error);
      } else {
        setPlots(data);
        if (data.length > 0) setSelectedPlot(data[0]);
      }
    };
    loadPlots();
  }, []);

  // Live weather (no API key)
  useEffect(() => {
    const [lng, lat] = MAP_CENTER;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`
    )
      .then((r) => r.json())
      .then((d) => setWeather(d.current_weather))
      .catch(() => setWeather(null));
  }, []);

  // Map setup
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (mapRef.current) return;
    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/streets-v12",
      center: MAP_CENTER,
      zoom: 15,
    });
    mapRef.current = map;

    map.on("load", drawMarkers);

    return () => map.remove();
  }, []);

  // Redraw markers when plots change
  useEffect(() => {
    if (!mapRef.current) return;
    clearMarkers();
    drawMarkers();
  }, [plots]);

  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  };

  const drawMarkers = () => {
    plots.forEach((plot) => {
      const marker = new mapboxgl.Marker({ color: statusColors[plot.status] })
        .setLngLat([plot.lng, plot.lat])
        .setPopup(
          new mapboxgl.Popup().setHTML(
            `<strong>${plot.name}</strong><br/>Status: ${plot.status}`
          )
        )
        .addTo(mapRef.current);

      marker.getElement().addEventListener("click", () => setSelectedPlot(plot));
      markersRef.current.push(marker);
    });
  };

  const addFakeDelivery = () => {
    const n = deliveries.length + 1;
    setDeliveries([
      {
        id: `D-10${n}`,
        time: "Now",
        gate: "South Gate",
        for: `Plot ${((n % 5) || 5)}`,
      },
      ...deliveries,
    ]);
  };

  const addFakeAlert = () => {
    const n = alerts.length + 1;
    setAlerts([
      { id: `A-20${n}`, type: "Intrusion", detail: "Motion near storage", time: "Now" },
      ...alerts,
    ]);
  };

  return (
    <div className="layout">
      <div id="map" className="mapContainer" />

      <aside className="sidebar">
        <h1>One.Site Assist</h1>

        <section className="panel">
          <h2>Weather</h2>
          {!weather ? (
            <p>Loading…</p>
          ) : (
            <div className="weather">
              <div>Temp: {weather.temperature}°C</div>
              <div>Wind: {weather.windspeed} km/h</div>
              <div>Dir: {weather.winddirection}°</div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Workers On Site</h2>
          <div className="big">{workers}</div>
          <div className="row">
            <button onClick={() => setWorkers((w) => Math.max(0, w - 1))}>-1</button>
            <button onClick={() => setWorkers((w) => w + 1)}>+1</button>
          </div>
        </section>

        <section className="panel">
          <h2>Selected Plot</h2>
          {selectedPlot ? (
            <div className="plotBox">
              <div className="plotTitle">{selectedPlot.name}</div>
              <div>
                Status: <strong>{selectedPlot.status}</strong>
              </div>
            </div>
          ) : (
            <p>No plot selected</p>
          )}
          <ul className="plotsList">
            {plots.map((p) => (
              <li key={p.id}>
                <button
                  className={`pill ${p.status.replace(" ", "-")}`}
                  onClick={() => setSelectedPlot(p)}
                >
                  {p.name}: {p.status}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Deliveries</h2>
          <button onClick={addFakeDelivery}>Add delivery (demo)</button>
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
          <button onClick={addFakeAlert}>Add alert (demo)</button>
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

// Mount the app
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
