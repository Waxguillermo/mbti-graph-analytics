import { MBTI_TYPES, formatStudentDisplayName } from './mbtiMetadata';
import type { MbtiCode, StudentProfile, VariantKey } from './types';

const REQUIRED_HEADERS = {
  id: 'ID mail',
  mbti: 'MBTI',
  variant: 'Variante',
  E: 'Énergie · E (%)',
  N: 'Esprit · N (%)',
  T: 'Nature · T (%)',
  J: 'Tactique · J (%)',
  A: 'Identité · A (%)',
  completion: 'Complétion',
} as const;

function normalizeHeaderName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRfc4180Rows(rawCsv: string): string[][] {
  const text = rawCsv.startsWith('\uFEFF') ? rawCsv.slice(1) : rawCsv;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
    } else if (ch === '\r') {
      if (i + 1 < text.length && text[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentCell);
      currentCell = '';
      rows.push(currentRow);
      currentRow = [];
    } else if (ch === '\n') {
      currentRow.push(currentCell);
      currentCell = '';
      rows.push(currentRow);
      currentRow = [];
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

function isMbtiCode(value: string): value is MbtiCode {
  return Object.prototype.hasOwnProperty.call(MBTI_TYPES, value);
}

function normalizeVariant(raw: string): VariantKey | null {
  const cleaned = raw.trim().toUpperCase();
  if (cleaned === '-A' || cleaned === 'A') {
    return '-A';
  }
  if (cleaned === '-T' || cleaned === 'T') {
    return '-T';
  }
  return null;
}

function parseTraitPercentage(raw: string): number | null {
  const cleaned = raw
    .replace(/%/g, '')
    .replace(/[\u00a0\s]+/g, '')
    .replace(',', '.');

  if (cleaned.length === 0) {
    return null;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = parsed / 100.0;
  if (normalized < 0 || normalized > 1) {
    return null;
  }

  return normalized;
}

export function parseCohortCsv(csvText: string): StudentProfile[] {
  const rows = parseRfc4180Rows(csvText);
  if (rows.length === 0) {
    return [];
  }

  const headerIndexMap = new Map<string, number>();
  rows[0].forEach((cell, idx) => {
    const normalized = normalizeHeaderName(cell);
    if (!headerIndexMap.has(normalized)) {
      headerIndexMap.set(normalized, idx);
    }
  });

  const colIndex = {
    id: headerIndexMap.get(normalizeHeaderName(REQUIRED_HEADERS.id)),
    mbti: headerIndexMap.get(normalizeHeaderName(REQUIRED_HEADERS.mbti)),
    variant: headerIndexMap.get(normalizeHeaderName(REQUIRED_HEADERS.variant)),
    E: headerIndexMap.get(normalizeHeaderName(REQUIRED_HEADERS.E)),
    N: headerIndexMap.get(normalizeHeaderName(REQUIRED_HEADERS.N)),
    T: headerIndexMap.get(normalizeHeaderName(REQUIRED_HEADERS.T)),
    J: headerIndexMap.get(normalizeHeaderName(REQUIRED_HEADERS.J)),
    A: headerIndexMap.get(normalizeHeaderName(REQUIRED_HEADERS.A)),
    completion: headerIndexMap.get(normalizeHeaderName(REQUIRED_HEADERS.completion)),
  };

  if (
    colIndex.id === undefined ||
    colIndex.mbti === undefined ||
    colIndex.variant === undefined ||
    colIndex.E === undefined ||
    colIndex.N === undefined ||
    colIndex.T === undefined ||
    colIndex.J === undefined ||
    colIndex.A === undefined ||
    colIndex.completion === undefined
  ) {
    const missing = (Object.keys(REQUIRED_HEADERS) as Array<keyof typeof REQUIRED_HEADERS>)
      .filter((key) => colIndex[key] === undefined)
      .map((key) => REQUIRED_HEADERS[key]);
    throw new Error(`Missing required CSV column(s): ${missing.join(', ')}`);
  }

  const students: StudentProfile[] = [];
  const seenIds = new Set<string>();

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const completion = (row[colIndex.completion] ?? '').trim();
    if (completion !== 'Yes') {
      continue;
    }

    const id = (row[colIndex.id] ?? '').trim();
    if (!id || seenIds.has(id)) {
      continue;
    }

    const rawMbti = (row[colIndex.mbti] ?? '').trim().toUpperCase();
    if (!isMbtiCode(rawMbti)) {
      continue;
    }

    const variant = normalizeVariant(row[colIndex.variant] ?? '');
    if (!variant) {
      continue;
    }

    const E = parseTraitPercentage(row[colIndex.E] ?? '');
    const N = parseTraitPercentage(row[colIndex.N] ?? '');
    const T = parseTraitPercentage(row[colIndex.T] ?? '');
    const J = parseTraitPercentage(row[colIndex.J] ?? '');
    const A = parseTraitPercentage(row[colIndex.A] ?? '');

    if (E === null || N === null || T === null || J === null || A === null) {
      continue;
    }

    seenIds.add(id);

    students.push({
      id,
      displayName: formatStudentDisplayName(id),
      mbti: rawMbti,
      variant,
      fullType: `${rawMbti}${variant}`,
      group: MBTI_TYPES[rawMbti].group,
      traits: { E, N, T, J, A },
      idealPartner: {
        E: 1.0 - E,
        N,
        T,
        J: 0.5 * (J + 0.65),
        A: 0.5 * (A + 0.65),
      },
    });
  }

  return students;
}

export function inferCohortSource(
  students: StudentProfile[],
  explicitSource?: 'local-private' | 'public-anon',
): 'local-private' | 'public-anon' {
  if (explicitSource) {
    return explicitSource;
  }
  if (students.length > 0 && students.every((s) => /^S\d+$/i.test(s.id))) {
    return 'public-anon';
  }
  return 'local-private';
}
