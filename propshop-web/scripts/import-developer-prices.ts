/**
 * Developer price list CSV import (Phase 0 checklist).
 *
 * Ops refreshes these monthly from the price sheets we already receive. Every row must
 * carry a source and an effective date — a number without provenance is worse than no
 * number, because it will end up on a listing page as "developer price today".
 *
 * Usage:
 *   npx tsx scripts/import-developer-prices.ts <file.csv> [--dry-run]
 *
 * Expected columns (header row required, order-independent):
 *   compound_slug, unit_type, size_min, size_max, cash_price, source, effective_date
 * Optional:
 *   bedrooms, currency, delivery_date, is_available, down_payment_pct, years
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { UNIT_TYPES } from "../src/lib/enums";

const prisma = new PrismaClient();

type Row = Record<string, string>;

/** Minimal RFC-4180 parser: handles quoted fields, embedded commas and doubled quotes. */
function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((cells) => {
    const obj: Row = {};
    header.forEach((h, i) => (obj[h] = (cells[i] ?? "").trim()));
    return obj;
  });
}

/** Accepts "12,500,000", "12.5M", "12500000". */
function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "").replace(/(egp|ج\.?م)/gi, "");
  const millions = cleaned.match(/^([\d.]+)m$/i);
  if (millions) return Math.round(Number(millions[1]) * 1_000_000);
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!file) {
    console.error("Usage: npx tsx scripts/import-developer-prices.ts <file.csv> [--dry-run]");
    process.exit(1);
  }

  const full = path.resolve(file);
  if (!fs.existsSync(full)) {
    console.error(`File not found: ${full}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(full, "utf8"));
  console.log(`Parsed ${rows.length} row(s) from ${path.basename(full)}${dryRun ? " (dry run)" : ""}\n`);

  const compounds = await prisma.compound.findMany({ select: { id: true, slug: true, nameEn: true } });
  const bySlug = new Map(compounds.map((c) => [c.slug, c]));

  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const line = index + 2; // header is line 1
    const compound = bySlug.get(row.compound_slug);
    if (!compound) {
      errors.push(`line ${line}: unknown compound_slug "${row.compound_slug}"`);
      continue;
    }

    const unitType = row.unit_type?.toLowerCase();
    if (!UNIT_TYPES.includes(unitType as never)) {
      errors.push(`line ${line}: unit_type "${row.unit_type}" is not one of ${UNIT_TYPES.join("|")}`);
      continue;
    }

    const sizeMin = Number(row.size_min);
    const sizeMax = Number(row.size_max);
    if (!Number.isFinite(sizeMin) || !Number.isFinite(sizeMax) || sizeMin <= 0 || sizeMax < sizeMin) {
      errors.push(`line ${line}: size_min/size_max invalid (${row.size_min}, ${row.size_max})`);
      continue;
    }

    const cashPrice = parseMoney(row.cash_price ?? "");
    if (cashPrice === null) {
      errors.push(`line ${line}: cash_price "${row.cash_price}" is not a price`);
      continue;
    }

    // Provenance is mandatory — this number reaches a buyer's screen.
    if (!row.source?.trim()) {
      errors.push(`line ${line}: source is required`);
      continue;
    }
    const effectiveDate = parseDate(row.effective_date);
    if (!effectiveDate) {
      errors.push(`line ${line}: effective_date "${row.effective_date}" is not a date`);
      continue;
    }

    const installment =
      row.down_payment_pct || row.years
        ? JSON.stringify({
            downPaymentPct: Number(row.down_payment_pct) || null,
            years: Number(row.years) || null,
          })
        : null;

    if (!dryRun) {
      // A refresh replaces the previous row for the same compound/type/band rather than
      // stacking duplicates that would fight each other on the listing page.
      await prisma.developerPriceList.deleteMany({
        where: { compoundId: compound.id, unitType, sizeMin, sizeMax },
      });
      await prisma.developerPriceList.create({
        data: {
          compoundId: compound.id,
          unitType,
          sizeMin,
          sizeMax,
          bedrooms: Number(row.bedrooms) || null,
          cashPrice,
          currency: row.currency?.toUpperCase() || "EGP",
          installmentJson: installment,
          deliveryDate: parseDate(row.delivery_date ?? ""),
          isAvailable: row.is_available ? !/^(false|0|no)$/i.test(row.is_available) : true,
          source: row.source.trim(),
          effectiveDate,
        },
      });
    }
    imported += 1;
  }

  console.log(`${dryRun ? "Would import" : "Imported"}: ${imported}`);
  if (errors.length > 0) {
    console.log(`\nSkipped ${errors.length} row(s):`);
    for (const e of errors) console.log(`  ${e}`);
  }
  // A partly-successful import is still a failure worth surfacing to CI or a cron log.
  process.exitCode = errors.length > 0 ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
