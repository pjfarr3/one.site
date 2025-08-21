// src/App.js
import React, { useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import './index.css';
import { supabase } from './supabaseClient';

const MAP_CENTER = [-0.1276, 51.5072]; // London
const STATUS_COLORS = {
  'Not Started': '#8b8b8b',
  'In Progress': '#f59e0b',
  'Completed': '#10b981',
};
const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Completed'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export default function App() {
  const [banner, setBanner] = useState(null);
  const [weather, setWeather] = useState(null);
  const [workers, setWorkers] = useState(28);
  const [plots, setPlots] = useState([]);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [plotsLoading, setPlotsLoading] = useState(true);
  const [addingPlot, setAddingPlot] = useState(false);

  const [newPlotName, setNewPlotName] = useState('Plot 6');
  const [newPlotStatus, setNewPlotStatus] = useState('Not Started');
  const [newLat, setNewLat] = useState(MAP_CENTER[1]);
  const [newLng, setNewLng] = useState(MAP_CENTER[0]);

  const [carpark, setCarpark] = useState(null);
  const [carparkLoading, setCarparkLoading] = useState(true);
  const [carparkSaving, setCarparkSaving] = useState(false);

  const mapRef = useRef(null);
  const mapDivRef = useRef(null);
  const markersRef = useRef([]);

  // Always render a tiny boot text so you never see a pure white page
  // (If you see nothing at all, index.html is wrong or CSS hides text.)
  const BootBadge = () => (
    <div style={{ position: 'fixed', bottom: 8, left: 8, fontSize: 12, opacity: 0.6 }}>
      boot ok
    </div>
  );

  useEffect(() => {
    const msgs = [];
    const mapToken = process.env.REACT_APP_MAPBOX_TOKEN || '';
    if (!mapToken) msgs.push('Missing REACT_APP_MAPBOX_TOKEN');
    if (!process.env.REACT_APP_SUPABASE_URL || !process.env.REACT_APP_SUPABASE_ANON_KEY) {
      msgs.push('Missing Supabase env vars');
    }
    setBanner(msgs.length ? msgs.join(' | ') : null);
  }, []);

  useEffect(() => {
    const [lng, lat] = MAP_CENTER;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`
    )
      .then((r) => r.json())
      .then((d) => setWeather(d.current_weather))
      .catch(() => setWeather(null));
  }, []);

  useEffect(() => {
    const token = process.env.REACT_APP_MAPBOX_TOKEN || '';
    if (!token || !mapDivRef.current) return;

    let mapboxgl;
    let map;

    (async () => {
      try {
        mapboxgl = (await import('mapbox-gl')).default;
        mapboxgl.accessToken = token;

        map = new mapboxgl.Map({
          container: mapDivRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: MAP_CENTER,
          zoom: 15,
        });
        map.addControl(new mapboxgl.NavigationControl(), 'top-left');
        mapRef.current = map;
        map.on('load', () => drawMarkers(plots));
      } catch (err) {
        console.error(err);
        setBanner((b) => (b ? b + ' | ' : '') + `Map failed: ${err?.message || err}`);
      }
    })();

    return () => {
      try { mapRef.current?.remove(); } catch {}
      mapRef.current = null;
      clearMarkers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapDivRef]);

  const clearMarkers = () => {
    markersRef.current.forEach((m) => { try { m.remove(); } catch {} });
    markersRef.current = [];
  };

  const drawMarkers = (arr) => {
    const map = mapRef.current;
    if (!map) return;
    clearMarkers();
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      arr.forEach((plot) => {
        if (typeof plot.lng !== 'number' || typeof plot.lat !== 'number') return;
        const marker = new mapboxgl.Marker({ color: STATUS_COLORS[plot.status] || '#2563eb' })
          .setLngLat([plot.lng, plot.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(
            `<strong>${plot.name}</strong><br/>${plot.status}`
          ))
          .addTo(map);
        marker.getElement().addEventListener('click', () => setSelectedPlot(plot));
        markersRef.current.push(marker);
      });
    });
  };

  useEffect(() => { drawMarkers(plots); }, [plots]); // ok

  useEffect(() => {
    const loadPlots = async () => {
      if (!supabase) { setPlotsLoading(false); return; }
      try {
        const { data, error } = await supabase.from('plots').select('*').order('id', { ascending: true });
        if (error) throw error;
        setPlots(data || []);
        if (!selectedPlot && data?.length) setSelectedPlot(data[0]);
      } catch (err) {
        console.error(err);
        setBanner((b) => (b ? b + ' | ' : '') + 'Could not load plots (check table/policies)');
      } finally {
        setPlotsLoading(false);
      }
    };
    loadPlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycleStatus = (s) => (s === 'Not Started' ? 'In Progress' : s === 'In Progress' ? 'Completed' : 'Not Started');

  const updatePlotStatus = async (plot) => {
    if (!supabase) return;
    const newStatus = cycleStatus(plot.status);
    try {
      const { error } = await supabase.from('plots').update({ status: newStatus }).eq('id', plot.id);
      if (error) throw error;
      setPlots((prev) => prev.map((p) => (p.id === plot.id ? { ...p, status: newStatus } : p)));
      if (selectedPlot?.id === plot.id) setSelectedPlot({ ...plot, status: newStatus });
    } catch (err) {
      console.error(err);
      setBanner((b) => (b ? b + ' | ' : '') + 'Failed to update plot');
    }
  };

  const useMapCenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    setNewLng(+c.lng.toFixed(6));
    setNewLat(+c.lat.toFixed(6));
  };

  const addPlot = async () => {
    if (!supabase || addingPlot) return;
    setAddingPlot(true);
    try {
      const payload = {
        name: newPlotName || 'New Plot',
        status: newPlotStatus,
        lat: parseFloat(newLat),
        lng: parseFloat(newLng),
      };
      const { data, error } = await supabase.from('plots').insert(payload).select().single();
      if (error) throw error;
      setPlots((prev) => [...prev, data]);
      setSelectedPlot(data);
    } catch (err) {
      console.error(err);
      setBanner((b) => (b ? b + ' | ' : '') + 'Failed to add plot');
    } finally {
      setAddingPlot(false);
    }
  };

  const loadCarpark = async () => {
    if (!supabase) { setCarparkLoading(false); return; }
    setCarparkLoading(true);
    try {
      const { data, error } = await supabase.from('carpark').select('*').order('id', { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      setCarpark(data || null);
    } catch (err) {
      console.error(err);
      setBanner((b) => (b ? b + ' | ' : '') + 'Could not load car park (check table + policies)');
      setCarpark(null);
    } finally {
      setCarparkLoading(false);
    }
  };
  useEffect(() => { loadCarpark(); }, []);

  const adjustCarpark = async (delta) => {
    if (!supabase || !carpark || carparkSaving) return;
    const next = clamp((carpark.occupied || 0) + delta, 0, carpark.capacity);
    if (next === carpark.occupied) return;
    setCarparkSaving(true);
    try {
      const { error } = await supabase.from('carpark').update({ occupied: next }).eq('id', carpark.id);
      if (error) throw error;
      setCarpark({ ...carpark, occupied: next });
    } catch (err) {
      console.error(err);
      setBanner((b) => (b ? b + ' | ' : '') + 'Car park update failed');
    } finally {
      setCarparkSaving(false);
    }
  };

  return (
    <div className="layout">
      <BootBadge />
      <div ref={mapDivRef} id="map" className="mapContainer" />
      <aside className="sidebar">
        <h1>One.Site Assist</h1>
        {banner && <div className="banner error">{banner}</div>}

        <section className="panel">
          <h2>Weather</h2>
          {!weather ? (<p>Loading…</p>) : (
            <div className="weather">
              <div>Temp: {weather.temperature}°C</div>
              <div>Wind: {weather.windspeed} km/h</div>
              <div>Dir: {weather.winddirection}°</div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Operational Suggestions</h2>
          <p>All clear.</p>
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
          <h2>Car Park</h2>
          {carparkLoading && <p>Loading…</p>}
          {!carparkLoading && !carpark && (
            <p style={{ opacity: 0.85 }}>
              Not available. Ensure table <code>public.carpark</code> exists and RLS allows anon select/update.
            </p>
          )}
          {carpark && (
            <>
              <div className="big">{carpark.occupied} / {carpark.capacity}</div>
              <div className="row">
                <button disabled={carparkSaving || carpark.occupied <= 0} onClick={() => adjustCarpark(-1)}>-1</button>
                <button disabled={carparkSaving || carpark.occupied >= carpark.capacity} onClick={() => adjustCarpark(1)}>+1</button>
                <button disabled={carparkSaving} onClick={loadCarpark}>Refresh</button>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Selected Plot</h2>
          {selectedPlot ? (
            <div className="plotBox">
              <div className="plotTitle">{selectedPlot.name}</div>
              <div>Status: <strong>{selectedPlot.status}</strong></div>
              <div>Lat/Lng: {selectedPlot.lat?.toFixed?.(6)} , {selectedPlot.lng?.toFixed?.(6)}</div>
              <button onClick={() => updatePlotStatus(selectedPlot)}>Cycle Status</button>
            </div>
          ) : <p>No plot selected</p>}
        </section>

        <section className="panel">
          <h2>Plots</h2>
          {plotsLoading && <p>Loading…</p>}
          {!plotsLoading && plots.length === 0 && <p>No plots yet.</p>}
          <ul className="plotsList">
            {plots.map((p) => (
              <li key={p.id}>
                <button className={`pill ${p.status.replace(' ', '-')}`} onClick={() => setSelectedPlot(p)} title={`${p.name} (${p.status})`}>
                  {p.name}: {p.status}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Add Plot</h2>
          <div className="formRow">
            <label>Name</label>
            <input value={newPlotName} onChange={(e) => setNewPlotName(e.target.value)} />
          </div>
          <div className="formRow">
            <label>Status</label>
            <select value={newPlotStatus} onChange={(e) => setNewPlotStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="formRow twoCol">
            <div>
              <label>Lat</label>
              <input value={newLat} onChange={(e) => setNewLat(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <label>Lng</label>
              <input value={newLng} onChange={(e) => setNewLng(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <div className="row">
            <button onClick={useMapCenter}>Use map center</button>
            <button disabled={addingPlot} onClick={addPlot}>{addingPlot ? 'Adding…' : 'Add plot'}</button>
          </div>
        </section>
      </aside>
    </div>
  );
}
