// Loads index futures/options expiry dates from the CSVs in /public/data.
// CSV columns: 0=index name, 1=expiry (YYMMDD), 2 & 3 ignored for now.

export type ProductType = 'index' | 'futures' | 'options';

// index name -> sorted list of expiry dates as "YYMMDD"
export type ExpiryMap = Record<string, string[]>;

const FILES: Record<Exclude<ProductType, 'index'>, string> = {
  futures: '/data/futures_expiry.csv',
  options: '/data/option_expiry.csv',
};

const cache: Partial<Record<Exclude<ProductType, 'index'>, ExpiryMap>> = {};

function parseCsv(text: string): ExpiryMap {
  const map: ExpiryMap = {};
  for (const line of text.split('\n')) {
    const row = line.trim();
    if (!row) continue;
    const [name, expiry] = row.split(',');
    if (!name || !expiry) continue;
    (map[name] ??= []).push(expiry.trim());
  }
  for (const name of Object.keys(map)) {
    map[name] = Array.from(new Set(map[name])).sort();
  }
  return map;
}

export async function loadExpiries(product: Exclude<ProductType, 'index'>): Promise<ExpiryMap> {
  if (cache[product]) return cache[product]!;
  const res = await fetch(FILES[product]);
  if (!res.ok) throw new Error(`Failed to load ${product} expiries`);
  const map = parseCsv(await res.text());
  cache[product] = map;
  return map;
}

// "230519" -> Date (UTC midnight)
export function yymmddToDate(yymmdd: string): Date {
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  return new Date(Date.UTC(2000 + yy, mm - 1, dd));
}

// "230519" -> "19 May '23"
export function formatExpiry(yymmdd: string): string {
  return yymmddToDate(yymmdd).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC',
  });
}

// "230519" -> "2023-05-19T06:00:00.000Z" for the Breeze API expiry_date param
export function expiryToApiDate(yymmdd: string): string {
  const d = yymmddToDate(yymmdd);
  return `${d.toISOString().slice(0, 10)}T06:00:00.000Z`;
}
