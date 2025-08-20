import React, { useEffect, useState } from "react";
import { supabase } from "./src/supabaseClient"; // adjust path if needed

function App() {
  const [people, setPeople] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      let { data, error } = await supabase.from("people").select("*");
      if (error) console.error(error);
      else setPeople(data);
    };
    loadData();
  }, []);

  return (
    <div>
      <h1>People</h1>
      <ul>
        {people.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;
