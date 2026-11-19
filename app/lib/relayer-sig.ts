// Fallback for the proof log: the relayer's /health only knows the transactions its own Worker
// instance sent, so a fresh instance shows none. Devnet itself always knows the relayer's latest post.

export type LatestSig = { sig: string; blockTime: number | null };

/** Newest successful signature from a getSignaturesForAddress JSON-RPC response. */
export function latestOkSig(body: unknown): LatestSig | null {
  const list = (body as { result?: unknown } | null)?.result;
  if (!Array.isArray(list)) return null;
  for (const row of list) {
    const r = row as { signature?: unknown; err?: unknown; blockTime?: unknown };
    if (r.err == null && typeof r.signature === "string") {
      return { sig: r.signature, blockTime: typeof r.blockTime === "number" ? r.blockTime : null };
    }
  }
  return null;
}

export function signaturesRequest(address: string, limit = 5) {
  return { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [address, { limit, commitment: "confirmed" }] };
}
