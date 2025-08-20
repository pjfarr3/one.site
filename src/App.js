// src/App.js
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './index.css';
import { supabase } from './supabaseClient';

// Mapbox token (from env)
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
  // Core data
  const [plots, setPlots] = useState([]);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // Weather + workers
  const [weather, setWeather] = useState(null);
  const [workers, setWorkers] = useState(28);

  // Car park
  const [carpark, setCarpark] = useState(null); // {id, capacity, occupied}

  // UI
  const [uiError, setUiError] = useState('');
  const [uiOk, setUiOk] = useState('');
  const [query, setQuery] = useState('');

  // Forms
  const [addForm, setAddForm] = useState({ name: '', status: 'Not Started', lat: '', lng: '' });
  const [editForm, setEditForm] = useState({ name: '', status: 'Not Started', lat: '', lng: '' });

  // Map refs
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const ok = (m) => { setUiOk(m); setUiError(''); };
  const err = (m) => { setUiError(m); setUiOk(''); };

  // -------- Fetch helpers --------
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
      err('Could not load plots (check Supabase policies).');
    }
  };

  const fetchDeliveries = async () => {
    try {
      const { data, error } = await supabase.from('deliveries').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setDeliveries(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase.from('alerts').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setAlerts(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchCarpark = async () => {
    try {
      // Get the first row; if none, create one
      let { data, error } = await supabase.from('carpark').select('*').limit(1);
      if (error) throw error;

      if (!data || data.length === 0) {
        const { data: ins, error: insErr } = await supabase
          .from('carpark')
          .insert({ capacity: 50, occupied: 0 })
          .select('*')
          .limit(1);
        if (insErr) throw insErr;
        setCarpark(ins?.[0] || null);
      } else {
        setCarpark(data[0]);
      }
    } catch (e) {
      console.error(e);
      err('Could not load car park (check Supabase table/policies).');
    }
  };

  // -------- Init: weather + map + data + realtime --------
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

        // Click → fill Add Plot lat/lng
        map.on('click', (e) => {
          setAddForm((f) => ({
            ...f,
            lat: +e.lngLat.lat.toFixed(6),
            lng: +e.lngLat.lng.toFixed(6),
          }));
          ok('Lat/Lng filled from map click.');
        });

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
    fetchCarpark();

    // Realtime
    const channel = supabase?.channel ? supabase
      .channel('live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plots' }, fetchPlots)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, fetchDeliveries)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, fetchAlerts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carpark' }, fetchCarpark)
      .subscribe() : null;

    return () => {
      if (channel?.unsubscribe) channel.unsubscribe();
      if (mapRef.current) mapRef.current.remove();
    };
  }, []); // once

  // -------- Redraw markers when plots change --------
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
            (${plot.lat}, ${plot.lng})
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

  // -------- Status cycle --------
  const cycle = (s) => (s === 'Not Started' ? 'In Progress' : s === 'In Progress' ? 'Completed' : 'Not Started');

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
      err('Failed to update plot.');
    }
  };

  // -------- Add Plot --------
  const fillFromCenter = () => {
    if (!mapRef.current) return;
    const c = mapRef.current.getCenter();
    setAddForm((f) => ({ ...f, lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) }));
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
      err('Failed to add plot.');
    }
  };

  // -------- Edit / Delete selected plot --------
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
      err('Failed to save plot.');
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
      err('Failed to delete plot.');
    }
  };

  // -------- Deliveries / Alerts demo inserts --------
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
    } catch (e) { console.error(e); err('Failed to add delivery.'); }
  };

  const addAlert = async () => {
    try {
      const types = ['PPE', 'Intrusion', 'Power'];
      const details = ['No hard hat near Gate A', 'Motion near storage yard', 'Power outage in Plot 4'];
      const { error } = await supabase.from('alerts').insert({
        type: types[Math.floor(Math.random() * types.length)],
        detail: details[Math.floor(Math.random() * details.length)],
      });
      if (error) throw error;
      ok('Alert added.');
    } catch (e) { console.error(e); err('Failed to add alert.'); }
  };

  // -------- Car park helpers --------
  const carparkPct = carpark ? Math.min(100, Math.round((carpark.occupied / Math.max(1, carpark.capacity)) * 100)) : 0;
  const carparkStatus =
    carparkPct >= 90 ? 'Full' : carparkPct >= 70 ? 'Busy' : 'Space';

  const updateCarpark = async (fields) => {
    if (!carpark) return;
    try {
      const next = { ...carpark, ...fields, updated_at: new Date().toISOString() };
      // Keep values in range
      next.capacity = Math.max(0, Number(next.capacity));
      next.occupied = Math.max(0, Math.min(next.capacity, Number(next.occupied)));

      const { error } = await supabase.from('carpark').update({
        capacity: next.capacity,
        occupied: next.occupied,
        updated_at: next.updated_at,
      }).eq('id', carpark.id);
      if (error) throw error;
      setCarpark(next);
    } catch (e) { console.error(e); err('Failed to update car park.'); }
  };

  const incCar = () => updateCarpark({ occupied: (carpark?.occupied || 0) + 1 });
  const decCar = () => updateCarpark({ occupied: (carpark?.occupied || 0) - 1 });
  const setCap = (v) => updateCarpark({ capacity: v });
  const resetCar = () => updateCarpark({ occupied: 0 });

  // -------- Suggestions (very simple rules) --------
  const suggestions = [];
  if (weather?.windspeed > 40) suggestions.push('High winds: consider pausing crane lifts.');
  if (weather?.temperature <= 2) suggestions.push('Low temp: delay concrete pour / use cold-weather mix.');
  if (weather?.temperature >= 30) suggestions.push('High temp: protect concrete pour and schedule hydration breaks.');
  if (carparkPct >= 90) suggestions.push('Car park full: redirect visitors to overflow.');
  if (carparkPct >= 70 && carparkPct < 90) suggestions.push('Car park busy: notify next deliveries to stage off-site.');

  // -------- Helpers --------
  const centerOnSelected = () => {
    if (!mapRef.current || !selectedPlot) return;
    if (typeof selectedPlot.lng !== 'number' || typeof selectedPlot.lat !== 'number') return;
    mapRef.current.flyTo({ center: [selectedPlot.lng, selectedPlot.lat], zoom: 17, essential: true });
  };

  const filteredPlots = plots.filter((p) => (p.name || '').toLowerCase().includes(query.toLowerCase()));

  const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleTimeString(); } catch { return ''; }
  };

  return (
    <div className="layout">
      <div id="map" className="mapContainer" />

      <aside className="sidebar">
        <h1>One.Site Assist</h1>

        {uiOk && <div className="banner ok">{uiOk}</div>}
        {uiError && <div className="banner err">{uiError}</div>}

        {/* Weather */}
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

        {/* Suggestions */}
        <section className="panel">
          <h2>Operational Suggestions</h2>
          {suggestions.length === 0 ? <p>All clear.</p> : (
            <ul className="list">
              {suggestions.map((s, i) => <li key={i}>• {s}</li>)}
            </ul>
          )}
        </section>

        {/* Workers */}
        <section className="panel">
          <h2>Workers On Site</h2>
          <div className="big">{workers}</div>
          <div className="row">
            <button onClick={() => setWorkers((w) => Math.max(0, w - 1))}>-1</button>
            <button onClick={() => setWorkers((w) => w + 1)}>+1</button>
          </div>
        </section>

        {/* Car park */}
        <section className="panel">
          <h2>Car Park</h2>
          {!carpark ? <p>Loading…</p> : (
            <>
              <div className="cpRow">
                <div className="cpStat">{carpark.occupied}/{carpark.capacity} ({carparkPct}%)</div>
                <div className={`cpBadge ${carparkStatus.toLowerCase()}`}>{carparkStatus}</div>
              </div>
              <div className="bar">
                <div className={`barFill ${carparkStatus.toLowerCase()}`} style={{ width: `${carparkPct}%` }} />
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={decCar} disabled={!carpark || carpark.occupied <= 0}>-1 car</button>
                <button onClick={incCar}>+1 car</button>
                <button onClick={resetCar} className="secondary">Reset</button>
              </div>
              <div className="form" style={{ marginTop: 8 }}>
                <label>
                  Capacity
                  <input
                    type="number"
                    min="0"
                    value={carpark.capacity}
                    onChange={(e) => setCap(Number(e.target.value || 0))}
                  />
                </label>
              </div>
            </>
          )}
        </section>

        {/* Add Plot */}
        <section className="panel">
          <h2>Add Plot</h2>
          <div className="form">
            <label>
              Name
              <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="Plot 6" />
            </label>
            <label>
              Status
              <select value={addForm.status} onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div className="grid2">
              <label>
                Lat
                <input type="number" step="0.000001" value={addForm.lat} onChange={(e) => setAddForm((f) => ({ ...f, lat: e.target.value }))} />
              </label>
              <label>
                Lng
                <input type="number" step="0.000001" value={addForm.lng} onChange={(e) => setAddForm((f) => ({ ...f, lng: e.target.value }))} />
              </label>
            </div>
            <div className="row">
              <button onClick={fillFromCenter} className="secondary">Use map center</button>
              <button onClick={addPlot}>Add plot</button>
            </div>
          </div>
        </section>

        {/* Selected Plot */}
        <section className="panel">
          <h2>Selected Plot</h2>
          {!selectedPlot ? <p>No plot selected</p> : (
            <>
              <div className="plotBox">
                <div className="plotTitle">{selectedPlot.name}</div>
                <div>Status: <strong>{selectedPlot.status}</strong></div>
                <div className="row" style={{ marginTop: 6 }}>
                  <button onClick={() => updatePlotStatus(selectedPlot)}>Cycle Status</button>
                  <button onClick={centerOnSelected} className="secondary">Center on selected</button>
                </div>
              </div>

              <div className="form">
                <label>
                  Name
                  <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label>
                  Status
                  <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <div className="grid2">
                  <label>
                    Lat
                    <input type="number" step="0.000001" value={editForm.lat} onChange={(e) => setEditForm((f) => ({ ...f, lat: e.target.value }))} />
                  </label>
                  <label>
                    Lng
                    <input type="number" step="0.000001" value={editForm.lng} onChange={(e) => setEditForm((f) => ({ ...f, lng: e.target.value }))} />
                  </label>
                </div>
                <div className="row">
                  <button onClick={saveSelectedPlot}>Save</button>
                  <button onClick={deleteSelectedPlot} className="danger">Delete</button>
                </div>
              </div>
            </>
          )}

          {/* Search + list */}
          <div className="form" style={{ marginTop: 10 }}>
            <label>
              Search plots
              <input placeholder="Type to filter by name…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>

          <ul className="plotsList">
            {filteredPlots.length === 0 && <li>No matching plots</li>}
            {filteredPlots.map((p) => (
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

        {/* Deliveries */}
        <section className="panel">
          <h2>Deliveries</h2>
          <button onClick={addDelivery}>Add delivery</button>
          <ul className="list">
            {deliveries.map((d) => (
              <li key={d.id}>
                <strong>{d.ref}</strong> • {d.gate} • {d.for_plot}
                {d.created_at ? <> • <span title={d.created_at}>{fmtTime(d.created_at)}</span></> : null}
              </li>
            ))}
          </ul>
        </section>

        {/* Alerts */}
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
