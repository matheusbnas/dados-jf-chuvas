/** Classificação oficial (SSPDC): R1 muito baixo … R4 muito alto */

export type RiskClass = 'R1' | 'R2' | 'R3' | 'R4' | 'UNK';

export function parseRiscoFromProps(props: Record<string, unknown> | null | undefined): RiskClass {
  if (!props) return 'UNK';
  const direct = String(props.Risco ?? '').trim();
  let m = direct.match(/R\s*([1-4])/i);
  if (m) return `R${m[1]}` as RiskClass;
  const blob = `${props.description ?? ''} ${props.descriptio ?? ''} ${props['descrição'] ?? ''}`;
  m = blob.match(/Risco\s*:?\s*R\s*([1-4])/i) || blob.match(/\bR\s*([1-4])\b/);
  if (m) return `R${m[1]}` as RiskClass;
  return 'UNK';
}

export function riskPolygonStyle(r: RiskClass): {
  color: string;
  weight: number;
  opacity: number;
  fillColor: string;
  fillOpacity: number;
} {
  switch (r) {
    case 'R1':
      return { color: '#0f766e', weight: 1, opacity: 0.85, fillColor: '#14b8a6', fillOpacity: 0.22 };
    case 'R2':
      return { color: '#ca8a04', weight: 1, opacity: 0.9, fillColor: '#eab308', fillOpacity: 0.28 };
    case 'R3':
      return { color: '#c2410c', weight: 1.2, opacity: 0.92, fillColor: '#f97316', fillOpacity: 0.32 };
    case 'R4':
      return { color: '#991b1b', weight: 1.4, opacity: 0.95, fillColor: '#ef4444', fillOpacity: 0.36 };
    default:
      return { color: '#64748b', weight: 1, opacity: 0.7, fillColor: '#94a3b8', fillOpacity: 0.18 };
  }
}
