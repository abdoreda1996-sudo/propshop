import { PrismaClient, Prisma } from "@prisma/client";

/**
 * The Prisma client.
 *
 * Two things here exist to stop production-only failures:
 *
 * 1. DECIMAL NORMALISATION. The production schema stores money as `Decimal(14,2)`,
 *    because binary floating point cannot represent 0.01 and these columns hold offers
 *    and agreed prices. Prisma returns those as Decimal objects, not numbers — so
 *    `formatPriceExact(listing.price)` and `price * 0.9` would break in production while
 *    working perfectly in SQLite dev. The extension below converts them at the client
 *    boundary, so application code always receives a plain number and the dev/prod
 *    difference stays invisible.
 *
 * 2. CONNECTION LIMIT. Postgres runs out of connections long before it runs out of CPU,
 *    and Next.js can hold many concurrent requests per instance. The pool is sized from
 *    the URL so a deploy can tune it without a code change.
 */

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedClient };

/**
 * Convert Decimal to number, recursively, leaving everything else untouched.
 *
 * Safe for the magnitudes involved: EGP 20,000,000.00 needs 10 significant digits and a
 * double carries 15-17. The Decimal type is what protects the stored value; this is only
 * about what application code receives.
 */
function decimalsToNumbers<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toNumber() as unknown as T;
  }

  // Date must be checked before the generic object branch, or it gets rebuilt as a plain
  // object and every date in the app becomes `{}`.
  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value.map(decimalsToNumbers) as unknown as T;
  }

  if (typeof value === "object") {
    // Buffers and other exotic objects are returned as-is rather than reconstructed.
    if (Buffer.isBuffer(value)) return value;

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = decimalsToNumbers(v);
    }
    return out as T;
  }

  return value;
}

function createClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  return base
    .$extends({
      name: "decimal-to-number",
      query: {
        // $allOperations covers every model and every operation, including raw ones, in a
        // single hook — narrower hooks would leave a model uncovered the day one is added.
        async $allOperations({ args, query }) {
          return decimalsToNumbers(await query(args));
        },
      },
    })
    .$extends({
      /*
        The TYPE half of the same conversion. The query hook above makes every money field
        a number at runtime, but against the Postgres schema Prisma still TYPES them as
        Decimal — so the app compiled on SQLite and failed to compile on Postgres (~100
        errors across 31 files: the production build had never been run on Postgres).
        These computed fields shadow each money column with a `number` type, so the code
        compiles identically on both databases. Keep in step with MONEY_FIELDS in
        prisma/generate-postgres-schema.mjs — moneyFields.test.ts checks it.
      */
      name: "money-as-number",
      result: {
        listing: {
          price: { needs: { price: true }, compute: (r) => num(r.price) },
          remainingToDeveloper: { needs: { remainingToDeveloper: true }, compute: (r) => numOrNull(r.remainingToDeveloper) },
          maintenanceDue: { needs: { maintenanceDue: true }, compute: (r) => numOrNull(r.maintenanceDue) },
        },
        priceHistory: { price: { needs: { price: true }, compute: (r) => num(r.price) } },
        offer: { amount: { needs: { amount: true }, compute: (r) => num(r.amount) } },
        deal: {
          agreedPrice: { needs: { agreedPrice: true }, compute: (r) => num(r.agreedPrice) },
          adminFee: { needs: { adminFee: true }, compute: (r) => num(r.adminFee) },
          depositAmount: { needs: { depositAmount: true }, compute: (r) => numOrNull(r.depositAmount) },
          closedPrice: { needs: { closedPrice: true }, compute: (r) => numOrNull(r.closedPrice) },
        },
        payment: { amount: { needs: { amount: true }, compute: (r) => num(r.amount) } },
        feeConfig: { amount: { needs: { amount: true }, compute: (r) => num(r.amount) } },
        fairPriceEstimate: {
          low: { needs: { low: true }, compute: (r) => num(r.low) },
          mid: { needs: { mid: true }, compute: (r) => num(r.mid) },
          high: { needs: { high: true }, compute: (r) => num(r.high) },
        },
        servicePayment: { amount: { needs: { amount: true }, compute: (r) => num(r.amount) } },
      },
    });
}

/** Decimal | number → number (identity on SQLite, conversion on Postgres). */
function num(v: unknown): number {
  return Prisma.Decimal.isDecimal(v) ? (v as Prisma.Decimal).toNumber() : Number(v);
}
function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : num(v);
}

/** The model.field pairs typed as numbers above — read by moneyFields.test.ts. */
export const MONEY_AS_NUMBER = [
  "Listing.price", "Listing.remainingToDeveloper", "Listing.maintenanceDue", "PriceHistory.price",
  "Offer.amount", "Deal.agreedPrice", "Deal.adminFee", "Deal.depositAmount", "Deal.closedPrice",
  "Payment.amount", "FeeConfig.amount", "FairPriceEstimate.low", "FairPriceEstimate.mid",
  "FairPriceEstimate.high", "ServicePayment.amount",
] as const;

type ExtendedClient = ReturnType<typeof createClient>;

export const prisma: ExtendedClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Exported for the money tests, which assert the conversion rather than assume it. */
export const __testing = { decimalsToNumbers };
