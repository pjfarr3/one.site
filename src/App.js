// src/App.js
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './index.css';
import { supabase } from './supabaseClient';

// ---- Mapbox token from env (REACT_APP_MAPBOX_TOKEN) ----
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
  // Data
  const [plots, setPlots] = useState([]);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // Weather / workers
  const [weather, setWeather] = useState(null);
  const [workers, setWorkers] = useState(28);

  // Car park (single row)
  const [carpark, setCarpark] = useState(null); // {id, capacity, occupied}

  // UI banners
  const [uiError, setUiError] = useState('');
  const [uiOk, setUiOk] = useState('');

  // Filters/forms
  const [query, setQuery] = useState('');
  const [addForm, setAddForm] = useState({ name: '', status: 'Not Started', lat: '', lng: '' });
  const [editForm, setEditForm] = useState({ name: '', status: 'Not Started', lat: '', lng: '' });

  // Chat
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState([
    { role: 'assistant', text: "Hi! Ask about deliveries, car park, weather, or plot status. Try: “Has the delivery for Plot 6 arrived?”" }
  ]);

  // Map
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const ok = (m) => { setUiOk(m); setUiError(''); };
  const err = (m) => { setUiError(m); setUiOk(''); };

  // ---------- Fetch helpers ----------
  const fetchPlots = async () => {
    const { data, error } = await supabase.from('plots').select('*').order('id');
    if (error) { err('Could not load plots.'); return; }
    setPlots(data || []);
    if (!selectedPlot && data?.length) {
      const p = data[0];
      setSelectedPlot(p);
      setEditForm({ name: p.name || '', status: p.status || 'Not Started', lat: p.lat ?? '', lng: p.lng ?? '' });
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

  const fetchCarpark = async () => {
    let { data, error } = await supabase.from('carpark').select('*').limit(1);
    if (error) return;
    if (!data || data.length === 0) {
      const { data: ins } = await supabase.from('carpark').insert({ capacity: 50, occupied: 0 }).select('*').limit(1);
      setCarpark(ins?.[0] || null);
    } else {
      setCarpark(data[0]);
    }
  };

  // ---------- Init (weather, map, data, realtime) ----------
  useEffect(() => {
    // Weather (no key)
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

        // Click to fill the Add Plot lat/lng
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
        err('Failed to set up the map (check Mapbox token).');
      }
    }

    // Load data
    fetchPlots();
    fetchDeliveries();
    fetchAlerts();
    fetchCarpark();

    // Realtime
    const channel = supabase
      .channel('live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plots' }, fetchPlots)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, fetchDeliveries)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, fetchAlerts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carpark' }, fetchCarpark)
      .subscribe();

    return () => {
      channel.unsubscribe();
      if (mapRef.current) mapRef.current.remove();
    };
  }, []); // run once

  // ---------- Draw markers whenever plots change ----------
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    plots.forEach((plot) => {
      if (typeof plot.lng !== 'number' || typeof plot.lat !== 'number') return;
      const marker = new mapboxgl.Marker({ color: statusColors[plot.status] || '#2563eb' })
        .setLngLat([plot.lng, plot.lat])
        .setPopup(new mapboxgl.Popup().setHTML(
          `<strong>${plot.name}</strong><br/>Status: ${plot.status}<br/>(${plot.lat}, ${plot.lng})`
        ))
        .addTo(mapRef.current);

      marker.getElement().addEventListener('click', () => {
        setSelectedPlot(plot);
        setEditForm({ name: plot.name || '', status: plot.status || 'Not Started', lat: plot.lat ?? '', lng: plot.lng ?? '' });
      });

      markersRef.current.push(marker);
    });
  }, [plots]);

  // ---------- Plot actions ----------
  const cycle = (s) => (s === 'Not Started' ? 'In Progress' : s === 'In Progress' ? 'Completed' : 'Not Started');

  const updatePlotStatus = async (plot) => {
    const newStatus = cycle(plot.status);
    const { error } = await supabase.from('plots').update({ status: newStatus }).eq('id', plot.id);
    if (error) return err('Failed to update plot.');
    setPlots((prev) => prev.map((p) => (p.id === plot.id ? { ...p, status: newStatus } : p)));
    if (selectedPlot?.id === plot.id) setSelectedPlot({ ...plot, status: newStatus });
    ok('Plot status updated.');
  };

  const fillFromCenter = () => {
    if (!mapRef.current) return;
    const c = mapRef.current.getCenter();
    setAddForm((f) => ({ ...f, lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) }));
  };

  const addPlot = async () => {
    if (!addForm.name || addForm.lat === '' || addForm.lng === '') return err('Please fill name, lat and lng.');
    const row = { name: addForm.name.trim(), status: addForm.status, lat: Number(addForm.lat), lng: Number(addForm.lng) };
    const { error } = await supabase.from('plots').insert(row);
    if (error) return err('Failed to add plot.');
    setAddForm({ name: '', status: 'Not Started', lat: '', lng: '' });
    ok('Plot added.');
  };

  const saveSelectedPlot = async () => {
    if (!selectedPlot) return;
    const update = { name: editForm.name.trim(), status: editForm.status, lat: Number(editForm.lat), lng: Number(editForm.lng) };
    const { error } = await supabase.from('plots').update(update).eq('id', selectedPlot.id);
    if (error) return err('Failed to save plot.');
    setPlots((prev) => prev.map((p) => (p.id === selectedPlot.id ? { ...p, ...update } : p)));
    setSelectedPlot((p) => (p ? { ...p, ...update } : p));
    ok('Plot saved.');
  };

  const deleteSelectedPlot = async () => {
    if (!selectedPlot) return;
    const { error } = await supabase.from('plots').delete().eq('id', selectedPlot.id);
    if (error) return err('Failed to delete plot.');
    setSelectedPlot(null);
    ok('Plot deleted.');
  };

  // ---------- Car park ----------
  const cpPct = carpark ? Math.min(100, Math.round((carpark.occupied / Math.max(1, carpark.capacity)) * 100)) : 0;
  const cpState = cpPct >= 90 ? 'Full' : cpPct >= 70 ? 'Busy' : 'Space';

  const updateCarpark = async (fields) => {
    if (!carpark) return;
    const next = { ...carpark, ...fields };
    next.capacity = Math.max(0, Number(next.capacity));
    next.occupied = Math.max(0, Math.min(next.capacity, Number(next.occupied)));
    const { error } = await supabase.from('carpark')
      .update({ capacity: next.capacity, occupied: next.occupied, updated_at: new Date().toISOString() })
      .eq('id', carpark.id);
    if (error) return err('Failed to update car park.');
    setCarpark(next);
  };

  // ---------- Deliveries & Alerts (demo inserts) ----------
  const addDelivery = async () => {
    const n = Math.floor(Math.random() * 900) + 100;
    const pick = plots[Math.floor(Math.random() * (plots.length || 1))];
    const { error } = await supabase.from('deliveries').insert({
      ref: `D-${n}`,
      gate: Math.random() > 0.5 ? 'North Gate' : 'South Gate',
      for_plot: pick ? pick.name : 'Plot 1',
      eta_text: 'Now',
    });
    if (error) return err('Failed to add delivery.');
    ok('Delivery added.');
  };

  const addAlert = async () => {
    const types = ['PPE', 'Intrusion', 'Power'];
    const details = ['No hard hat near Gate A', 'Motion near storage yard', 'Power outage in Plot 4'];
    const { error } = await supabase.from('alerts').insert({
      type: types[Math.floor(Math.random() * types.length)],
      detail: details[Math.floor(Math.random() * details.length)],
    });
    if (error) return err('Failed to add alert.');
    ok('Alert added.');
  };

  // ---------- Helpers ----------
  const centerOnSelected = () => {
    if (!mapRef.current || !selectedPlot) return;
    if (typeof selectedPlot.lng !== 'number' || typeof selectedPlot.lat !== 'number') return;
    mapRef.current.flyTo({ center: [selectedPlot.lng, selectedPlot.lat], zoom: 17, essential: true });
  };

  const centerOnPlotByName = (name) => {
    const p = plots.find((pl) => (pl.name || '').toLowerCase() === name.toLowerCase());
    if (p && mapRef.current && typeof p.lng === 'number' && typeof p.lat === 'number') {
      setSelectedPlot(p);
      setEditForm({ name: p.name || '', status: p.status || 'Not Started', lat: p.lat ?? '', lng: p.lng ?? '' });
      mapRef.current.flyTo({ center: [p.lng, p.lat], zoom: 17, essential: true });
      return true;
    }
    return false;
  };

  const filteredPlots = plots.filter((p) => (p.name || '').toLowerCase().includes(query.toLowerCase()));
  const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString(); } catch { return ''; } };

  // ---------- Chat (simple rules, no external API) ----------
  const appendChat = (role, text) => setChat((c) => [...c, { role, text }]);

  const answerQuestion = async (q) => {
    const s = q.toLowerCase();

    // Delivery for Plot N?
    if (s.includes('delivery') && s.includes('plot')) {
      const m = q.match(/plot\s*(\d+)/i);
      if (m) {
        const plotName = `Plot ${m[1]}`;
        const { data } = await supabase
          .from('deliveries')
          .select('ref, gate, for_plot, created_at, eta_text')
          .eq('for_plot', plotName)
          .order('created_at', { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          const d = data[0];
          const when = d.created_at ? new Date(d.created_at).toLocaleTimeString() : (d.eta_text || 'unknown time');
          return `Yes — ${d.ref} at ${d.gate} for ${d.for_plot} at ${when}.`;
        }
        return `I can’t see a delivery for ${plotName} yet.`;
      }
      return 'Which plot number? (e.g., “Has the delivery for Plot 6 arrived?”)';
    }

    // Car park
    if (s.includes('car park') || s.includes('carpark') || s.includes('parking')) {
      if (!carpark) return 'Car park data not loaded yet.';
      return `Car park: ${carpark.occupied}/${carpark.capacity} (${cpPct}%) — ${cpState}.`;
    }

    // Weather
    if (s.includes('weather')) {
      if (!weather) return 'Weather not loaded yet.';
      return `Weather: ${weather.temperature}°C, wind ${weather.windspeed} km/h, direction ${weather.winddirection}°.`;
    }

    // Workers
    if (s.includes('workers')) {
      return `There are ${workers} workers on site.`;
    }

    // Alerts
    if (s.includes('alerts')) {
      if (!alerts.length) return 'No alerts right now.';
      const last = alerts.slice(0, 3).map(a => `${a.type}: ${a.detail}`).join(' | ');
      return `Latest alerts: ${last}`;
    }

    // Status of Plot N
    if (s.includes('status') && s.includes('plot')) {
      const m = q.match(/plot\s*(\d+)/i);
      if (m) {
        const plotName = `Plot ${m[1]}`;
        const p = plots.find(pl => (pl.name || '').toLowerCase() === plotName.toLowerCase());
        if (p) return `${plotName} is ${p.status}.`;
        return `I can’t find ${plotName}.`;
      }
    }

    // Center on Plot N
    if (s.includes('center') || s.includes('show')) {
      const m = q.match(/plot\s*(\d+)/i);
      if (m) {
        const plotName = `Plot ${m[1]}`;
        const ok = centerOnPlotByName(plotName);
        return ok ? `Centered on ${plotName}.` : `I can’t find ${plotName}.`;
      }
    }

    // Mark Plot N Completed/In Progress/Not Started
    if ((s.includes('mark') || s.includes('set')) && s.includes('plot')) {
      const mPlot = q.match(/plot\s*(\d+)/i);
      const mStatus = s.match(/(completed?|in progress|not started)/i);
      if (mPlot && mStatus) {
        const plotName = `Plot ${mPlot[1]}`;
        let newStatus = 'Not Started';
        if (/completed?/.test(mStatus[0])) newStatus = 'Completed';
        else if (/in progress/.test(mStatus[0])) newStatus = 'In Progress';

        const target = plots.find(pl => (pl.name || '').toLowerCase() === plotName.toLowerCase());
        if (!target) return `I can’t find ${plotName}.`;
        const { error } = await supabase.from('plots').update({ status: newStatus }).eq('id', target.id);
        if (error) return `Couldn’t update ${plotName}.`;
        setPlots((prev) => prev.map((p) => (p.id === target.id ? { ...p, status: newStatus } : p)));
        if (selectedPlot?.id === target.id) setSelectedPlot((p) => ({ ...p, status: newStatus }));
        return `${plotName} marked ${newStatus}.`;
      }
    }

    // Default help
    return `Try:
• “Has the delivery for Plot 6 arrived?”
• “Car park status?”
• “What’s the weather?”
• “Status of Plot 3?”
• “Show Plot 2”
• “Mark Plot 7 Completed”`;
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q) return;
    setChat((c) => [...c, { role: 'user', text: q }]);
    setChatInput('');
    const a = await answerQuestion(q);
    setChat((c) => [...c, { role: 'assistant', text: a }]);
  };

  const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString(); } catch { return ''; } };
  const filteredPlots = plots.filter((p) => (p.name || '').toLowerCase().includes(query.toLowerCase()));

  // ---------- UI ----------
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
                <div className="cpStat">
                  {carpark.occupied}/{carpark.capacity} ({cpPct}%)
                </div>
                <div className={`cpBadge ${cpState.toLowerCase()}`}>{cpState}</div>
              </div>
              <div className="bar"><div className={`barFill ${cpState.toLowerCase()}`} style={{ width: `${cpPct}%` }} /></div>
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={() => updateCarpark({ occupied: Math.max(0, (carpark.occupied || 0) - 1) })} disabled={!carpark || carpark.occupied <= 0}>-1 car</button>
                <button onClick={() => updateCarpark({ occupied: (carpark.occupied || 0) + 1 })}>+1 car</button>
                <button onClick={() => updateCarpark({ occupied: 0 })} className="secondary">Reset</button>
              </div>
              <div className="form" style={{ marginTop: 8 }}>
                <label>
                  Capacity
                  <input type="number" min="0" value={carpark.capacity} onChange={(e) => updateCarpark({ capacity: Number(e.target.value || 0) })} />
                </label>
              </div>
            </>
          )}
        </section>

        {/* Add Plot */}
        <section className="panel">
          <h2>Add Plot</h2>
          <div className="form">
            <label> Name
              <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="Plot 6" />
            </label>
            <label> Status
              <select value={addForm.status} onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div className="grid2">
              <label> Lat
                <input type="number" step="0.000001" value={addForm.lat} onChange={(e) => setAddForm((f) => ({ ...f, lat: e.target.value }))} />
              </label>
              <label> Lng
                <input type="number" step="0.000001" value={addForm.lng} onChange={(e) => setAddForm((f) => ({ ...f, lng: e.target.value }))} />
              </label>
            </div>
            <div className="row">
              <button onClick={fillFromCenter} className="secondary">Use map center</button>
              <button onClick={addPlot}>Add plot</button>
            </div>
          </div>
        </section>

        {/* Selected Plot + search */}
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
                <label> Name
                  <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label> Status
                  <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <div className="grid2">
                  <label> Lat
                    <input type="number" step="0.000001" value={editForm.lat} onChange={(e) => setEditForm((f) => ({ ...f, lat: e.target.value }))} />
                  </label>
                  <label> Lng
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

          <div className="form" style={{ marginTop: 10 }}>
            <label> Search plots
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
                    setEditForm({ name: p.name || '', status: p.status || 'Not Started', lat: p.lat ?? '', lng: p.lng ?? '' });
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

        {/* Chat Assistant */}
        <section className="panel">
          <h2>Assistant</h2>
          <div className="chatBox">
            {chat.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>{m.text}</div>
            ))}
          </div>
          <form onSubmit={handleAsk} className="row">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder='Try: "Has the delivery for Plot 6 arrived?"'
            />
            <button type="submit">Ask</button>
          </form>
        </section>
      </aside>
    </div>
  );
}
