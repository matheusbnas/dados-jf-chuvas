/**
 * Converte KML (ex.: export Google My Maps) em GeoJSON para uso no mapa.
 * Uso: node scripts/kml-to-geojson.mjs data/areas-risco-jf.kml data/areas-risco-jf.geojson
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import tj from '@mapbox/togeojson';
import { DOMParser } from '@xmldom/xmldom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const input = path.resolve(root, process.argv[2] || 'data/areas-risco-jf.kml');
const output = path.resolve(root, process.argv[3] || 'public/data/areas-risco-jf.geojson');

const kml = fs.readFileSync(input, 'utf8');
const dom = new DOMParser().parseFromString(kml, 'text/xml');
const geojson = tj.kml(dom);
fs.writeFileSync(output, JSON.stringify(geojson));
console.log('OK', output, `(${Math.round(fs.statSync(output).size / 1024)} KB)`);
