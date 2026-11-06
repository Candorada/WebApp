import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { categoryTotals } from './public/shop.js';

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
    if (seed) this.importSeed(seed);
    const saveCategories = this.db.prepare('UPDATE shops SET category_totals=? WHERE date=?');
    for (const row of this.db.prepare("SELECT date FROM shops WHERE category_totals='{}' AND payload IS NOT NULL").all()) {
      saveCategories.run(JSON.stringify(categoryTotals(this.snapshot(row.date).offers)), row.date);
    }
    this.revision = 0;
  }

  importSeed(seed) {
    if (seed.version !== 1 || !Array.isArray(seed.rows)) throw new Error('Invalid history seed.');
    if (this.db.prepare("SELECT value FROM metadata WHERE key='seed_imported_at'").get()?.value === seed.importedAt) return;
    const insert = this.db.prepare(`INSERT INTO shops(date,value,count,listed_value,listed_count,quality_reason,source,captured_at,source_date,exact,finalized,unpriced_count,listed_unpriced_count,category_totals)
      VALUES(?,?,?,?,?,?,'itemshop.gg',?,?,?,1,?,?,?) ON CONFLICT(date) DO UPDATE SET
      value=excluded.value,count=excluded.count,listed_value=excluded.listed_value,listed_count=excluded.listed_count,quality_reason=excluded.quality_reason,captured_at=excluded.captured_at,
      source_date=excluded.source_date,exact=excluded.exact,unpriced_count=excluded.unpriced_count,listed_unpriced_count=excluded.listed_unpriced_count,category_totals=excluded.category_totals WHERE shops.source='itemshop.gg'`);
    this.db.exec('BEGIN');
    try {
      for (const row of seed.rows) {
        if (!validDate(row.date) || !validDate(row.sourceDate) || [row.value,row.count,row.listedValue,row.listedCount,row.unpricedCount,row.listedUnpricedCount].some(value => value != null && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Invalid archived total.');
        insert.run(row.date, row.value, row.count, row.listedValue ?? null, row.listedCount ?? null, row.qualityReason ?? null, row.capturedAt, row.sourceDate, row.exact ? 1 : 0, row.unpricedCount ?? 0, row.listedUnpricedCount ?? 0, JSON.stringify(row.categories || {}));
      }
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES('seed_imported_at',?)").run(seed.importedAt);
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES('archive_gaps',?)").run(JSON.stringify(seed.gaps || []));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  recordLive(shop, now = new Date()) {
    const date = now.toISOString().slice(0, 10);
    if (shop.shopDate.slice(0, 10) !== date) return false;
    const finalized = now.getUTCHours() >= 23 ? 1 : 0;
    const result = this.db.prepare(`INSERT INTO shops(date,value,count,listed_value,listed_count,source,captured_at,source_date,exact,finalized,payload,category_totals)
      VALUES(?,?,?,?,?,'fortnite-api.com',?,?,1,?,?,?) ON CONFLICT(date) DO UPDATE SET
      value=excluded.value,count=excluded.count,listed_value=excluded.listed_value,listed_count=excluded.listed_count,quality_reason=NULL,source=excluded.source,captured_at=excluded.captured_at,
      source_date=excluded.source_date,exact=excluded.exact,finalized=excluded.finalized,payload=excluded.payload,category_totals=excluded.category_totals
      WHERE shops.finalized=0`).run(date, shop.totals.value, shop.totals.count, shop.offers.reduce((sum,offer) => sum + offer.price,0), shop.offers.length, now.toISOString(), date, finalized, gzipSync(JSON.stringify(shop)), JSON.stringify(categoryTotals(shop.offers)));
    if (result.changes) this.revision++;
    return Boolean(result.changes);
  }

  list() {
    return this.db.prepare(`SELECT date,value,count,listed_value AS listedValue,listed_count AS listedCount,unpriced_count AS unpricedCount,listed_unpriced_count AS listedUnpricedCount,quality_reason AS qualityReason,source,captured_at AS capturedAt,
      source_date AS sourceDate,exact,finalized,category_totals AS categories FROM shops ORDER BY date`).all().map(row => ({ ...row, categories: JSON.parse(row.categories) }));
  }

  get(date) {
    const row = this.db.prepare(`SELECT date,value,count,listed_value AS listedValue,listed_count AS listedCount,unpriced_count AS unpricedCount,listed_unpriced_count AS listedUnpricedCount,quality_reason AS qualityReason,source,captured_at AS capturedAt,
      source_date AS sourceDate,exact,finalized,category_totals AS categories FROM shops WHERE date=?`).get(date);
    return row ? { ...row, categories: JSON.parse(row.categories) } : null;
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
