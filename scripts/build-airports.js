#!/usr/bin/env node

/**
 * Downloads and processes OurAirports CSV into a compact JSON lookup file.
 * Run: node scripts/build-airports.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_URL = 'https://ourairports.com/data/airports.csv';
const OUTPUT_PATH = resolve(__dirname, '../src/data/airports.json');

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

async function main() {
  console.log('Downloading airports.csv from OurAirports...');

  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const csv = await response.text();
  const lines = csv.split('\n');

  // Parse quoted headers
  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/"/g, ''));

  console.log('Headers:', headers.join(', '));

  const isoCountryIdx = headers.indexOf('iso_country');
  const municipalityIdx = headers.indexOf('municipality');
  const nameIdx = headers.indexOf('name');
  const typeIdx = headers.indexOf('type');
  const icaoCodeIdx = headers.indexOf('icao_code');
  const iataCodeIdx = headers.indexOf('iata_code');
  const latitudeIdx = headers.indexOf('latitude_deg');
  const longitudeIdx = headers.indexOf('longitude_deg');

  console.log(`Column indices: type=${typeIdx}, icao=${icaoCodeIdx}, iata=${iataCodeIdx}, name=${nameIdx}`);

  const airports = {};
  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);

    const icao = fields[icaoCodeIdx]?.trim().replace(/"/g, '');
    const type = fields[typeIdx]?.trim().replace(/"/g, '');

    // Only include airports with ICAO codes and relevant types
    if (!icao || icao === '') continue;
    if (!['large_airport', 'medium_airport', 'small_airport'].includes(type)) continue;

    const name = fields[nameIdx]?.trim().replace(/"/g, '') || '';
    const iata = fields[iataCodeIdx]?.trim().replace(/"/g, '') || null;
    const country = fields[isoCountryIdx]?.trim().replace(/"/g, '') || '';
    const city = fields[municipalityIdx]?.trim().replace(/"/g, '') || '';
    const latitude = parseFloat(fields[latitudeIdx]) || 0;
    const longitude = parseFloat(fields[longitudeIdx]) || 0;

    if (latitude === 0 && longitude === 0) continue;

    airports[icao] = {
      name,
      iata: iata || null,
      city: city || null,
      country,
      latitude,
      longitude
    };

    count++;
  }

  console.log(`Processed ${count} airports with ICAO codes`);

  // Ensure output directory exists
  mkdirSync(resolve(__dirname, '../src/data'), { recursive: true });

  writeFileSync(OUTPUT_PATH, JSON.stringify(airports, null, 0));
  console.log(`Written to ${OUTPUT_PATH}`);

  // Stats
  const withIata = Object.values(airports).filter(a => a.iata).length;
  console.log(`  - ${count} airports total`);
  console.log(`  - ${withIata} with IATA codes`);
  console.log(`  - File size: ${(JSON.stringify(airports).length / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
