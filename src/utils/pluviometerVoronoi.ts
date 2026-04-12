import voronoi from '@turf/voronoi';
import intersect from '@turf/intersect';
import bbox from '@turf/bbox';
import { featureCollection, point } from '@turf/helpers';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { RainStation } from '../types/rain';
import type { ZonaPluvFeature } from '../services/citiesApi';

function municipalityFeature(feature: ZonaPluvFeature): Feature<Polygon | MultiPolygon> | null {
  const g = feature.geometry;
  if (g.type === 'Polygon') {
    return { type: 'Feature', properties: {}, geometry: g as Polygon };
  }
  if (g.type === 'MultiPolygon' && g.coordinates.length > 0) {
    return { type: 'Feature', properties: {}, geometry: g as MultiPolygon };
  }
  return null;
}

/** Agrupa estações com as mesmas coordenadas (evita Voronoi inválido). Mantém a primeira. */
function dedupeStationsByLocation(stations: RainStation[]): RainStation[] {
  const seen = new Set<string>();
  const out: RainStation[] = [];
  for (const s of stations) {
    const lat = s.location[0];
    const lng = s.location[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Polígonos de Voronoi (ponto mais próximo) por estação, recortados ao perímetro municipal.
 * Aproxima a área de influência de cada leitura quando não há malha oficial por pluviômetro.
 */
export function buildPluviometerVoronoiGeoJson(
  stations: RainStation[],
  municipalityZona: ZonaPluvFeature
): FeatureCollection<Polygon | MultiPolygon> | null {
  const valid = dedupeStationsByLocation(stations);
  if (valid.length < 2) return null;

  const muni = municipalityFeature(municipalityZona);
  if (!muni) return null;

  const pts = featureCollection(
    valid.map((s) =>
      point([s.location[1], s.location[0]], {
        stationId: s.id,
        name: s.name,
      })
    )
  );

  const bb = bbox(muni);
  const pad = 0.035;
  const vorBbox: [number, number, number, number] = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];

  const vor = voronoi(pts, { bbox: vorBbox });
  const out: Feature<Polygon | MultiPolygon>[] = [];

  for (let i = 0; i < vor.features.length; i++) {
    const cell = vor.features[i];
    const st = valid[i];
    if (!cell.geometry || cell.geometry.type !== 'Polygon') continue;
    try {
      const clipped = intersect(
        featureCollection([
          cell as Feature<Polygon>,
          muni as Feature<Polygon | MultiPolygon>,
        ])
      );
      if (clipped?.geometry) {
        out.push({
          type: 'Feature',
          properties: {
            stationId: st.id,
            name: st.name,
            est: st.name,
          },
          geometry: clipped.geometry,
        });
      }
    } catch {
      /* geometrias inválidas ou sem interseção */
    }
  }

  if (out.length === 0) return null;
  return featureCollection(out);
}
