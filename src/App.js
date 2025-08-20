// src/App.js
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './index.css';
import { supabase } from './supabaseClient';

// Mapbox token from env
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';
mapboxgl.accessToken = MAPBOX_TOKEN;

const MAP_CENTER = [-0.1276, 51.5072]; // London

const STATUSES = ['Not Started', 'In Progress', 'Completed'];

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
  const [uiError, setUiError] = useState('');
  const [uiOk, setUiOk] = useState('');

  // Add-plot form
  const [addForm, setAddForm] = useState({
    name: '',
    status: 'Not Started',
    lat: '',
    lng: '',
  });

  // Edit-plot form (mirrors selectedPlot fields)
  const [editForm, setEditForm] = useState({
    name: '',
    status: 'Not Started',
    lat: '',
    lng: '',
  });

  const mapRef = useRef(null);
  const markersRef = useRef([]);

  // Helpers: show messages
  const ok = (msg) => { setUiOk(msg); setUiError(''); };
  const err = (msg) => { setUiError(msg); setUiOk(''); };

  // ----- Fetch helpers -----
  const fetchPlots = async () => {
    try {
      const { data, error } = await supabase.from('plots').select('*').order('id');
      if (error) throw error;
      setPlots(data || []);
      if (!selectedPlot && data?.length) {
        setSelectedPlot(data[0]);
        setEditForm({
          name: data[0].name || '',
          status: data[0].status || 'Not Started',
          lat: data[0].lat ?? '',
          lng: data[0].lng ?? '',
        });
      }
    } catch (e) {
      console.error(e);
      err('Could not load plots (check Supabase table / policies).');
    }
  };

  const fetchDeliveries = async () => {
    try {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDeliveries(data || []);
    } catch (e) {
      console.error(e);
      // non-fatal
    }
  };

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAlerts(data || []);
    } catch (e) {
      console.error(e);
      // non-fatal
    }
  };

  // ----- Init: weather + map + initial data + realtime -----
  useEffect(() => {
    // Weather (no API key)
    const [lng, lat] = MAP_CENTER;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`)
      .then(r => r.json()).then(d => setWeather(d.current_weather)).catch(() => setWeather(null));

    // Map
    if (!MAPBOX_TOKEN) {
      err('Missing Mapbox token. Add REACT_APP_MAPBOX_TOKEN in Vercel → Settings → Environment Variables.');
    } else if (!mapRef.current) {
      try {
        const map = new mapboxgl.Map({
          container: 'map',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: MAP_CENTER,
          zoom: 15,
        });
        map.addControl(new mapboxgl.NavigationControl(), 'top-left');
        mapRef.current = map;
      } catch (e) {
        console.error(e);
        err('Failed to initialize map (check Mapbox token).');
      }
    }

    // Data
    fetchPlots();
    fetchDeliveries();
    fetchAlerts();

    // Realtime (only if supabase client is real)
    const channel = supabase?.channel ? supabase
      .channel('live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plots' }, fetchPlots)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, fetchDeliveries)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, fetchAlerts)
      .subscribe() : null;

    return () => {
      if (channel?.unsubscribe) channel.unsubscribe();
      if (mapRef.current) mapRef.current.remove();
    };
  }, []); // once

  // ----- Redraw markers when plots change -----
  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    plots.forEach((plot) => {
      if (typeof plot.lng !== 'number' || typeof plot.lat !== 'number') return;

      const marker = new mapboxgl.Marker({ color: statusColors[plot.status] || '#2563eb' })
        .setLngLat([plot.lng, plot.lat])
        .setPopup(
          new mapboxgl.Popup().setHTML(`
            <strong>${plot.name}</strong><br/>
            Status: ${plot.status}<br/>
            (${plot.lat.toFixed ? plot.lat.toFixed(5) : plot.lat}, ${plot.lng.toFixed ? plot.lng.toFixed(5) : plot.lng})
          `)
        )
        .addTo(mapRef.current);

      marker.getElement().addEventListener('click', () => {
        setSelectedPlot(plot);
        setEditForm({
          name: plot.name || '',
          status: plot.status || 'Not Started',
          lat: plot.lat ?? '',
          lng: plot.lng ?? '',
        });
      });

      markersRef.current.push(marker);
    });
  }, [plots]);

  // ----- Plot status cycle -----
  const cycle = (s) =>
    s === 'Not Started' ? 'In Progress' : s === 'In Progress' ? 'Completed' : 'Not Started';

  const updatePlotStatus = async (plot) => {
    try {
      const newStatus = cycle(plot.status);
      const { error } = await supabase.from('plots').update({ status: newStatus }).eq('id', plot.id);
      if (error) throw error;
      setPlots((prev) => prev.map((p) => (p.id === plot.id ? { ...p, status: newStatus } : p)));
      if (selectedPlot?.id === plot.id) setSelectedPlot({ ...plot, status: newStatus });
      ok('Plot status updated.');
    } catch (e) {
      console.error(e);
      err('Failed to update plot (check Supabase policies).');
    }
  };

  // ----- Add Plot -----
  const fillFromCenter = () => {
    if (!mapRef.current) return;
    const c = mapRef.current.getCenter();
    setAddForm((f) => ({
      ...f,
      lat: +c.lat.toFixed(6),
      lng: +c.lng.toFixed(6),
    }));
  };

  const addPlot = async () => {
    try {
      if (!addForm.name || addForm.lat === '' || addForm.lng === '') {
        err('Please fill name, lat and lng.');
        return;
      }
      const row = {
        name: addForm.name.trim(),
        status: addForm.status,
        lat: Number(addForm.lat),
        lng: Number(addForm.lng),
      };
      const { error } = await supabase.from('plots').insert(row);
      if (error) throw error;
      setAddForm({ name: '', status: 'Not Started', lat: '', lng: '' });
      ok('Plot added.');
    } catch (e) {
      console.error(e);
      err('Failed to add plot (check Supabase policies).');
    }
  };

  // ----- Edit / Delete Selected Plot -----
  const saveSelectedPlot = async () => {
    if (!selectedPlot) return;
    try {
      const update = {
        name: editForm.name.trim(),
        status: editForm.status,
        lat: Number(editForm.lat),
        lng: Number(editForm.lng),
      };
      const { error } = await supabase.from('plots').update(update).eq('id', selectedPlot.id);
      if (error) throw error;
      ok('Plot saved.');
      setSelectedPlot((p) => p ? { ...p, ...update } : p);
      setPlots((prev) => prev.map((p) => (p.id === selectedPlot.id ? { ...p, ...update } : p)));
    } catch (e) {
      console.error(e);
      err('Failed to save plot (check Supabase policies).');
    }
  };

  const deleteSelectedPlot = async () => {
    if (!selectedPlot) return;
    try {
      const { error } = await supabase.from('plots').delete().eq('id', selectedPlot.id);
      if (error) throw error;
      ok('Plot deleted.');
      setSelectedPlot(null);
    } catch (e) {
      console.error(e);
      err('Failed to delete plot (check Supabase policies).');
    }
  };

  // ----- Insert demo rows -----
  const addDelivery = async () => {
    try {
      const n = Math.floor(Math.random() * 900) + 100;
      const pick = plots[Math.floor(Math.random() * (plots.length || 1))];
      const { error } = await supabase.from('deliveries').insert({
        ref: `D-${n}`,
        gate: Math.random() > 0.5 ? 'North Gate' : 'South Gate',
        for_plot: pick ? pick.name : 'Plot 1',
        eta_text: 'Now',
      });
      if (error) throw error;
      ok('Delivery added.');
    } catch (e) {
      console.error(e);
      err('Failed to add delivery.');
    }
  };

  const addAlert = async () => {
    try {
      const types = ['PPE', 'Intrusion', 'Power'];
      const details = [
        'No hard hat near Gate A',
        'Motion near storage yard',
        'Power outage in Plot 4',
      ];
      const { error } = await supabase.from('alerts').insert({
        type: types[Math.floor(Math.random() * types.length)],
        detail: details[Math.floor(Math.random() * details.length)],
      });
      if (error) throw error;
      ok('Alert added.');
    } catch (e) {
      console.error(e);
      err('Failed to add alert.');
    }
  };

  return (
    <div className="layout">
      <div id="map" className="mapContainer" />

      <aside className="sidebar">
        <h1>One.Site Assist</h1>

        {/* Status messages */}
        {uiOk && (
          <div className="banner ok">
            {uiOk}
          </div>
        )}
        {uiError && (
          <div className="banner err">
            {uiError}
          </div>
        )}

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
          <h2>Add Plot</h2>
          <div className="form">
            <label>
              Name
              <input
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Plot 6"
              />
            </label>
            <label>
              Status
              <select
                value={addForm.status}
                onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div className="grid2">
              <label>
                Lat
                <input
                  type="number" step="0.000001"
                  value={addForm.lat}
                  onChange={(e) => setAddForm((f) => ({ ...f, lat: e.target.value }))}
                />
              </label>
              <label>
                Lng
                <input
                  type="number" step="0.000001"
                  value={addForm.lng}
                  onChange={(e) => setAddForm((f) => ({ ...f, lng: e.target.value }))}
                />
              </label>
            </div>
            <div className="row">
              <button onClick={fillFromCenter} className="secondary">Use map center</button>
              <button onClick={addPlot}>Add plot</button>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Selected Plot</h2>
          {!selectedPlot ? (
            <p>No plot selected</p>
          ) : (
            <>
              <div className="plotBox">
                <div className="plotTitle">{selectedPlot.name}</div>
                <div>Status: <strong>{selectedPlot.status}</strong></div>
                <button onClick={() => updatePlotStatus(selectedPlot)}>Cycle Status</button>
              </div>

              <div className="form">
                <label>
                  Name
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <div className="grid2">
                  <label>
                    Lat
                    <input
                      type="number" step="0.000001"
                      value={editForm.lat}
                      onChange={(e) => setEditForm((f) => ({ ...f, lat: e.target.value }))}
                    />
                  </label>
                  <label>
                    Lng
                    <input
                      type="number" step="0.000001"
                      value={editForm.lng}
                      onChange={(e) => setEditForm((f) => ({ ...f, lng: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="row">
                  <button onClick={saveSelectedPlot}>Save</button>
                  <button onClick={deleteSelectedPlot} className="danger">Delete</button>
                </div>
              </div>
            </>
          )}

          <ul className="plotsList">
            {plots.map((p) => (
              <li key={p.id}>
                <button
                  className={`pill ${p.status?.replace(' ', '-')}`}
                  onClick={() => {
                    setSelectedPlot(p);
                    setEditForm({
                      name: p.name || '',
                      status: p.status || 'Not Started',
                      lat: p.lat ?? '',
                      lng: p.lng ?? '',
                    });
                  }}
                >
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
