import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import mapboxgl from 'mapbox-gl';
import './index.css';

mapboxgl.accessToken = 'pk.eyJ1IjoicGpmYXJyMyIsImEiOiJjbWVqM3BhYjEwMG1vMm1xdGJwb3lpd290In0.B5vwM_eiKFnm32GBNipinQ';

const MAP_CENTER = [-0.1276, 51.5072]; // London

const plotData = [
  { id: 1, coords: [-0.128, 51.507], status: 'In Progress' },
  { id: 2, coords: [-0.129, 51.5075], status: 'Not Started' },
  { id: 3, coords: [-0.127, 51.5078], status: 'Completed' },
];

const statusColors = {
  'Not Started': 'gray',
  'In Progress': 'orange',
  'Completed': 'green'
};

function App() {
  const [map, setMap] = useState(null);

  useEffect(() => {
    const initializeMap = () => {
      const mapInstance = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: MAP_CENTER,
        zoom: 15,
      });

      mapInstance.on('load', () => {
        plotData.forEach((plot) => {
          new mapboxgl.Marker({ color: statusColors[plot.status] })
            .setLngLat(plot.coords)
            .setPopup(new mapboxgl.Popup().setText(`Plot ${plot.id}: ${plot.status}`))
            .addTo(mapInstance);
        });
      });

      setMap(mapInstance);
    };

    if (!map) initializeMap();
  }, [map]);

  return (
    <div className="dashboard">
      <div id="map" className="mapContainer" />
      <iframe
        title="Chat Assistant"
        src="https://assistant.voiceflow.com/embed/YOUR_VOICEFLOW_ID"
        width="400"
        height="600"
        style={{ border: 'none', position: 'absolute', right: 0, top: 0 }}
      />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);