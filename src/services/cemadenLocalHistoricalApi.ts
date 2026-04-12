import type { HistoricalRainParams, HistoricalRainRecord } from '../types/rain';
import { buildHistoricalStationsTimelineFromRecords, type HistoricalStationsTimelineResult } from './gcpHistoricalRainApi';
import { createCache } from '../utils/cache';
import { getImportedCsvMap } from './cemadenImportStorage';

const csvTextCache = createCache<string, string>({ ttlMs: 60 * 60 * 1000, maxEntries: 64 });

/** Anos a sondar em `/data/cemaden/YYYY-MM.csv` (404 ignora). Por defeito: ano atual ±1 para não abrir dezenas de pedidos; outros anos via importação no browser. */
function staticCemadenYears(): number[] {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1];
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function looksLikeCemadenCsvHeader(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim());
  if (!first) return false;
  const lower = first.toLowerCase();
  if (lower.includes('<!doctype') || lower.includes('<html')) return false;
  const cols = first.split(';');
  return cols.length >= 6 && (lower.includes('datahora') || lower.includes('data') || lower.includes('estacao'));
}

function parseDatahoraToIso(datahora: string): string {
  const t = datahora.trim().replace(/\.\d+$/, '');
  const [datePart, timePart] = t.split(/\s+/);
  if (!datePart || !timePart) return new Date().toISOString();
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi, s0] = timePart.split(':');
  const s = parseInt(s0 ?? '0', 10) || 0;
  return new Date(y, mo - 1, d, Number(h), Number(mi), s).toISOString();
}

/** Exportado para validação na importação de ficheiros. */
export function parseCemadenCsv(text: string): HistoricalRainRecord[] {
  const raw = stripBom(text);
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
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

/**
 * Infere `YYYY-MM` a partir das primeiras linhas de dados (coluna datahora).
 */
export function inferMonthKeyFromCemadenCsv(text: string): string | null {
  const raw = stripBom(text);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  for (let i = 1; i < Math.min(lines.length, 80); i++) {
    const parts = lines[i].split(';');
    const datahora = parts[6]?.trim() ?? '';
    const m = datahora.match(/^(\d{4})-(\d{2})-/);
    if (m) return `${m[1]}-${m[2]}`;
  }
  return null;
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

function staticCemadenUrls(): string[] {
  const urls: string[] = [];
  for (const y of staticCemadenYears()) {
    for (let mo = 1; mo <= 12; mo++) {
      urls.push(`/data/cemaden/${y}-${String(mo).padStart(2, '0')}.csv`);
    }
  }
  return urls;
}

async function fetchOneStaticCsv(url: string): Promise<string | null> {
  const cached = csvTextCache.get(url);
  if (cached) {
    return looksLikeCemadenCsvHeader(cached) ? cached : null;
  }
  try {
    const res = await fetch(url, { headers: { Accept: 'text/csv,*/*' } });
    if (!res.ok) return null;
    const text = await res.text();
    if (!looksLikeCemadenCsvHeader(text)) return null;
    csvTextCache.set(url, text);
    return text;
  } catch {
    return null;
  }
}

async function loadStaticCsvByMonth(): Promise<Map<string, string>> {
  const urls = staticCemadenUrls();
  const settled = await Promise.all(urls.map((url) => fetchOneStaticCsv(url)));
  const byMonth = new Map<string, string>();
  for (let i = 0; i < urls.length; i++) {
    const text = settled[i];
    if (!text) continue;
    const ym = urls[i].match(/(\d{4}-\d{2})\.csv$/)?.[1];
    if (ym) byMonth.set(ym, text);
  }
  return byMonth;
}

let mergedRowsPromise: Promise<HistoricalRainRecord[]> | null = null;

async function safeImportedMap(): Promise<Map<string, string>> {
  try {
    return await getImportedCsvMap();
  } catch {
    return new Map();
  }
}

async function loadAllCemadenRows(): Promise<HistoricalRainRecord[]> {
  const [staticByMonth, imported] = await Promise.all([loadStaticCsvByMonth(), safeImportedMap()]);
  for (const [ym, text] of imported) {
    staticByMonth.set(ym, text);
  }
  const keys = [...staticByMonth.keys()].sort();
  const all: HistoricalRainRecord[] = [];
  for (const ym of keys) {
    const text = staticByMonth.get(ym);
    if (text) all.push(...parseCemadenCsv(text));
  }
  all.sort((a, b) => new Date(String(a.read_at)).getTime() - new Date(String(b.read_at)).getTime());
  return all;
}

/**
 * Histórico a partir dos CSV do CEMADEN: ficheiros em `public/data/cemaden/` (quando existirem no deploy)
 * e meses guardados localmente (IndexedDB) após importação no browser.
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

/** Invalida cache em memória (após importar/remover CSV no browser ou em testes). */
export function clearCemadenLocalCache(): void {
  mergedRowsPromise = null;
  csvTextCache.invalidate();
}
