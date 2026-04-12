import type { RainStation } from '../types/rain';
import { INMET_JUIZ_DE_FORA_LOCATION, INMET_STATION_LABEL } from '../config/inmet';

/**
 * Mock de uma estação INMET (Juiz de Fora) para validar mapa de influência sem chamar a API.
 * h01 em mm/h → níveis da legenda (0 / fraca / moderada / forte / muito forte).
 */
const NOW = new Date().toISOString();

export const MOCK_RAIN_STATIONS: RainStation[] = [
  {
    id: 'mock-inmet-jf',
    name: `${INMET_STATION_LABEL} (mock)`,
    location: INMET_JUIZ_DE_FORA_LOCATION,
    read_at: NOW,
    is_new: false,
    meteo: {
      temperaturaC: 24.5,
      umidadePct: 72,
      pressaoHpa: 925.3,
      ventoVelMps: 2.1,
      ventoDirGraus: 180,
    },
    data: {
      m05: 0.5,
      m15: 2.0,
      h01: 8.5,
      h02: 15,
      h03: 22,
      h04: 28,
      h24: 42,
      h96: 88,
      mes: 120,
    },
  },
];
