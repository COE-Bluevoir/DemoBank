import { cookies } from "next/headers";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

import { getServerConfig } from "@/lib/config/env";

const DEMO_COOKIE_NAME = "northstar-demo-control";

export function getDemoControlEnabled() {
  return getServerConfig().demoControlEnabled;
}

export function getDemoControlPasscode() {
  return getServerConfig().demoControlPasscode;
}

export function demoCookieName() {
  return DEMO_COOKIE_NAME;
}

export function isDemoAuthorizedCookie(
  cookieStore: Pick<ReadonlyRequestCookies, "get">,
) {
  return cookieStore.get(DEMO_COOKIE_NAME)?.value === getDemoControlPasscode();
}

export async function isDemoAuthorized() {
  const cookieStore = await cookies();
  return isDemoAuthorizedCookie(cookieStore);
}
