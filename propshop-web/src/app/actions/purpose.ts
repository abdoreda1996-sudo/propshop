"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isPurpose, PURPOSE_COOKIE, PURPOSE_COOKIE_MAX_AGE, DEFAULT_PURPOSE } from "@/lib/purpose";

/**
 * Set the site-wide Buy / Rent preference.
 *
 * A server action rather than a `document.cookie` write in the toggle: the cookie is read
 * by server components (both search bars and the category links), so writing it on the
 * client meant setting it in one place and then asking the server to re-render from a
 * value it had not yet been sent. Here the write and the revalidation are one round trip,
 * and the cookie gets real attributes — httpOnly is deliberately NOT set, since nothing
 * reads it client-side but nothing about it is secret either.
 *
 * The value is validated before it is stored, so an unexpected argument can never reach a
 * Prisma `where` through this path.
 */
export async function setPurpose(value: string) {
  const purpose = isPurpose(value) ? value : DEFAULT_PURPOSE;
  const store = await cookies();
  store.set(PURPOSE_COOKIE, purpose, {
    path: "/",
    maxAge: PURPOSE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  // The chrome is rendered in the root layout, so the whole tree re-reads the cookie.
  revalidatePath("/", "layout");
}
