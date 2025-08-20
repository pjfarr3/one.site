import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// --- Step 2: Connect to Supabase ---
const supabaseUrl = "https://woahoxnnnctszdzyjnjf.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYWhveG5ubmN0c3pkenlqbmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2MzgxNDUsImV4cCI6MjA3MTIxNDE0NX0.byPU10k40RgB9Xypg1RbtBvjZor_hCfCWjhbuZ6gz28";

const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [plots, setPlots] = useState([]);

  // --- Step 3: Fetch plots from Supabase ---
  useEffect(() => {
    async function fetchPlots() {
      let { data, error } = await supabase.from("plots").select("*");
      if (error) {
        console.error("Error fetching plots:", error);
      } else {
        setPlots(data);
      }
    }
    fetchPlots();
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>My Plots</h1>
      {plots.length === 0 ? (
        <p>Loading plots...</p>
      ) : (
        <ul>
          {plots.map((plot) => (
            <li key={plot.id}>
              <strong>{plot.name}</strong> – {plot.status} <br />
              📍 {plot.lat}, {plot.lng}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


// Mount the app
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

