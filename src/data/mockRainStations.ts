import type { HistoricalRainRecord, RainStation } from '../types/rain';
import { INMET_JUIZ_DE_FORA_LOCATION, INMET_STATION_LABEL } from '../config/inmet';
import {
  buildHistoricalStationsTimelineFromRecords,
  type HistoricalStationsTimelineResult,
} from '../services/gcpHistoricalRainApi';

/**
 * Estações de demonstração em torno do centro urbano (coordenadas aproximadas) para testar
 * Voronoi, legenda e tabela sem API.
 */
const DEMO_BASE = INMET_JUIZ_DE_FORA_LOCATION;
const DEMO_OFFSETS: [number, number][] = [
  [0, 0],
  [0.018, -0.022],
  [-0.02, 0.015],
  [0.012, 0.028],
  [-0.015, -0.03],
  [0.025, 0.01],
];

const DEMO_NAMES = [
  `${INMET_STATION_LABEL} (demo)`,
  'Pluv. — Centro / Matriz (demo)',
  'Pluv. — Norte / São Pedro (demo)',
  'Pluv. — Sul / Santos Dumont (demo)',
  'Pluv. — Leste / Borboleta (demo)',
  'Pluv. — Oeste / Marumbi (demo)',
];

function stationAt(i: number): RainStation {
  const [lat0, lng0] = DEMO_BASE;
  const [dlat, dlng] = DEMO_OFFSETS[i] ?? [0, 0];
  const seed = (i + 1) * 7;
  const m15 = Math.round((0.3 + (seed % 11) * 0.35) * 10) / 10;
  const h01 = Math.round((2 + (seed % 9) * 1.2) * 10) / 10;
  const now = new Date().toISOString();
  return {
    id: `mock-demo-${i}`,
    name: DEMO_NAMES[i] ?? `Estação demo ${i + 1}`,
    location: [lat0 + dlat, lng0 + dlng],
    read_at: now,
    is_new: false,
    meteo: {
      temperaturaC: 22 + (i % 5),
      umidadePct: 65 + (i % 20),
      pressaoHpa: 920 + i * 0.8,
      ventoVelMps: 1.2 + i * 0.3,
      ventoDirGraus: (180 + i * 40) % 360,
    },
    data: {
      m05: Math.min(m15, 2.5),
      m15,
      h01,
      h02: h01 * 1.4,
      h03: h01 * 2,
      h04: h01 * 2.4,
      h24: 18 + i * 6,
      h96: 40 + i * 10,
      mes: 95 + i * 12,
    },
  };
}

/** Várias estações fictícias (tempo real de demonstração). */
export const MOCK_RAIN_STATIONS: RainStation[] = DEMO_OFFSETS.map((_, i) => stationAt(i));

/** Gera horários de hora em hora entre início e fim (limitado para não explodir). */
function hourlyRange(
  dateFrom: string,
  dateTo: string,
  timeFrom: string,
  timeTo: string
): Date[] {
  const [y0, m0, d0] = dateFrom.slice(0, 10).split('-').map(Number);
  const [y1, m1, d1] = dateTo.slice(0, 10).split('-').map(Number);
  const [hf, mf] = (timeFrom || '00:00').split(':').map((x) => parseInt(x, 10));
  const [ht, mt] = (timeTo || '23:59').split(':').map((x) => parseInt(x, 10));
  const start = new Date(y0, m0 - 1, d0, Number.isFinite(hf) ? hf : 0, Number.isFinite(mf) ? mf : 0, 0);
  const end = new Date(y1, m1 - 1, d1, Number.isFinite(ht) ? ht : 23, Number.isFinite(mt) ? mt : 59, 59);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const out: Date[] = [];
  const cur = new Date(start);
  cur.setMinutes(0, 0, 0);
  if (cur < start) cur.setHours(cur.getHours() + 1);
  const maxPoints = 96;
  while (cur <= end && out.length < maxPoints) {
    out.push(new Date(cur));
    cur.setHours(cur.getHours() + 1);
  }
  return out;
}

/** IDs estáveis para bater com o catálogo de estações no histórico sintético. */
const DEMO_STATION_IDS = ['demo-ema', 'demo-norte', 'demo-sul', 'demo-leste', 'demo-oeste', 'demo-centro'];

function buildSyntheticHistoricalRecords(params: {
  dateFrom: string;
  dateTo: string;
  timeFrom?: string;
  timeTo?: string;
}): HistoricalRainRecord[] {
  const { dateFrom, dateTo, timeFrom = '00:00', timeTo = '23:59' } = params;
  const hours = hourlyRange(dateFrom, dateTo, timeFrom, timeTo);
  if (hours.length === 0) return [];

  const rows: HistoricalRainRecord[] = [];
  const [lat0, lng0] = DEMO_BASE;

  hours.forEach((when, hi) => {
    DEMO_OFFSETS.forEach((off, si) => {
      const lat = lat0 + off[0];
      const lng = lng0 + off[1];
      const wave = Math.sin((hi + 1) * 0.7 + si * 0.9) * 4 + 5;
      const m15 = Math.max(0, Math.round(wave * 10) / 10);
      const h01 = Math.round((m15 * 2.2 + si * 0.15) * 10) / 10;
      rows.push({
        read_at: when.toISOString(),
        station_id: DEMO_STATION_IDS[si] ?? `demo-${si}`,
        station_name: DEMO_NAMES[si] ?? `Estação demo ${si + 1}`,
        latitude: lat,
        longitude: lng,
        m15,
        m05: m15 > 0 ? Math.min(m15, 2) : 0,
        h01,
        h24: h01 * 4 + si,
      });
    });
  });

  return rows;
}

/**
 * Histórico de demonstração: mesma forma que CSV CEMADEN (timeline + estações por instante),
 * com chuva sintética para o intervalo escolhido em «Aplicar».
 */
export function getMockHistoricalTimelineDemo(params: {
  dateFrom: string;
  dateTo: string;
  timeFrom?: string;
  timeTo?: string;
}): HistoricalStationsTimelineResult {
  const raw = buildSyntheticHistoricalRecords(params);
  if (raw.length === 0) {
    return { timeline: [], selectedTimestamp: null, stations: [], stationsByTimestamp: {} };
  }
  return buildHistoricalStationsTimelineFromRecords(
    raw,
    {
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      timeFrom: params.timeFrom,
      timeTo: params.timeTo,
    },
    null
  );
}
