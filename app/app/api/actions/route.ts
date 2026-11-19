// Cached same-origin proxy for the relayer's /actions. See lib/relay-config.ts.

import { badRequest, relay } from "../../../lib/relay";
import { bucketSince } from "../../../lib/relay-config";

export async function GET(req: Request) {
  const since = bucketSince(Number(new URL(req.url).searchParams.get("since") ?? "NaN"));
  if (since === null) return badRequest("since must be unix seconds within the last 8 days");
  return relay(req, `/actions?since=${since}`);
}
