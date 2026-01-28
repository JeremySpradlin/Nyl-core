import { useEffect, useState } from "react";

const DEFAULT_ACCENT = "#d07a4a";

const hexToRgb = (hex) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return null;
  }
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) {
    return null;
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
};

const darkenHex = (hex, amount) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  const clamp = (value) => Math.max(0, Math.min(255, value));
  const toHex = (value) => clamp(value).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r + amount)}${toHex(rgb.g + amount)}${toHex(rgb.b + amount)}`;
};

const buildRing = (hex, alpha) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const mixHexColors = (foregroundHex, backgroundHex, ratio) => {
  const foreground = hexToRgb(foregroundHex);
  const background = hexToRgb(backgroundHex);
  if (!foreground || !background) {
    return foregroundHex;
  }
  const mixChannel = (front, back) => Math.round(front * ratio + back * (1 - ratio));
  return `rgb(${mixChannel(foreground.r, background.r)}, ${mixChannel(
    foreground.g,
    background.g
  )}, ${mixChannel(foreground.b, background.b)})`;
};

export default function useUiSettings() {
  const [theme, setTheme] = useState("light");
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const savedTheme = window.localStorage.getItem("nyl-theme");
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      setTheme(prefersDark ? "dark" : "light");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const savedAccent = window.localStorage.getItem("nyl-accent");
    if (savedAccent) {
      setAccentColor(savedAccent);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.setAttribute("data-theme", theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("nyl-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    const accentDark = darkenHex(accentColor, -32);
    root.style.setProperty("--accent", accentColor);
    root.style.setProperty("--accent-dark", accentDark);
    root.style.setProperty("--ring", buildRing(accentColor, 0.35));
    const supportsColorMix =
      typeof CSS !== "undefined" && CSS.supports?.("color", "color-mix(in srgb, #000 50%, #fff)");
    if (supportsColorMix) {
      root.style.removeProperty("--glow");
    } else {
      const bgStart = getComputedStyle(root).getPropertyValue("--bg-start").trim();
      const glowRatio = theme === "dark" ? 0.4 : 0.35;
      root.style.setProperty("--glow", mixHexColors(accentColor, bgStart, glowRatio));
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("nyl-accent", accentColor);
    }
  }, [accentColor, theme]);

  return {
    theme,
    setTheme,
    accentColor,
    setAccentColor
  };
}
