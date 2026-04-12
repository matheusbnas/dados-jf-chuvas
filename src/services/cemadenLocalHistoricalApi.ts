import type { HistoricalRainParams, HistoricalRainRecord } from '../types/rain';
import { buildHistoricalStationsTimelineFromRecords, type HistoricalStationsTimelineResult } from './gcpHistoricalRainApi';
import { createCache } from '../utils/cache';

const csvTextCache = createCache<string, string>({ ttlMs: 60 * 60 * 1000, maxEntries: 8 });

/**
 * CSVs exportados do CEMADEN (Juiz de Fora) — um arquivo por mês de 2026.
 * Coloque os ficheiros em `public/data/cemaden/` (servidos em /data/cemaden/...).
 */
const CEMADEN_CSV_URLS = [
  '/data/cemaden/2026-01.csv',
  '/data/cemaden/2026-02.csv',
  '/data/cemaden/2026-03.csv',
] as const;

function parseDatahoraToIso(datahora: string): string {
  const t = datahora.trim().replace(/\.\d+$/, '');
  const [datePart, timePart] = t.split(/\s+/);
  if (!datePart || !timePart) return new Date().toISOString();
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi, s0] = timePart.split(':');
  const s = parseInt(s0 ?? '0', 10) || 0;
  return new Date(y, mo - 1, d, Number(h), Number(mi), s).toISOString();
}

function parseCemadenCsv(text: string): HistoricalRainRecord[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const out: HistoricalRainRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 8) continue;
    const codEstacao = parts[1]?.trim();
    const nomeEstacao = parts[3]?.trim();
    const lat = parseFloat(parts[4]?.replace(',', '.') ?? '');
    const lng = parseFloat(parts[5]?.replace(',', '.') ?? '');
    const datahora = parts[6]?.trim() ?? '';
    const mm = parseFloat(parts[7]?.replace(',', '.') ?? '0');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !codEstacao) continue;
    const readAt = parseDatahoraToIso(datahora);
    const m = Number.isFinite(mm) ? Math.max(0, mm) : 0;
    out.push({
      read_at: readAt,
      latitude: lat,
      longitude: lng,
      station_name: nomeEstacao || codEstacao,
      station_id: codEstacao,
      m15: m,
      m05: 0,
      h01: m,
    });
  }
  return out;
}

function filterRowsByParams(rows: HistoricalRainRecord[], params: HistoricalRainParams): HistoricalRainRecord[] {
  const df = params.dateFrom?.trim().slice(0, 10);
  const dt = params.dateTo?.trim().slice(0, 10);
  if (!df || !dt) return rows;

  const timeFrom = params.timeFrom?.trim() || '00:00';
  const timeTo = params.timeTo?.trim() || '23:59';
  const pad = (n: number) => String(n).padStart(2, '0');
  const [hF, mF] = timeFrom.split(':').map((x) => parseInt(x, 10));
  const [hT, mT] = timeTo.split(':').map((x) => parseInt(x, 10));
  const start = new Date(`${df}T${pad(hF || 0)}:${pad(mF || 0)}:00`).getTime();
  const end = new Date(`${dt}T${pad(hT ?? 23)}:${pad(mT ?? 59)}:59`).getTime();

  return rows.filter((r) => {
    const raw = r.read_at;
    if (typeof raw !== 'string') return false;
    const ms = new Date(raw).getTime();
    if (Number.isNaN(ms)) return false;
    return ms >= start && ms <= end;
  });
}

let mergedRowsPromise: Promise<HistoricalRainRecord[]> | null = null;

async function loadAllCemadenRows(): Promise<HistoricalRainRecord[]> {
  const all: HistoricalRainRecord[] = [];
  for (const url of CEMADEN_CSV_URLS) {
    const cached = csvTextCache.get(url);
    let text: string;
    if (cached) {
      text = cached;
    } else {
      const res = await fetch(url, { headers: { Accept: 'text/csv,*/*' } });
      if (!res.ok) {
        console.warn(`[CEMADEN local] Falha ao carregar ${url}: ${res.status}`);
        continue;
      }
      text = await res.text();
      csvTextCache.set(url, text);
    }
    all.push(...parseCemadenCsv(text));
  }
  all.sort((a, b) => new Date(String(a.read_at)).getTime() - new Date(String(b.read_at)).getTime());
  return all;
}

/**
 * Histórico a partir dos CSV do CEMADEN em `public/data/cemaden/` (jan–mar/2026).
 */
export async function fetchCemadenLocalHistoricalTimeline(
  params: HistoricalRainParams = {},
  selectedTimestamp?: string | null
): Promise<HistoricalStationsTimelineResult> {
  if (!mergedRowsPromise) mergedRowsPromise = loadAllCemadenRows();
  const merged = await mergedRowsPromise;
  const filtered = filterRowsByParams(merged, params);
  return buildHistoricalStationsTimelineFromRecords(filtered, params, selectedTimestamp);
}

/** Invalida cache em memória (útil em testes). */
export function clearCemadenLocalCache(): void {
  mergedRowsPromise = null;
  csvTextCache.invalidate();
}
