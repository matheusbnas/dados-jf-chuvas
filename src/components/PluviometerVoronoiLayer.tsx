import React, { useMemo } from 'react';
import { GeoJSON as GeoJSONLayer } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';
import type { RainStation } from '../types/rain';
import type { ZonaPluvFeature } from '../services/citiesApi';
import type { MapTypeId } from './mapControlTypes';
import type { ZoneTimeWindow } from './ZoneRainLayer';
import { buildPluviometerVoronoiGeoJson } from '../utils/pluviometerVoronoi';
import { rainfallToInfluenceLevel15min, rainfallToInfluenceLevel1h } from '../types/alertaRio';
import type { InfluenceLevelValue } from '../types/alertaRio';
import { accumulatedMmToInfluenceLevel } from '../utils/rainLevel';
import { getInfluenceColor } from '../utils/influenceTheme';
import { getHexOverlayTuning } from '../utils/influenceTheme';

interface PluviometerVoronoiLayerProps {
  municipalityZona: ZonaPluvFeature;
  stations: RainStation[];
  mapType: MapTypeId;
  timeWindow: ZoneTimeWindow;
  showAccumulated?: boolean;
  showInfluenceLines?: boolean;
}

function levelForStation(
  station: RainStation | undefined,
  timeWindow: ZoneTimeWindow,
  showAccumulated: boolean
): InfluenceLevelValue {
  if (!station) return 0;
  if (showAccumulated && station.accumulated != null) {
    return accumulatedMmToInfluenceLevel(station.accumulated.mm_accumulated);
  }
  if (timeWindow === '1h') {
    return rainfallToInfluenceLevel1h(station.data.h01 ?? 0);
  }
  return rainfallToInfluenceLevel15min(station.data.m15 ?? 0);
}

export const PluviometerVoronoiLayer: React.FC<PluviometerVoronoiLayerProps> = ({
  municipalityZona,
  stations,
  mapType,
  timeWindow,
  showAccumulated = false,
  showInfluenceLines = true,
}) => {
  const zoneStroke = useMemo(() => {
    if (!showInfluenceLines) return { weight: 0, strokeOpacity: 0 };
    const base = getHexOverlayTuning(mapType, 8);
    return { ...base, strokeColor: '#ffffff', strokeOpacity: 1 };
  }, [mapType, showInfluenceLines]);

  const data = useMemo(
    () => buildPluviometerVoronoiGeoJson(stations, municipalityZona),
    [stations, municipalityZona]
  );

  const stationById = useMemo(() => {
    const m = new Map<string, RainStation>();
    stations.forEach((s) => m.set(s.id, s));
    return m;
  }, [stations]);

  if (!data?.features?.length) return null;

  return (
    <GeoJSONLayer
      data={data as GeoJsonObject}
      style={(feature) => {
        if (!feature?.properties) {
          return { fillOpacity: 0, opacity: 0, fillColor: '#ccc', color: 'transparent', weight: 0 };
        }
        const sid = String((feature.properties as { stationId?: string }).stationId ?? '');
        const st = stationById.get(sid);
        const level = levelForStation(st, timeWindow, showAccumulated);
        const fillColor = getInfluenceColor(level, mapType);
        return {
          fillColor,
          fillOpacity: 0.38,
          color: showInfluenceLines ? '#ffffff' : 'transparent',
          weight: zoneStroke.weight,
          opacity: zoneStroke.strokeOpacity,
        };
      }}
      onEachFeature={(feature, layer) => {
        if (!feature?.properties) return;
        const sid = String((feature.properties as { stationId?: string }).stationId ?? '');
        const st = stationById.get(sid);
        const nome = String((feature.properties as { name?: string })?.name ?? sid);
        const level = levelForStation(st, timeWindow, showAccumulated);
        layer.bindPopup(
          `<div style="padding:8px;font-family:Arial,sans-serif;max-width:240px">
            <strong>${nome}</strong>
            <p style="margin:6px 0 0;font-size:12px;color:#444">Área de influência aproximada (Voronoi no perímetro de JF).</p>
            <p style="margin:4px 0 0;font-size:12px;color:#444">Nível pluviométrico: ${level}</p>
            ${st ? `<p style="margin:4px 0 0;font-size:11px;color:#666">15 min: ${(st.data.m15 ?? 0).toFixed(1)} mm · 1 h: ${(st.data.h01 ?? 0).toFixed(1)} mm/h</p>` : ''}
          </div>`
        );
      }}
    />
  );
};
