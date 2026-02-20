// Maps Swedish admin codes to WGS84 coordinates for SMHI API calls

import kommunerData from '@/data/kommuner.json';
import lanData from '@/data/lan.json';

interface Kommun {
  code: string;
  name: string;
}

interface Lan {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
}

// Map kommun code prefix (first 2 digits) to län code
const KOMMUN_PREFIX_TO_LAN: Record<string, string> = {
  '01': 'AB', // Stockholm
  '03': 'C', // Uppsala
  '04': 'D', // Södermanland
  '05': 'E', // Östergötland
  '06': 'F', // Jönköping
  '07': 'G', // Kronoberg
  '08': 'H', // Kalmar
  '09': 'I', // Gotland
  '10': 'K', // Blekinge
  '12': 'M', // Skåne
  '13': 'N', // Halland
  '14': 'O', // Västra Götaland
  '17': 'S', // Värmland
  '18': 'T', // Örebro
  '19': 'U', // Västmanland
  '20': 'W', // Dalarna
  '21': 'X', // Gävleborg
  '22': 'Y', // Västernorrland
  '23': 'Z', // Jämtland
  '24': 'AC', // Västerbotten
  '25': 'BD', // Norrbotten
};

const kommuner = kommunerData as Kommun[];
const lan = lanData as Lan[];

// Create lookup maps for efficient access (codes only)
const kommunByCode = new Map(kommuner.map((k) => [k.code, k]));
const lanByCode = new Map(lan.map((l) => [l.code, l]));

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  name: string;
  type: 'kommun' | 'lan';
  code: string;
}

// Uses län centroid since kommun-level coordinates aren't available
export function resolveKommun(code: string): ResolvedLocation | null {
  if (!/^\d{4}$/.test(code)) {
    return null;
  }

  const kommun = kommunByCode.get(code);
  if (!kommun) {
    return null;
  }

  // Get län from kommun code prefix
  const prefix = kommun.code.substring(0, 2);
  const lanCode = KOMMUN_PREFIX_TO_LAN[prefix];

  if (!lanCode) {
    return null;
  }

  const lanInfo = lanByCode.get(lanCode);
  if (!lanInfo) {
    return null;
  }

  return {
    latitude: lanInfo.latitude,
    longitude: lanInfo.longitude,
    name: kommun.name,
    type: 'kommun',
    code: kommun.code,
  };
}

export function resolveLan(code: string): ResolvedLocation | null {
  if (!/^[A-Za-z]{1,2}$/.test(code)) {
    return null;
  }

  const lanInfo = lanByCode.get(code.toUpperCase());
  if (!lanInfo) {
    return null;
  }

  return {
    latitude: lanInfo.latitude,
    longitude: lanInfo.longitude,
    name: lanInfo.name,
    type: 'lan',
    code: lanInfo.code,
  };
}

export function resolveLocation(code: string): ResolvedLocation | null {
  if (/^\d{4}$/.test(code)) {
    return resolveKommun(code);
  }

  if (/^[A-Za-z]{1,2}$/.test(code)) {
    return resolveLan(code);
  }

  return null;
}

export function listKommuner(): Kommun[] {
  return kommuner;
}

export function listLan(): Lan[] {
  return lan;
}

export function getKommunerInLan(lanCode: string): Kommun[] {
  const upperCode = lanCode.toUpperCase();

  // Find the prefix for this län
  const prefix = Object.entries(KOMMUN_PREFIX_TO_LAN).find(([, code]) => code === upperCode)?.[0];

  if (!prefix) {
    return [];
  }

  return kommuner.filter((k) => k.code.startsWith(prefix));
}
