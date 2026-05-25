import { ParseError } from '@/lib/errors';
import type { Observation } from '@/types/smhi-api';

export interface ParsedArchive {
  observations: Observation[];
  station: { name: string; id: number; latitude: number | null; longitude: number | null };
  parameter: { name: string; unit: string };
  period: { from: string; to: string };
}

interface CsvArchiveFormat {
  name: string;
  // Prefix of the line that introduces the observation rows. Used as the format
  // discriminator: rows are only the lines that follow this header, which steps
  // over the met "position block" (whose value row is itself date-prefixed).
  dataHeaderPrefix: string;
  parseRow(fields: string[]): Observation | null;
}

function isoFromDateAndTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}/.test(time)) return null;
  return new Date(`${date}T${time.slice(0, 8)}Z`).toISOString();
}

function isoAtNoon(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return new Date(`${date}T12:00:00Z`).toISOString();
}

// Each upstream SMHI corrected-archive CSV uses a different row layout. Keyed off
// the observation data-header so the discriminator is unambiguous.
const CSV_ARCHIVE_FORMATS: CsvArchiveFormat[] = [
  {
    // Oceanographic: "Datum Tid (UTC);<param>;Kvalitet;Mätdjup (m);;Tidsutsnitt"
    //   row: "2001-05-10 22:00:00;0.36;G;0;;..."  (datetime in one field)
    name: 'oceanographic',
    dataHeaderPrefix: 'Datum Tid (UTC)',
    parseRow(f) {
      if (f.length < 3) return null;
      const [date, time] = f[0].split(' ');
      const timestamp = time ? isoFromDateAndTime(date, time) : null;
      const value = parseFloat(f[1]);
      if (!timestamp || Number.isNaN(value)) return null;
      return { timestamp, value, quality: f[2] };
    },
  },
  {
    // Meteorological hourly: "Datum;Tid (UTC);<param>;Kvalitet;;"
    //   row: "1985-06-01;00:00:00;6.5;G;;"
    name: 'met-hourly',
    dataHeaderPrefix: 'Datum;Tid (UTC)',
    parseRow(f) {
      if (f.length < 4) return null;
      const timestamp = isoFromDateAndTime(f[0], f[1]);
      const value = parseFloat(f[2]);
      if (!timestamp || Number.isNaN(value)) return null;
      return { timestamp, value, quality: f[3] };
    },
  },
  {
    // Daily precipitation: "Från Datum Tid;Till Datum Tid;Representativt dygn;<param>;Kvalitet"
    //   row: "1945-01-01 07:00:01;1945-01-02 07:00:00;1945-01-01;2.4;G;;" (col 2 = representative day)
    name: 'daily-precip',
    dataHeaderPrefix: 'Från Datum Tid',
    parseRow(f) {
      if (f.length < 5) return null;
      const timestamp = isoAtNoon(f[2]);
      const value = parseFloat(f[3]);
      if (!timestamp || Number.isNaN(value)) return null;
      return { timestamp, value, quality: f[4] };
    },
  },
  {
    // Hydrological daily: "Datum (svensk sommartid);<param>;Kvalitet;;"
    //   row: "1901-01-01;248;G;;;"
    name: 'hydrological',
    dataHeaderPrefix: 'Datum (svensk sommartid)',
    parseRow(f) {
      if (f.length < 3) return null;
      const timestamp = isoAtNoon(f[0]);
      const value = parseFloat(f[1]);
      if (!timestamp || Number.isNaN(value)) return null;
      return { timestamp, value, quality: f[2] };
    },
  },
];

// Period markers appear inline in early data rows (met, ocobs) as
// "Tidsperiod (fr.o.m.) = 2001-05-10 22:00:00 (UTC)" — scanned format-agnostically.
function extractPeriod(lines: string[]): { from: string; to: string } {
  let from = '';
  let to = '';
  for (const line of lines) {
    const fromMatch = line.match(/Tidsperiod \(fr\.o\.m\.?\) = (\d{4}-\d{2}-\d{2})/);
    if (fromMatch && !from) from = `${fromMatch[1]} 00:00:00`;
    const toMatch = line.match(/Tidsperiod \(t\.o\.m\.?\) = (\d{4}-\d{2}-\d{2})/);
    if (toMatch) to = `${toMatch[1]} 23:59:59`;
  }
  return { from, to };
}

export function parseCorrectedArchiveCsv(csv: string): ParsedArchive {
  const lines = csv.split('\n').map((l) => l.replace(/\r$/, ''));

  let stationName = '';
  let stationId = 0;
  let latitude: number | null = null;
  let longitude: number | null = null;
  let parameterName = '';
  let unit = '';
  const observations: Observation[] = [];
  let format: CsvArchiveFormat | null = null;
  const headersSeen: string[] = [];

  // The value row immediately following a labelled header line carries that
  // section's data (station name/id/coords, parameter/unit, position block).
  const valuesAfter = (index: number): string[] | null => {
    for (let j = index + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      if (trimmed) return trimmed.split(';');
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const matched = CSV_ARCHIVE_FORMATS.find((f) => line.startsWith(f.dataHeaderPrefix));
    if (matched) {
      format = matched;
      for (let k = i + 1; k < lines.length; k++) {
        const row = lines[k].trim();
        if (!row) continue;
        const observation = matched.parseRow(row.split(';'));
        if (observation) observations.push(observation);
      }
      break;
    }

    headersSeen.push(line);
    const columns = line.split(';');
    const labels = columns.map((c) => c.trim().toLowerCase());

    if (labels[0] === 'stationsnamn') {
      const values = valuesAfter(i);
      if (values) {
        stationName = values[0]?.trim() || stationName;
        const idIndex = labels.findIndex((c) => c === 'stationsid' || c === 'stationsnummer');
        if (idIndex >= 0) stationId = parseInt(values[idIndex]) || stationId;
      }
    }

    // Coordinates live on the station line (ocobs/hydro) or a separate position
    // block (met). Locate by column label so layout differences don't matter.
    const latIndex = labels.findIndex((c) => c.includes('latitud'));
    const lonIndex = labels.findIndex((c) => c.includes('longitud'));
    if (latIndex >= 0 && lonIndex >= 0) {
      const values = valuesAfter(i);
      if (values) {
        const lat = parseFloat(values[latIndex]);
        const lon = parseFloat(values[lonIndex]);
        if (!Number.isNaN(lat)) latitude = lat;
        if (!Number.isNaN(lon)) longitude = lon;
      }
    }

    if (labels[0] === 'parameternamn') {
      const values = valuesAfter(i);
      if (values) {
        parameterName = values[0]?.trim() || parameterName;
        const unitIndex = labels.findIndex((c) => c === 'enhet');
        unit = (unitIndex >= 0 ? values[unitIndex] : values[values.length - 1])?.trim() || unit;
      }
    }
  }

  if (!format) {
    throw new ParseError('Unrecognized corrected-archive CSV: no known data header found.', {
      headersSeen: headersSeen.slice(0, 6),
    });
  }

  return {
    observations,
    station: { name: stationName, id: stationId, latitude, longitude },
    parameter: { name: parameterName, unit },
    period: extractPeriod(lines),
  };
}
