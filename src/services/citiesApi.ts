export interface BairroFeature {
  type: 'Feature';
  id: number;
  geometry: {
    type: 'MultiPolygon';
    coordinates: number[][][][];
  };
  properties: {
    objectid: number;
    nome: string;
    regiao_adm: string;
    area_plane: string;
    codbairro: string;
    codra: number;
    codbnum: number;
    link: string;
    rp: string;
    cod_rp: string;
    codbairro_long: number;
    st_area: number;
    st_perimeter: number;
  };
}

export interface BairroCollection {
  type: 'FeatureCollection';
  features: BairroFeature[];
}

import { createCache } from '../utils/cache';
import { fixBairroNameMojibake } from '../utils/fixBairroNameMojibake';
import bairrosJfGeojsonUrl from '../../data/bairros-jf.geojson?url';

/** Limite municipal Juiz de Fora–MG (IBGE código 3136702), formato GeoJSON */
const JF_IBGE_MALHA_URL =
  'https://servicodados.ibge.gov.br/api/v3/malhas/municipios/3136702?qualidade=minima&formato=application/vnd.geo+json';

const BAIRROS_CACHE = createCache<string, BairroCollection>({ ttlMs: 60 * 60 * 1000, maxEntries: 1 });
const ZONAS_CACHE = createCache<string, ZonasPluvCollection>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 1 });

/** Fallback: retângulo aproximado em torno de Juiz de Fora */
const JUIZ_DE_FORA_BAIRROS_FALLBACK: BairroCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 1,
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[[
          [-43.55, -21.65],
          [-43.15, -21.65],
          [-43.15, -21.95],
          [-43.55, -21.95],
          [-43.55, -21.65],
        ]]],
      },
      properties: {
        objectid: 1,
        nome: 'Juiz de Fora (MG)',
        regiao_adm: 'MUNICÍPIO',
        area_plane: '3136702',
        codbairro: '3136702',
        codra: 1,
        codbnum: 1,
        link: 'IBGE 3136702',
        rp: 'Zona da Mata',
        cod_rp: 'MG',
        codbairro_long: 3136702,
        st_area: 0,
        st_perimeter: 0,
      },
    },
  ],
};

/** Bump para invalidar cache após correção de nomes (mojibake). */
const BAIRROS_CACHE_KEY = 'bairros_v2';

/** Lista ordenada de nomes para filtros no mapa */
export function listSortedBairroNomes(data: BairroCollection): string[] {
  return [...new Set(data.features.map((f) => f.properties.nome))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );
}

function normalizeJfOsmGeojsonToBairroCollection(raw: { features?: unknown[] }): BairroCollection {
  const list = Array.isArray(raw.features) ? raw.features : [];
  const features: BairroFeature[] = [];
  let i = 0;
  for (const f of list as Array<{ geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }>) {
    if (!f.geometry?.type) continue;
    const g = f.geometry;
    let coordinates: number[][][][];
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
      coordinates = [g.coordinates as number[][][]];
    } else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
      coordinates = g.coordinates as number[][][][];
    } else {
      continue;
    }
    const p = f.properties ?? {};
    const nome = fixBairroNameMojibake(String(p.nome ?? p.name ?? `Bairro ${i + 1}`));
    i += 1;
    features.push({
      type: 'Feature',
      id: i,
      geometry: { type: 'MultiPolygon', coordinates },
      properties: {
        objectid: i,
        nome,
        regiao_adm: 'Juiz de Fora',
        area_plane: String(p.id ?? ''),
        codbairro: String(i),
        codra: 0,
        codbnum: i,
        link: 'OpenStreetMap (ODbL)',
        rp: 'Zona da Mata',
        cod_rp: 'MG',
        codbairro_long: 3136702,
        st_area: 0,
        st_perimeter: 0,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

interface IbgeMalhaResponse {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Polygon'; coordinates: number[][][] };
    properties: { codarea: string };
  }>;
}

function ibgeToBairroCollection(data: IbgeMalhaResponse): BairroCollection {
  return {
    type: 'FeatureCollection',
    features: data.features.map((f, i) => ({
      type: 'Feature' as const,
      id: i + 1,
      geometry: {
        type: 'MultiPolygon' as const,
        coordinates: [f.geometry.coordinates],
      },
      properties: {
        objectid: i + 1,
        nome: 'Juiz de Fora (MG)',
        regiao_adm: 'MUNICÍPIO',
        area_plane: f.properties.codarea,
        codbairro: f.properties.codarea,
        codra: 1,
        codbnum: 1,
        link: `IBGE ${f.properties.codarea}`,
        rp: 'Zona da Mata',
        cod_rp: 'MG',
        codbairro_long: Number(f.properties.codarea) || 3136702,
        st_area: 0,
        st_perimeter: 0,
      },
    })),
  };
}

/** Limite dos bairros (polígonos) ou contorno municipal IBGE se o GeoJSON local falhar */
export const fetchRioBairrosData = async (): Promise<BairroCollection> => {
  const cached = BAIRROS_CACHE.get(BAIRROS_CACHE_KEY);
  if (cached) return cached;
  try {
    const localRes = await fetch(bairrosJfGeojsonUrl, {
      headers: { Accept: 'application/geo+json, application/json, */*' },
    });
    if (localRes.ok) {
      const raw = (await localRes.json()) as { features?: unknown[] };
      const mapped = normalizeJfOsmGeojsonToBairroCollection(raw);
      if (mapped.features.length > 0) {
        BAIRROS_CACHE.set(BAIRROS_CACHE_KEY, mapped);
        return mapped;
      }
    }
  } catch (e) {
    console.warn('GeoJSON de bairros (data/bairros-jf.geojson) indisponível, tentando IBGE:', e);
  }

  try {
    const response = await fetch(JF_IBGE_MALHA_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Erro ao buscar malha IBGE: ${response.status}`);
    }
    const raw: IbgeMalhaResponse = await response.json();
    if (!raw.features?.length) {
      throw new Error('Malha IBGE vazia');
    }
    const mapped = ibgeToBairroCollection(raw);
    BAIRROS_CACHE.set(BAIRROS_CACHE_KEY, mapped);
    return mapped;
  } catch (error) {
    console.warn('Erro ao buscar malha IBGE, usando fallback:', error);
    return JUIZ_DE_FORA_BAIRROS_FALLBACK;
  }
};

// Função para encontrar bairro por nome (busca parcial)
export const findBairroByName = (bairroData: BairroCollection, searchName: string): BairroFeature | null => {
  const normalizedSearch = searchName.toLowerCase().trim();
  
  return bairroData.features.find(feature => {
    const nome = feature.properties.nome.toLowerCase();
    const regiao = feature.properties.regiao_adm.toLowerCase();
    
    return nome.includes(normalizedSearch) || 
           regiao.includes(normalizedSearch) ||
           normalizedSearch.includes(nome) ||
           normalizedSearch.includes(regiao);
  }) || null;
};

// Função para obter coordenadas centrais de um bairro
export const getBairroCenter = (feature: BairroFeature): [number, number] => {
  // Para MultiPolygon, pega o primeiro polígono
  const coordinates = feature.geometry.coordinates[0][0];
  
  let sumLng = 0;
  let sumLat = 0;
  
  coordinates.forEach(coord => {
    sumLng += coord[0];
    sumLat += coord[1];
  });
  
  return [sumLng / coordinates.length, sumLat / coordinates.length];
};

// Função para obter apenas o bairro do Centro (como referência)
export const getCentroBairro = (bairroData: BairroCollection): BairroFeature | null => {
  return bairroData.features.find(feature => 
    feature.properties.nome.toLowerCase().includes('centro') ||
    feature.properties.regiao_adm.toLowerCase().includes('centro')
  ) || null;
};

// Função para validar coordenadas
export const isValidCoordinate = (coord: [number, number]): boolean => {
  return !isNaN(coord[0]) && !isNaN(coord[1]) && 
         isFinite(coord[0]) && isFinite(coord[1]) &&
         coord[0] !== 0 && coord[1] !== 0;
};

// Função para obter todos os bairros de uma região administrativa
export const getBairrosByRegiao = (bairroData: BairroCollection, regiao: string): BairroFeature[] => {
  return bairroData.features.filter(feature => 
    feature.properties.regiao_adm.toLowerCase().includes(regiao.toLowerCase())
  );
};

// Função para obter estatísticas dos bairros
export const getBairrosStats = (bairroData: BairroCollection) => {
  const totalBairros = bairroData.features.length;
  const regioes = [...new Set(bairroData.features.map(f => f.properties.regiao_adm))];
  
  return {
    totalBairros,
    totalRegioes: regioes.length,
    regioes: regioes.sort()
  };
};

// --- Zonas Pluviométricas (GeoJSON do KML) ---

export interface ZonaPluvFeature {
  type: 'Feature';
  properties: {
    objectid: number;
    name: string;
    endereço?: string;
    est?: string;
    cod: number;
    Shape__Area?: number;
    Shape__Length?: number;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

export interface ZonasPluvCollection {
  type: 'FeatureCollection';
  features: ZonaPluvFeature[];
}

// Carregado de data/ via Vite (?url copia para dist e devolve a URL)
import zonasPluvGeojsonUrl from '../../data/zonas-pluviometricas.geojson?url';

const ZONAS_CACHE_KEY = 'zonas';

export const fetchZonasPluvData = async (): Promise<ZonasPluvCollection> => {
  const cached = ZONAS_CACHE.get(ZONAS_CACHE_KEY);
  if (cached) return cached;
  const response = await fetch(zonasPluvGeojsonUrl);
  if (!response.ok) {
    throw new Error(`Erro ao carregar zonas pluviométricas: ${response.status}`);
  }
  const data: ZonasPluvCollection = await response.json();
  if (!data.features?.length) {
    throw new Error('Nenhuma zona pluviométrica encontrada');
  }
  ZONAS_CACHE.set(ZONAS_CACHE_KEY, data);
  return data;
};