import React from 'react';
import { GeoJSON as GeoJSONLayer } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';
import { parseRiscoFromProps, riskPolygonStyle } from '../utils/riskAreaStyle';

interface RiskAreasLayerProps {
  data: GeoJsonObject;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const RiskAreasLayer: React.FC<RiskAreasLayerProps> = ({ data }) => {
  return (
    <GeoJSONLayer
      data={data}
      style={(feature) => {
        const props = (feature?.properties ?? {}) as Record<string, unknown>;
        const r = parseRiscoFromProps(props);
        return riskPolygonStyle(r);
      }}
      onEachFeature={(feature, layer) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const bairro = String(props.Bairro ?? '—');
        const risco = String(props.Risco ?? parseRiscoFromProps(props));
        const tipo = String(props.Tipo_Risco ?? '—');
        const regiao = String(props.Regiao ?? '');
        const html = `
          <div style="font-family:Arial,sans-serif;padding:6px 8px;max-width:260px;font-size:12px">
            <strong style="color:#1e293b">Área de risco (Defesa Civil)</strong>
            <p style="margin:6px 0 2px"><strong>Bairro:</strong> ${escapeHtml(bairro)}</p>
            <p style="margin:2px 0"><strong>Grau:</strong> ${escapeHtml(risco)}</p>
            <p style="margin:2px 0"><strong>Tipo:</strong> ${escapeHtml(tipo)}</p>
            ${regiao ? `<p style="margin:2px 0;color:#64748b;font-size:11px">${escapeHtml(regiao)}</p>` : ''}
            <p style="margin:8px 0 0;font-size:10px;color:#64748b">
              Base: mapeamento SSPDC/PJF (jan/2026). Cruzar com chuva no mapa e na linha do tempo.
            </p>
          </div>`;
        layer.bindPopup(html);
      }}
    />
  );
};
