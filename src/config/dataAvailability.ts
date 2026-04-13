/**
 * Disponibilidade de dados comunicada ao utilizador (alinhado ao que está no deploy).
 */

/** Quando `true`, o modo tempo real chama o proxy INMET. Por omissão `false` até a integração estar operacional. */
export const INMET_REALTIME_OPERATIONAL =
  import.meta.env.VITE_INMET_REALTIME_OPERATIONAL === 'true';

/** Meses com CSV incluídos em `public/data/cemaden/` neste projeto (2026). Outros períodos: mapa CEMADEN + importação. */
export const CEMADEN_BUNDLED_MONTHS_LABEL_PT = 'janeiro, fevereiro e março de 2026';

/**
 * Mapa interativo oficial — CSV mensal: «Download de Dados» → «Estações pluviométricas»;
 * preencher o formulário (UF, município, mês, ano, captcha).
 * @see https://mapainterativo.cemaden.gov.br/#
 */
export const CEMADEN_PORTAL_URL = 'https://mapainterativo.cemaden.gov.br/#';

/** Texto curto reutilizado nos painéis (passos no site do CEMADEN). */
export const CEMADEN_CSV_HOWTO_SHORT_PT =
  'No Mapa Interativo: «Download de Dados» → «Estações pluviométricas». Preencha UF, município, mês, ano e a confirmação de segurança (captcha); depois faça o download do CSV.';
