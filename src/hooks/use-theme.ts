import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "absoluto-glamur-admin-theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && (localStorage.getItem(KEY) as Theme | null)) || null;
    const prefersDark =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const initial: Theme = stored ?? (prefersDark ? "dark" : "light");
    setThemeState(initial);
    apply(initial);
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }

  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
