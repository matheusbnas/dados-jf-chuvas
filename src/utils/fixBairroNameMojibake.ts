/**
 * Corrige nomes de bairros com caracteres trocados (mojibake típico de export KML/GeoJSON em Windows).
 * Mapa exato para os 29 casos atuais em data/bairros-jf.geojson.
 */
const EXACT_FIX: Record<string, string> = {
  'Bar├úo do Retiro': 'Barão do Retiro',
  'Botan├ígua': 'Botânica',
  'Centen├írio': 'Centenário',
  'Cer├ómica': 'Cerâmica',
  'Ces├írio Alvim': 'Cesário Alvim',
  'Cruzeiro de Santo Ant├┤nio': 'Cruzeiro de Santo Antônio',
  'F├íbrica': 'Fábrica',
  'Graja├║': 'Grajaú',
  'Granjas Beth├ónia': 'Granjas Bethânia',
  'Jardim Gl├│ria': 'Jardim Glória',
  'Manoel Hon├│rio': 'Manoel Honório',
  'Mariano Proc├│pio': 'Mariano Procópio',
  'Meggliol├írio': 'Meggliolário',
  'Morro da Gl├│ria': 'Morro da Glória',
  'Mu├ºunge da Grama': 'Muçunge da Grama',
  'Nova Calif├│rnia': 'Nova Califórnia',
  'Po├ºo Rico': 'Poço Rico',
  'Sagrado Cora├º├úo de Jesus': 'Sagrado Coração de Jesus',
  'Santa Cec├¡lia': 'Santa Cecília',
  'Santa Efig├¬nia': 'Santa Efigênia',
  'Santa Rita de C├íssia': 'Santa Rita de Cássia',
  'Santo Ant├┤nio do Paraibuna': 'Santo Antônio do Paraibuna',
  'S├úo Benedito': 'São Benedito',
  'S├úo Bernardo': 'São Bernardo',
  'S├úo Dimas': 'São Dimas',
  'S├úo Geraldo': 'São Geraldo',
  'S├úo Mateus': 'São Mateus',
  'S├úo Pedro': 'São Pedro',
  'Vale do Ip├¬': 'Vale do Ipê',
};

export function fixBairroNameMojibake(raw: string): string {
  const t = raw.trim();
  if (EXACT_FIX[t]) return EXACT_FIX[t];
  return raw;
}
