import { useEffect, useState } from "react";

const QUERY = "(max-width: 768px)";

/**
 * True quando a viewport é estreita (celular / Android).
 * Usa matchMedia para reagir a mudanças de tamanho em tempo real.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
