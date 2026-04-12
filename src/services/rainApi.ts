import { RainStation } from '../types/rain';
import {
  INMET_JUIZ_DE_FORA_LOCATION,
  INMET_STATION_CODE,
  INMET_STATION_LABEL,
} from '../config/inmet';

/** Base via proxy (Vite/Netlify) → https://apitempo.inmet.gov.br */
const INMET_API_BASE = '/api/inmet';

function buildInmetStationUrl(dateFrom: string, dateTo: string): string {
  const url = new URL(
    `${INMET_API_BASE}/estacao/${dateFrom}/${dateTo}/${INMET_STATION_CODE}`,
    window.location.origin
  );
  url.searchParams.set('_ts', String(Date.now()));
  return `${url.pathname}${url.search}`;
}

type InmetRow = Record<string, unknown>;

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** HR_MEDICAO no INMET: inteiro HHMM (ex.: 1430 → 14:30). */
function parseHrMedicao(hr: unknown): { h: number; m: number } {
  const n = Math.floor(toNum(hr));
  return { h: Math.floor(n / 100), m: n % 100 };
}

function rowTimestampIso(dateStr: string, hrRaw: unknown): string {
  const { h, m } = parseHrMedicao(hrRaw);
  const d = String(dateStr).slice(0, 10);
  return `${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`;
}

function rowTimeMs(dateStr: string, hrRaw: unknown): number {
  return new Date(rowTimestampIso(dateStr, hrRaw)).getTime();
}

function sumChuva(rows: InmetRow[], count: number): number {
  let s = 0;
  for (let i = 0; i < Math.min(count, rows.length); i++) s += toNum(rows[i]?.CHUVA);
  return s;
}

function numOrUndef(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function meteoFromLatestRow(row: InmetRow): RainStation['meteo'] | undefined {
  const temperaturaC = numOrUndef(row.TEM_INS) ?? numOrUndef(row.TEM_CPU);
  const umidadePct = numOrUndef(row.UMD_INS);
  const pressaoHpa = numOrUndef(row.PRE_INS) ?? numOrUndef(row.PRE_MED);
  const ventoVelMps = numOrUndef(row.VEN_VEL);
  const ventoDirGraus = numOrUndef(row.VEN_DIR);
  const ventoRajadaMps = numOrUndef(row.VEN_RAJ) ?? numOrUndef(row.VEN_GUST);

  if (
    temperaturaC == null &&
    umidadePct == null &&
    pressaoHpa == null &&
    ventoVelMps == null &&
    ventoDirGraus == null &&
    ventoRajadaMps == null
  ) {
    return undefined;
  }

  return {
    temperaturaC,
    umidadePct,
    pressaoHpa,
    ventoVelMps,
    ventoDirGraus,
    ventoRajadaMps,
  };
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateRangeForRequest(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { dateFrom: localYmd(first), dateTo: localYmd(now) };
}

/**
 * Dados horários da estação automática INMET (chuva + variáveis da última hora).
 * Acumulados h02–h96 e mês calculados a partir da série horária (CHUVA em mm/hora).
 */
export const fetchRainData = async (): Promise<RainStation[]> => {
  try {
    const { dateFrom, dateTo } = dateRangeForRequest();
    const url = buildInmetStationUrl(dateFrom, dateTo);
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`INMET: HTTP ${response.status} ${response.statusText}`);
    }

    const raw: unknown = await response.json();
    const rows: InmetRow[] = Array.isArray(raw) ? (raw as InmetRow[]) : [];
    if (rows.length === 0) {
      throw new Error('INMET: resposta vazia para o período');
    }

    const sorted = [...rows].sort((a, b) => {
      const ta = rowTimeMs(String(a.DT_MEDICAO ?? ''), a.HR_MEDICAO);
      const tb = rowTimeMs(String(b.DT_MEDICAO ?? ''), b.HR_MEDICAO);
      return tb - ta;
    });

    const latest = sorted[0];
    const readAt = rowTimestampIso(String(latest.DT_MEDICAO ?? dateTo), latest.HR_MEDICAO);
    const h01 = toNum(latest.CHUVA);

    const meteo = meteoFromLatestRow(latest);

    const yM = String(latest.DT_MEDICAO ?? '').slice(0, 7);
    const mesRows = sorted.filter((r) => String(r.DT_MEDICAO ?? '').startsWith(yM));
    const mes = mesRows.reduce((acc, r) => acc + toNum(r.CHUVA), 0);

    return [
      {
        id: `inmet-${INMET_STATION_CODE.toLowerCase()}`,
        name: INMET_STATION_LABEL,
        location: INMET_JUIZ_DE_FORA_LOCATION,
        read_at: readAt,
        is_new: false,
        meteo,
        data: {
          /** INMET horário: sem subhora; reparte a última hora em janelas para compatibilidade com o mapa. */
          m05: h01 > 0 ? h01 / 12 : 0,
          m15: h01 > 0 ? h01 / 4 : 0,
          h01,
          h02: sumChuva(sorted, 2),
          h03: sumChuva(sorted, 3),
          h04: sumChuva(sorted, 4),
          h24: sumChuva(sorted, 24),
          h96: sumChuva(sorted, 96),
          mes,
        },
      },
    ];
  } catch (error) {
    console.error('Erro ao buscar dados INMET:', error);
    return [];
  }
};

export const checkApiAvailability = async (): Promise<boolean> => {
  try {
    const { dateFrom, dateTo } = dateRangeForRequest();
    const response = await fetch(buildInmetStationUrl(dateFrom, dateTo), {
      method: 'GET',
      mode: 'cors',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const getLastUpdateInfo = async (): Promise<{ lastUpdate: Date | null; totalStations: number }> => {
  try {
    const stations = await fetchRainData();
    if (stations.length === 0) {
      return { lastUpdate: null, totalStations: 0 };
    }
    const lastUpdate = new Date(Math.max(...stations.map((s) => new Date(s.read_at).getTime())));
    return { lastUpdate, totalStations: stations.length };
  } catch {
    return { lastUpdate: null, totalStations: 0 };
  }
};
