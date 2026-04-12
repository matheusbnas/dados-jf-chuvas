# Dados JF — Chuvas (Juiz de Fora)

Aplicação web (React + Vite + Leaflet) para visualizar **chuva em tempo real** na estação automática do INMET em Juiz de Fora–MG e **histórico pluviométrico** a partir de exportações CSV do **CEMADEN** (estações no município). Inclui mapa por **zonas de influência** (Voronoi), **bairros** (OpenStreetMap), **áreas de risco** (Defesa Civil) e linha do tempo no modo histórico.

## Funcionalidades

| Área | Descrição |
|------|-----------|
| **Tempo real** | Dados da estação **A83692** (INMET) via proxy Netlify `/api/inmet/*` → API pública apitempo. Atualização periódica (ex.: 5 min). |
| **Histórico CEMADEN** | CSVs em `public/data/cemaden/YYYY-MM.csv` (sondagem ano−1…ano+1 no deploy) **ou** importação mensal no browser (IndexedDB). Linha do tempo, instantâneo ou acumulado. |
| **Mapa base** | Tipos: Rua, **Satélite** (padrão), Escuro — tiles OpenStreetMap / Esri. |
| **Influência pluviométrica** | Com **2+ estações**, células **Voronoi** recortadas ao perímetro municipal (`data/zonas-pluviometricas.geojson`); com **1 estação**, só contorno municipal (sem mancha sólida tapando o mapa). |
| **Bairros** | Polígonos OSM (`data/bairros-jf.geojson`), cores por bairro, filtro “foco” no mapa; nomes corrigidos de mojibake em runtime. |
| **Áreas de risco** | Camada opcional: `public/data/areas-risco-jf.geojson` (origem KML Google My Maps / SSPDC); classificação R1–R4; carregamento sob demanda (~6 MB). |
| **Modo demonstração** | Dados mock para testar UI sem API. |

Ocorrências (API/planilha) podem estar desativadas no código conforme configuração do projeto.

## Requisitos

- **Node.js** 18+ (recomendado; o Netlify usa 18 no `netlify.toml`)
- **npm** 9+

## Instalação e desenvolvimento

```bash
npm install
npm run dev
```

Abre o Vite em `http://localhost:5173` (porta padrão).

### Build local

```bash
npm run build
npm run preview   # testa a pasta dist
```

## Dados estáticos (importante)

| Caminho | Conteúdo |
|---------|----------|
| `public/data/cemaden/YYYY-MM.csv` | Exportações CEMADEN no build (separador `;`). Meses em falta podem ser **importados** no modo Histórico (guardados só neste navegador). |
| `data/bairros-jf.geojson` | Bairros de JF (OSM); empacotado pelo Vite. Sem este ficheiro, usa-se fallback IBGE (só contorno municipal). |
| `data/zonas-pluviometricas.geojson` | Perímetro de referência municipal / zona pluviométrica (base para recorte Voronoi). |
| `public/data/areas-risco-jf.geojson` | Polígonos de risco (gerado a partir do KML; ver script abaixo). |

No **modo Histórico**, use **Importar CSV** no painel do mapa para registar meses sem ficheiro no repositório; para partilhar em equipa ou produção, adicione o `.csv` em `public/data/cemaden/` e faça deploy (ou, no futuro, base de dados / job automático).

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste.

| Variável | Uso |
|----------|-----|
| `VITE_OCORRENCIAS_*` | Se o módulo de ocorrências estiver ativo: API ou planilha em `public/planilhas/`. |
| `VITE_GEOCODE_OCORRENCIAS` | `false` para desativar geocoding de ocorrências. |
| `VITE_GOOGLE_MAPS_API_KEY` | Opcional; o mapa principal é **Leaflet**. |

Histórico **local (CEMADEN)** não exige credenciais GCP no browser.

Para **histórico via BigQuery** (função Netlify `historical-rain`), ver [docs/GCP_SETUP.md](./docs/GCP_SETUP.md) e variável `GOOGLE_APPLICATION_CREDENTIALS_JSON` no Netlify.

## Scripts npm

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento Vite |
| `npm run build` | Build de produção → `dist/` |
| `npm run preview` | Servir `dist` localmente |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsconfig.app.json`) |
| `npm run test:gcp` | Teste de query GCP/BigQuery (se configurado) |
| `npm run geojson:risco` | Converte `data/areas-risco-jf.kml` → `public/data/areas-risco-jf.geojson` (requer KML exportado do My Maps) |

## Deploy (Netlify)

1. **Build:** `npm run build` — saída em `dist/`.
2. **Comando / pasta:** conforme [netlify.toml](./netlify.toml) (`publish = dist`, `command = npm run build`).
3. **Functions:** `netlify/functions/` (ex.: `historical-rain` para BigQuery).
4. **Redirects:** proxy INMET (`/api/inmet/*`), API histórica (`/api/historical-rain` → função), SPA fallback.

Variáveis sensíveis apenas no painel do Netlify (não commitar `.env`).

## Paleta e critérios de chuva

Mesma ideia para zonas, bolinhas e tabela: níveis por **15 min**, **1 h** ou **acumulado** (histórico), com paleta em `src/utils/rainLevel.ts` e `influenceTheme.ts`.

- **15 min (mm/15 min):** sem chuva 0 \| fraca &lt;1,25 \| moderada 1,25–6,25 \| forte 6,25–12,5 \| muito forte &gt;12,5  
- **1 h (mm/h):** sem chuva 0 \| fraca &lt;5 \| moderada 5–25 \| forte 25,1–50 \| muito forte &gt;50  

## Estrutura do repositório (resumo)

```
src/
  components/     # LeafletMap, ZoneRainLayer, PluviometerVoronoiLayer, RiskAreasLayer, MapControls…
  hooks/          # useRainData, useCitiesData, useRiskAreasData
  services/       # rainApi (INMET), cemadenLocalHistoricalApi, citiesApi, gcpHistoricalRainApi…
  utils/           # rainLevel, pluviometerVoronoi, fixBairroNameMojibake, riskAreaStyle…
data/             # GeoJSON de zonas e bairros (Vite)
public/data/      # CSV CEMADEN, areas-risco-jf.geojson (servidos em /data/...)
scripts/          # kml-to-geojson.mjs, test-gcp-query.js
netlify/functions/
docs/             # GCP_SETUP.md
```

## Documentação adicional

- [docs/GCP_SETUP.md](./docs/GCP_SETUP.md) — BigQuery / credenciais para a função de histórico GCP (opcional face ao CSV local).
- [docs/GOOGLE_MAPS_SETUP.md](./docs/GOOGLE_MAPS_SETUP.md) — Google Maps (opcional).

## Licenças e fontes

- **OpenStreetMap** — dados de bairros (ODbL); atribuição nos tiles do Leaflet.
- **CEMADEN / exportações** — uso conforme termos da fonte.
- **Áreas de risco** — mapeamento institucional (SSPDC/PJF); camada derivada de KML/My Maps para visualização cruzada com chuva.

---

*PoC de dados — Juiz de Fora, MG.*
