// Unit tests for the corrected-archive CSV format-descriptor parser.
// Run with: npm run test:unit  (node via tsx; resolves @/ tsconfig paths)
import { parseCorrectedArchiveCsv } from '@/lib/csv-archive';
import { ParseError } from '@/lib/errors';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${name}` + (detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''));
  }
}

// --- Meteorological hourly: two-block layout, coords in the position block,
//     and a date-prefixed position row that must NOT be parsed as an observation.
const MET = `﻿Stationsnamn;Stationsnummer;Stationsnät;Mäthöjd (meter över marken)
Stockholm-Observatoriekullen;98210;SMHIs stationsnät;2.0

Parameternamn;Beskrivning;Enhet
Lufttemperatur;momentanvärde, 1 gång/tim;celsius

Tidsperiod (fr.o.m);Tidsperiod (t.o.m);Höjd (meter över havet);Latitud (decimalgrader);Longitud (decimalgrader)
1859-01-01 00:00:00;2024-03-31 23:59:59;43.133;59.3417;18.0549

Datum;Tid (UTC);Lufttemperatur;Kvalitet;;Tidsutsnitt:
1859-01-01;07:00:00;-1.8;G;;Kvalitetskontrollerade historiska data
1859-01-01;13:00:00;0.9;G;;Tidsperiod (fr.o.m.) = 1859-01-01 00:00:00 (UTC)
1859-01-01;20:00:00;1.8;G;;Tidsperiod (t.o.m.) = 2024-03-31 23:59:59 (UTC)
`;
{
  const r = parseCorrectedArchiveCsv(MET);
  check('met: station name', r.station.name === 'Stockholm-Observatoriekullen', r.station.name);
  check('met: station id', r.station.id === 98210, r.station.id);
  check('met: latitude from position block', r.station.latitude === 59.3417, r.station.latitude);
  check('met: longitude from position block', r.station.longitude === 18.0549, r.station.longitude);
  check('met: unit', r.parameter.unit === 'celsius', r.parameter.unit);
  // The position-block row (1859-01-01 00:00:00;...) is date-prefixed but must be skipped.
  check('met: exactly 3 observations (position row not captured)', r.observations.length === 3, r.observations.length);
  check('met: first value', r.observations[0]?.value === -1.8, r.observations[0]?.value);
  check('met: first timestamp', r.observations[0]?.timestamp === '1859-01-01T07:00:00.000Z', r.observations[0]?.timestamp);
  check('met: period from', r.period.from === '1859-01-01 00:00:00', r.period.from);
}

// --- Hydrological daily: coords on the station line (cols 3,4).
const HYDRO = `﻿Stationsnamn;StationsId;Stationsnät;Stationens latitud;Stationens longitud
ABISKO;2357;SMHIs stationsnät;68.1936;19.9859

Parameternamn;Enhet
Vattenföring (Dygn);m³/s

Datum (svensk sommartid);Vattenföring (Dygn);Kvalitet;;
1984-01-01;5.2;G;;
1984-01-02;5.4;G;;
`;
{
  const r = parseCorrectedArchiveCsv(HYDRO);
  check('hydro: station id', r.station.id === 2357, r.station.id);
  check('hydro: latitude from station line', r.station.latitude === 68.1936, r.station.latitude);
  check('hydro: longitude from station line', r.station.longitude === 19.9859, r.station.longitude);
  check('hydro: unit', r.parameter.unit === 'm³/s', r.parameter.unit);
  check('hydro: 2 observations', r.observations.length === 2, r.observations.length);
  check('hydro: value', r.observations[1]?.value === 5.4, r.observations[1]?.value);
  check('hydro: noon timestamp', r.observations[0]?.timestamp === '1984-01-01T12:00:00.000Z', r.observations[0]?.timestamp);
}

// --- Oceanographic: datetime in one field; coords on station line (cols 2,3); cm/s unit.
const OCOBS = `﻿Stationsnamn;Stationsid;Stationens latitud;Stationens longitud
HUVUDSKÄR OST BOJ;33002;58.9333;19.1667

Parameternamn;Enhet
Strömhastighet;cm/s

Datum Tid (UTC);Strömhastighet;Kvalitet;Mätdjup (m);;Tidsutsnitt
2022-03-18 14:00:00;8.39;G;0;;Tidsperiod (fr.o.m.) = 2022-03-18 14:00:00 (UTC)
2022-03-18 15:00:00;7.10;G;0;;
`;
{
  const r = parseCorrectedArchiveCsv(OCOBS);
  check('ocobs: station name', r.station.name === 'HUVUDSKÄR OST BOJ', r.station.name);
  check('ocobs: station id', r.station.id === 33002, r.station.id);
  check('ocobs: latitude from station line', r.station.latitude === 58.9333, r.station.latitude);
  check('ocobs: longitude from station line', r.station.longitude === 19.1667, r.station.longitude);
  check('ocobs: unit is cm/s', r.parameter.unit === 'cm/s', r.parameter.unit);
  check('ocobs: 2 observations', r.observations.length === 2, r.observations.length);
  check(
    'ocobs: datetime split from single field',
    r.observations[0]?.timestamp === '2022-03-18T14:00:00.000Z',
    r.observations[0]?.timestamp,
  );
  check('ocobs: value', r.observations[0]?.value === 8.39, r.observations[0]?.value);
}

// --- Daily precipitation: representative-day column (col 2) is the date.
const PRECIP = `﻿Stationsnamn;Stationsnummer;Stationsnät;Mäthöjd (meter över marken)
Karlstad Flygplats;93230;SMHIs stationsnät;2.0

Parameternamn;Beskrivning;Enhet
Nederbördsmängd;summa 1 dygn, 1 gång/dygn, kl 06;millimeter

Tidsperiod (fr.o.m);Tidsperiod (t.o.m);Höjd (meter över havet);Latitud (decimalgrader);Longitud (decimalgrader)
1945-01-01 07:00:01;2024-03-31 06:00:00;46.0;59.3666;13.4762

Från Datum Tid (UTC);Till Datum Tid (UTC);Representativt dygn;Nederbördsmängd;Kvalitet;;
1945-01-01 07:00:01;1945-01-02 07:00:00;1945-01-01;2.4;G;;
1945-01-02 07:00:01;1945-01-03 07:00:00;1945-01-02;0.0;G;;
`;
{
  const r = parseCorrectedArchiveCsv(PRECIP);
  check('precip: unit', r.parameter.unit === 'millimeter', r.parameter.unit);
  check('precip: latitude', r.station.latitude === 59.3666, r.station.latitude);
  check('precip: 2 observations', r.observations.length === 2, r.observations.length);
  check(
    'precip: representative-day date used',
    r.observations[0]?.timestamp === '1945-01-01T12:00:00.000Z',
    r.observations[0]?.timestamp,
  );
  check('precip: zero value retained (not dropped)', r.observations[1]?.value === 0.0, r.observations[1]?.value);
}

// --- Unrecognized format must throw ParseError, never return empty silently.
const UNKNOWN = `﻿Stationsnamn;Stationsid;Stationens latitud;Stationens longitud
SOME STATION;99999;58.0;18.0

Parameternamn;Enhet
Something;x

Mystery Header;col2;col3
2020-01-01;1.0;G
`;
{
  let threw = false;
  let isParseError = false;
  try {
    parseCorrectedArchiveCsv(UNKNOWN);
  } catch (e) {
    threw = true;
    isParseError = e instanceof ParseError;
  }
  check('unknown format: throws', threw);
  check('unknown format: throws ParseError (not silent empty)', isParseError);
}

console.log(`\ncsv-archive: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
