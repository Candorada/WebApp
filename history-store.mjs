import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { categoryTotals, totals, typeLabel } from './public/shop.js';
import { annotateArrivals, dayAfter, arrivalCalculation } from './public/arrivals.js';

// The live feed confirms this offer as a bundle in its billboard text, which older snapshots omitted.
const pirateMikuBundleId = 'v2:/8f114946b8d166af6a3f7ae3ed7b1ae75c6a1e9c1d9508c258080c01d88a2365';

export function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

export function captureDue(row, now) {
  return !row || (!row.finalized && now.getUTCHours() >= 23);
}

export class HistoryStore {
  constructor(filename, seed) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS shops (
        date TEXT PRIMARY KEY, value INTEGER, count INTEGER,
        listed_value INTEGER, listed_count INTEGER, quality_reason TEXT,
        source TEXT NOT NULL, captured_at TEXT, source_date TEXT NOT NULL,
        exact INTEGER NOT NULL, finalized INTEGER NOT NULL, payload BLOB
      );
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    const columns = new Set(this.db.prepare('PRAGMA table_info(shops)').all().map(column => column.name));
    for (const column of ['unpriced_count', 'listed_unpriced_count']) {
      if (!columns.has(column)) this.db.exec(`ALTER TABLE shops ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
    }
    if (!columns.has('category_totals')) this.db.exec("ALTER TABLE shops ADD COLUMN category_totals TEXT NOT NULL DEFAULT '{}'");
    if (!columns.has('arrival_totals')) this.db.exec('ALTER TABLE shops ADD COLUMN arrival_totals TEXT');
    if (seed) this.importSeed(seed);
    const saveCategories = this.db.prepare('UPDATE shops SET category_totals=? WHERE date=?');
    for (const row of this.db.prepare("SELECT date FROM shops WHERE category_totals='{}' AND payload IS NOT NULL").all()) {
      saveCategories.run(JSON.stringify(categoryTotals(this.snapshot(row.date).offers)), row.date);
    }
    this.backfillArrivals();
    this.revision = 0;
  }

  backfillArrivals() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db.prepare("SELECT value FROM metadata WHERE key='arrival_calculation'").get()?.value;
      const rows = this.db.prepare('SELECT date FROM shops WHERE payload IS NOT NULL AND (arrival_totals IS NULL OR ?) ORDER BY date')
        .all(Number(previous !== arrivalCalculation));
      const save = this.db.prepare('UPDATE shops SET arrival_totals=?,payload=? WHERE date=?');
      const saveCorrectedTotals = this.db.prepare('UPDATE shops SET value=?,count=?,category_totals=? WHERE date=?');
      for (const { date } of rows) {
        const shop = this.snapshot(date);
        const missingBundle = shop.offers.find(offer => offer.id === pirateMikuBundleId && !offer.isBundle);
        if (missingBundle) {
          Object.assign(missingBundle, {
            name: "Cap'n Hatsune Miku Bundle", isBundle: true, type: 'bundle',
            typeLabel: typeLabel('bundle'), types: [...missingBundle.types, 'bundle'],
          });
          shop.totals = totals(shop.offers);
          saveCorrectedTotals.run(shop.totals.value, shop.totals.count, JSON.stringify(categoryTotals(shop.offers)), date);
        }
        this.prepareShop(shop);
        save.run(JSON.stringify(shop.arrivals), gzipSync(JSON.stringify(shop)), date);
      }
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES('arrival_calculation',?)").run(arrivalCalculation);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  importSeed(seed) {
    if (seed.version !== 1 || !Array.isArray(seed.rows)) throw new Error('Invalid history seed.');
    if (this.db.prepare("SELECT value FROM metadata WHERE key='seed_imported_at'").get()?.value === seed.importedAt) return;
    const insert = this.db.prepare(`INSERT INTO shops(date,value,count,listed_value,listed_count,quality_reason,source,captured_at,source_date,exact,finalized,unpriced_count,listed_unpriced_count,category_totals,arrival_totals)
      VALUES(?,?,?,?,?,?,'itemshop.gg',?,?,?,1,?,?,?,?) ON CONFLICT(date) DO UPDATE SET
      value=excluded.value,count=excluded.count,listed_value=excluded.listed_value,listed_count=excluded.listed_count,quality_reason=excluded.quality_reason,captured_at=excluded.captured_at,
      source_date=excluded.source_date,exact=excluded.exact,unpriced_count=excluded.unpriced_count,listed_unpriced_count=excluded.listed_unpriced_count,category_totals=excluded.category_totals,arrival_totals=excluded.arrival_totals WHERE shops.source='itemshop.gg'`);
    this.db.exec('BEGIN');
    try {
      for (const row of seed.rows) {
        if (!validDate(row.date) || !validDate(row.sourceDate) || [row.value,row.count,row.listedValue,row.listedCount,row.unpricedCount,row.listedUnpricedCount].some(value => value != null && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Invalid archived total.');
        insert.run(row.date, row.value, row.count, row.listedValue ?? null, row.listedCount ?? null, row.qualityReason ?? null, row.capturedAt, row.sourceDate, row.exact ? 1 : 0, row.unpricedCount ?? 0, row.listedUnpricedCount ?? 0, JSON.stringify(row.categories || {}), row.arrivals ? JSON.stringify(row.arrivals) : null);
      }
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES('seed_imported_at',?)").run(seed.importedAt);
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES('archive_gaps',?)").run(JSON.stringify(seed.gaps || []));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  prepareShop(shop) {
    const date = dayAfter(shop.shopDate, -1);
    let previous = this.snapshot(date);
    if (!previous) {
      try { previous = JSON.parse(gunzipSync(readFileSync(new URL(`./data/history-shops/${date}.json.gz`, import.meta.url)))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return annotateArrivals(shop, previous);
  }

  recordLive(shop, now = new Date()) {
    const date = now.toISOString().slice(0, 10);
    if (shop.shopDate.slice(0, 10) !== date) return false;
    if (!shop.arrivals) this.prepareShop(shop);
    const finalized = now.getUTCHours() >= 23 ? 1 : 0;
    const result = this.db.prepare(`INSERT INTO shops(date,value,count,listed_value,listed_count,source,captured_at,source_date,exact,finalized,payload,category_totals,arrival_totals)
      VALUES(?,?,?,?,?,'fortnite-api.com',?,?,1,?,?,?,?) ON CONFLICT(date) DO UPDATE SET
      value=excluded.value,count=excluded.count,listed_value=excluded.listed_value,listed_count=excluded.listed_count,quality_reason=NULL,source=excluded.source,captured_at=excluded.captured_at,
      source_date=excluded.source_date,exact=excluded.exact,finalized=excluded.finalized,payload=excluded.payload,category_totals=excluded.category_totals,arrival_totals=excluded.arrival_totals
      WHERE shops.finalized=0`).run(date, shop.totals.value, shop.totals.count, shop.offers.reduce((sum,offer) => sum + offer.price,0), shop.offers.length, now.toISOString(), date, finalized, gzipSync(JSON.stringify(shop)), JSON.stringify(categoryTotals(shop.offers)), JSON.stringify(shop.arrivals));
    if (result.changes) this.revision++;
    return Boolean(result.changes);
  }

  list() {
    return this.db.prepare(`SELECT date,value,count,listed_value AS listedValue,listed_count AS listedCount,unpriced_count AS unpricedCount,listed_unpriced_count AS listedUnpricedCount,quality_reason AS qualityReason,source,captured_at AS capturedAt,
      source_date AS sourceDate,exact,finalized,category_totals AS categories,arrival_totals AS arrivals FROM shops ORDER BY date`).all().map(row => ({ ...row, categories: JSON.parse(row.categories), arrivals: JSON.parse(row.arrivals) }));
  }

  get(date) {
    const row = this.db.prepare(`SELECT date,value,count,listed_value AS listedValue,listed_count AS listedCount,unpriced_count AS unpricedCount,listed_unpriced_count AS listedUnpricedCount,quality_reason AS qualityReason,source,captured_at AS capturedAt,
      source_date AS sourceDate,exact,finalized,category_totals AS categories,arrival_totals AS arrivals FROM shops WHERE date=?`).get(date);
    return row ? { ...row, categories: JSON.parse(row.categories), arrivals: JSON.parse(row.arrivals) } : null;
  }

  snapshot(date) {
    const row = this.db.prepare('SELECT payload FROM shops WHERE date=?').get(date);
    return row?.payload ? JSON.parse(gunzipSync(row.payload)) : null;
  }

  gapCount() {
    return JSON.parse(this.db.prepare("SELECT value FROM metadata WHERE key='archive_gaps'").get()?.value || '[]').length;
  }

  close() { this.db.close(); }
}
