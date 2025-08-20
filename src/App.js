import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './index.css';
import { supabase } from './supabaseClient';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || '';
const MAP_CENTER = [-0.1276, 51.5072];

const statusColors = {
  'Not Started': '#8b8b8b',
  'In Progress': '#f59e0b',
  'Completed': '#10b981',
};

export default function App() {
  const [plots, setPlots] = useState([]);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [workers, setWorkers] = useState(28);
  const [weather, setWeather] = useState(null);

  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const fetchPlots = async () => {
    const { data, error } = await supabase.from('plots').select('*').order('id');
    if (!error) {
      setPlots(data || []);
      if (!selectedPlot && data?.length) setSelectedPlot(data[0]);
    }
  };
  const fetchDeliveries = async () => {
    const { data } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
    setDeliveries(data || []);
  };
  const fetchAlerts = async () => {
    const { data } = await supabase.from('alerts').select('*').order('created_at', { ascending: false });
    setAlerts(data || []);
  };

  useEffect(() => {
    const [lng, lat] = MAP_CENTER;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`)
      .then(r => r.json()).then(d => setWeather(d.current_weather)).catch(() => setWeather(null));

    if (!mapRef.current) {
      const map = new mapboxgl.Map({
        container: 'map', style: 'mapbox://styles/mapbox/streets-v12',
        center: MAP_CENTER, zoom: 15,
      });
      mapRef.current = map;
      map.on('load', drawMarkers);
    }

    fetchPlots(); fetchDeliveries(); fetchAlerts();

    const channel = supabase
      .channel('live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plots' }, fetchPlots)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, fetchDeliveries)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, fetchAlerts)
      .subscribe();

    return () => {
      channel.unsubscribe();
      if (mapRef.current) mapRef.current.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    plots.forEach((plot) => {
      const marker = new mapboxgl.Marker({ color: statusColors[plot.status] || '#2563eb' })
        .setLngLat([plot.lng, plot.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`<strong>${plot.name}</strong><br/>${plot.status}`))
        .addTo(mapRef.current);
      marker.getElement().addEventListener('click', () => setSelectedPlot(plot));
      markersRef.current.push(marker);
    });
  }, [plots]);

  const cycle = (s) => (s === 'Not Started' ? 'In Progress' : s === 'In Progress' ? 'Completed' : 'Not Started');
  const updatePlotStatus = async (plot) => {
    const newStatus = cycle(plot.status);
    await supabase.from('plots').update({ status: newStatus }).eq('id', plot.id);
    setPlots((prev) => prev.map((p) => (p.id === plot.id ? { ...p, status: newStatus } : p)));
    if (selectedPlot?.id === plot.id) setSelectedPlot({ ...plot, status: newStatus });
  };

  const addDelivery = async () => {
    const n = Math.floor(Math.random() * 900) + 100;
    const pick = plots[Math.floor(Math.random() * (plots.length || 1))];
    await supabase.from('deliveries').insert({
      ref: `D-${n}`, gate: Math.random() > 0.5 ? 'North Gate' : 'South Gate',
      for_plot: pick ? pick.name : 'Plot 1', eta_text: 'Now',
    });
  };

  const addAlert = async () => {
    const types = ['PPE', 'Intrusion', 'Power'];
    const details = ['No hard hat near Gate A', 'Motion near storage yard', 'Power outage in Plot 4'];
    await supabase.from('alerts').insert({
      type: types[Math.floor(Math.random() * types.length)],
      detail: details[Math.floor(Math.random() * details.length)],
    });
  };

  return (
    <div className="layout">
      <div id="map" className="mapContainer" />
      <aside className="sidebar">
        <h1>One.Site Assist</h1>

        <section className="panel">
          <h2>Weather</h2>
          {!weather ? <p>Loading…</p> : (
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
              <div>Status: <strong>{selectedPlot.status}</strong></div>
              <button onClick={() => updatePlotStatus(selectedPlot)}>Cycle Status</button>
            </div>
          ) : <p>No plot selected</p>}
          <ul className="plotsList">
            {plots.map((p) => (
              <li key={p.id}>
                <button className={`pill ${p.status.replace(' ', '-')}`} onClick={() => setSelectedPlot(p)}>
                  {p.name}: {p.status}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Deliveries</h2>
          <button onClick={addDelivery}>Add delivery</button>
          <ul className="list">
            {deliveries.map((d) => (
              <li key={d.id}><strong>{d.ref}</strong> • {d.eta_text} • {d.gate} • {d.for_plot}</li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Alerts</h2>
          <button onClick={addAlert}>Add alert</button>
          <ul className="list">
            {alerts.map((a) => (
              <li key={a.id}><strong>{a.type}</strong> • {a.detail}</li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
