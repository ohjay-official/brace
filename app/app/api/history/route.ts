// Cached same-origin proxy for the relayer's /history. See lib/relay-config.ts.

import { badRequest, relay } from "../../../lib/relay";
import { RELAY_ASSETS, bucketSince } from "../../../lib/relay-config";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const asset = (q.get("asset") ?? "").toUpperCase();
  if (!(RELAY_ASSETS as readonly string[]).includes(asset)) return badRequest(`unknown asset; use one of ${RELAY_ASSETS.join(", ")}`);
  const since = bucketSince(Number(q.get("since") ?? "NaN"));
  if (since === null) return badRequest("since must be unix seconds within the last 8 days");
  return relay(req, `/history?asset=${asset}&since=${since}`);
}
