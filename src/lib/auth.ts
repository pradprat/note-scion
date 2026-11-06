import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionValue } from "./session";

export async function hasSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionValue(store.get(SESSION_COOKIE)?.value);
}

/**
 * Every loader and server action calls this. Middleware also gates every page, but it is
 * only a convenience redirect, not the trust boundary.
 */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) redirect("/login");
}
