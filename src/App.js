import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://woahoxnnnctszdzyjnjf.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvYWhveG5ubmN0c3pkenlqbmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2MzgxNDUsImV4cCI6MjA3MTIxNDE0NX0.byPU10k40RgB9Xypg1RbtBvjZor_hCfCWjhbuZ6gz28"
);

export default function App() {
  const [plots, setPlots] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("plots").select("*").then(({ data, error }) => {
      if (error) setError(error.message);
      else setPlots(data || []);
    });
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>One.Site Assist — Supabase Test</h1>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {plots.length === 0 ? (
        <p>No rows yet (or loading)…</p>
      ) : (
        <ul>
          {plots.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> — {p.status} — 📍 {p.lat}, {p.lng}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
