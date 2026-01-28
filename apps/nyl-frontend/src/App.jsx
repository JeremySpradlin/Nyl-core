import { useEffect, useMemo, useState } from "react";
import LandingPage from "./pages/LandingPage.jsx";
import JournalPage from "./pages/JournalPage.jsx";
import useUiSettings from "./hooks/useUiSettings.js";

const getLocation = () => ({
  pathname: window.location.pathname || "/",
  search: window.location.search || ""
});

export default function App() {
  const [location, setLocation] = useState(getLocation());
  const { theme, setTheme, accentColor, setAccentColor } = useUiSettings();

  useEffect(() => {
    const handlePopState = () => setLocation(getLocation());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (next) => {
    if (next === location.pathname + location.search) {
      return;
    }
    window.history.pushState({}, "", next);
    setLocation(getLocation());
  };

  const isJournal = useMemo(() => location.pathname === "/journal", [location.pathname]);

  if (isJournal) {
    return <JournalPage location={location} onNavigate={navigate} />;
  }
  return (
    <LandingPage
      onNavigate={navigate}
      theme={theme}
      setTheme={setTheme}
      accentColor={accentColor}
      setAccentColor={setAccentColor}
    />
  );
}
