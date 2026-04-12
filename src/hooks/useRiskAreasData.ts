import { useState, useEffect } from 'react';
import type { FeatureCollection } from 'geojson';

const RISK_GEOJSON_URL = '/data/areas-risco-jf.geojson';

/**
 * Carrega o GeoJSON das áreas de risco (Defesa Civil / Google My Maps export) só quando a camada está ativa.
 */
export function useRiskAreasData(enabled: boolean) {
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (data) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(RISK_GEOJSON_URL, { headers: { Accept: 'application/geo+json, application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: FeatureCollection) => {
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar áreas de risco');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, data]);

  return { data, loading, error };
}
