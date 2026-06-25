"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      title={light ? "Switch to dark mode" : "Switch to light mode"}
      aria-label="Toggle theme"
      className="rounded-md border border-cyan-500/20 px-2 py-1 text-xs text-slate-400 transition hover:text-slate-200"
    >
      {light ? "☾ Dark" : "☀ Light"}
    </button>
  );
}
