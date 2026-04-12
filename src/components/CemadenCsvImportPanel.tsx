import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Database } from 'lucide-react';
import {
  listCemadenImports,
  saveCemadenImport,
  deleteCemadenImport,
  isCemadenImportStorageAvailable,
  type CemadenImportMeta,
} from '../services/cemadenImportStorage';
import {
  inferMonthKeyFromCemadenCsv,
  parseCemadenCsv,
  clearCemadenLocalCache,
} from '../services/cemadenLocalHistoricalApi';

const controlBoxClass = 'bg-white/95 backdrop-blur rounded-lg shadow-md border border-gray-200 p-2 min-w-0 shrink-0';

function formatMonthBr(ym: string): string {
  const [y, m] = ym.split('-');
  if (!y || !m) return ym;
  const mo = Number(m);
  const names = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  return `${names[mo - 1] ?? m} ${y}`;
}

interface CemadenCsvImportPanelProps {
  /** Após guardar ou apagar um mês, invalida cache e recarrega histórico (ex.: Aplicar de novo). */
  onStorageChanged?: () => void;
}

export const CemadenCsvImportPanel: React.FC<CemadenCsvImportPanelProps> = ({ onStorageChanged }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [storageOk, setStorageOk] = useState<boolean | null>(null);
  const [imports, setImports] = useState<CemadenImportMeta[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingMonthOverride, setPendingMonthOverride] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);

  const reloadList = useCallback(async () => {
    try {
      const list = await listCemadenImports();
      setImports(list.sort((a, b) => a.monthKey.localeCompare(b.monthKey)));
    } catch {
      setImports([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isCemadenImportStorageAvailable();
      if (cancelled) return;
      setStorageOk(ok);
      if (ok) await reloadList();
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadList]);

  const finishImport = async (monthKey: string, text: string) => {
    const rows = parseCemadenCsv(text);
    if (rows.length === 0) {
      setError('Não foi possível ler linhas de dados no formato CEMADEN (separador ;).');
      setPendingMonthOverride(null);
      setPendingText(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveCemadenImport(monthKey, text);
      clearCemadenLocalCache();
      setMessage(`Mês ${formatMonthBr(monthKey)} guardado neste navegador (${rows.length} leituras).`);
      setPendingMonthOverride(null);
      setPendingText(null);
      await reloadList();
      onStorageChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao guardar.');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setMessage(null);
    const text = await file.text();
    if (!text.trim()) {
      setError('Ficheiro vazio.');
      return;
    }
    const inferred = inferMonthKeyFromCemadenCsv(text);
    if (inferred) {
      await finishImport(inferred, text);
      return;
    }
    const now = new Date();
    const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setPendingText(text);
    setPendingMonthOverride(fallback);
    setError('Não foi possível detetar o mês pelas datas. Confirme abaixo.');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) void handleFile(f);
  };

  const handleRemove = async (monthKey: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteCemadenImport(monthKey);
      clearCemadenLocalCache();
      setMessage(`Removido: ${formatMonthBr(monthKey)}`);
      await reloadList();
      onStorageChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover.');
    } finally {
      setBusy(false);
    }
  };

  if (storageOk === false) {
    return (
      <div className={controlBoxClass} style={{ fontFamily: 'Arial, sans-serif' }}>
        <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-gray-700">
          <Database className="w-3.5 h-3.5 shrink-0" />
          CSV CEMADEN (importar)
        </div>
        <p className="text-[10px] text-amber-800">Armazenamento local indisponível (IndexedDB bloqueado ou modo privado).</p>
      </div>
    );
  }

  if (storageOk === null) {
    return (
      <div className={controlBoxClass} style={{ fontFamily: 'Arial, sans-serif' }}>
        <p className="text-[10px] text-gray-500">A preparar importação…</p>
      </div>
    );
  }

  return (
    <div className={controlBoxClass} style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-gray-700">
        <Database className="w-3.5 h-3.5 shrink-0" />
        CSV CEMADEN (importar)
      </div>
      <p className="text-[10px] text-gray-500 mb-2 leading-snug">
        Importe exportações mensais em falta; ficam guardadas neste navegador até apagar. No deploy, acrescente ficheiros em{' '}
        <code className="text-[9px] bg-gray-100 px-0.5 rounded">public/data/cemaden/</code> ou use base de dados no futuro.
      </p>

      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleInputChange} />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="w-full flex items-center justify-center gap-1.5 rounded bg-slate-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        <Upload className="w-3.5 h-3.5" />
        Escolher ficheiro .csv
      </button>

      {pendingText && pendingMonthOverride != null && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 space-y-1.5">
          <label className="block text-[10px] font-medium text-amber-900">Mês do ficheiro (AAAA-MM)</label>
          <input
            type="month"
            value={pendingMonthOverride}
            onChange={(e) => setPendingMonthOverride(e.target.value)}
            className="w-full rounded border border-amber-300 px-2 py-1 text-xs"
          />
          <div className="flex gap-1">
            <button
              type="button"
              disabled={busy || !pendingMonthOverride}
              onClick={() => pendingText && pendingMonthOverride && void finishImport(pendingMonthOverride, pendingText)}
              className="flex-1 rounded bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingText(null);
                setPendingMonthOverride(null);
                setError(null);
              }}
              className="px-2 py-1 text-[11px] text-amber-900"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-2 text-[10px] text-green-700">{message}</p>}
      {error && (
        <p className="mt-2 text-[10px] text-red-600" role="alert">
          {error}
        </p>
      )}

      {imports.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <p className="text-[10px] font-medium text-gray-600 mb-1">Guardado localmente</p>
          <ul className="max-h-28 overflow-y-auto space-y-1">
            {imports.map((im) => (
              <li key={im.monthKey} className="flex items-center justify-between gap-1 text-[10px] text-gray-700">
                <span title={`${im.sizeBytes} bytes`}>
                  {formatMonthBr(im.monthKey)}
                  <span className="text-gray-400 ml-1">({im.monthKey})</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRemove(im.monthKey)}
                  className="p-0.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                  title="Remover deste navegador"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
