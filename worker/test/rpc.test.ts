import { describe, expect, test } from "vitest";
import {
  isRetryableRpcError,
  parseRpcUrls,
  relayerRpcUrls,
  retryAfterMs,
  retryWithBackoff,
  rpcAwareFetch,
  rotateUrls,
  withRpcFallback,
} from "../src/rpc.ts";

describe("parseRpcUrls", () => {
  test("splits a comma-separated RPC_URLS list, trims, and de-duplicates in order", () => {
    expect(
      parseRpcUrls({
        RPC_URL: "https://ignored.example/rpc",
        RPC_URLS:
          "https://solana-devnet.api.onfinality.io/public, https://example.com/rpc ,https://solana-devnet.api.onfinality.io/public",
      }),
    ).toEqual(["https://solana-devnet.api.onfinality.io/public", "https://example.com/rpc"]);
  });

  test("falls back to RPC_URL, then the known-good onfinality default", () => {
    expect(parseRpcUrls({ RPC_URL: "https://only.example/rpc" })).toEqual(["https://only.example/rpc"]);
    expect(parseRpcUrls({})).toEqual(["https://solana-devnet.api.onfinality.io/public"]);
  });
});

describe("retry and fallback", () => {
  test("retries retryable errors with exponential backoff", async () => {
    const sleeps: number[] = [];
    let n = 0;
    const value = await retryWithBackoff(
      async () => {
        n++;
        if (n < 3) {
          const err = new Error("rpc http 429") as Error & { status: number };
          err.status = 429;
          throw err;
        }
        return "ok";
      },
      { retries: 3, sleep: async (ms) => { sleeps.push(ms); } },
    );
    expect(value).toBe("ok");
    expect(n).toBe(3);
    expect(sleeps).toEqual([200, 400]);
  });

  test("does not retry a non-429 program error", async () => {
    let n = 0;
    await expect(
      retryWithBackoff(
        async () => {
          n++;
          throw new Error("Simulation failed: custom program error: 0x1775");
        },
        { retries: 3, sleep: async () => {} },
      ),
    ).rejects.toThrow(/0x1775/);
    expect(n).toBe(1);
  });

  test("honors Retry-After milliseconds attached to the error", () => {
    const err = new Error("rpc http 429") as Error & { status: number; retryAfterMs: number };
    err.status = 429;
    err.retryAfterMs = 1500;
    expect(retryAfterMs(err, 0)).toBe(1500);
    expect(isRetryableRpcError(err)).toBe(true);
  });

  test("falls through to the next URL after retries are exhausted", async () => {
    const tried: string[] = [];
    const { result, url } = await withRpcFallback(
      ["https://a.example", "https://b.example"],
      async (u) => {
        tried.push(u);
        if (u.endsWith("a.example")) {
          const err = new Error("rpc http 429") as Error & { status: number };
          err.status = 429;
          throw err;
        }
        return "from-b";
      },
      { retries: 1, sleep: async () => {} },
    );
    expect(result).toBe("from-b");
    expect(url).toBe("https://b.example");
    expect(tried).toEqual(["https://a.example", "https://a.example", "https://b.example"]);
  });

  test("rpcAwareFetch throws a retryable error on HTTP 429", async () => {
    const inner = (async () => new Response("slow down", { status: 429, headers: { "retry-after": "2" } })) as typeof fetch;
    const wrapped = rpcAwareFetch(inner);
    try {
      await wrapped("https://example.com");
      throw new Error("expected throw");
    } catch (err) {
      expect(isRetryableRpcError(err)).toBe(true);
      expect((err as { status: number }).status).toBe(429);
      expect((err as { retryAfterMs: number }).retryAfterMs).toBe(2000);
    }
  });
});


describe("rotateUrls", () => {
  const urls = [
    "https://solana-devnet.api.onfinality.io/public",
    "https://solana-devnet.gateway.tatum.io",
  ];

  test("rotates so offset becomes first and wraps", () => {
    expect(rotateUrls(urls, 0)).toEqual(urls);
    expect(rotateUrls(urls, 1)).toEqual([urls[1], urls[0]]);
    expect(rotateUrls(urls, 2)).toEqual(urls);
    expect(rotateUrls(urls, 5)).toEqual([urls[1], urls[0]]);
  });

  test("treats a negative offset modulo the length and leaves short lists alone", () => {
    expect(rotateUrls(urls, -1)).toEqual([urls[1], urls[0]]);
    expect(rotateUrls(["https://only.example"], 9)).toEqual(["https://only.example"]);
    expect(rotateUrls([], 3)).toEqual([]);
  });
});

describe("RPC_URL_BACKUP (keyed fallback, kept last and out of rotation)", () => {
  const PUB = "https://solana-devnet.api.onfinality.io/public,https://solana-devnet.gateway.tatum.io";
  const BACKUP = "https://example.solana-devnet.quiknode.pro/SECRETKEY123/";

  test("is appended after the public URLs", () => {
    expect(parseRpcUrls({ RPC_URLS: PUB, RPC_URL_BACKUP: BACKUP })).toEqual([
      "https://solana-devnet.api.onfinality.io/public",
      "https://solana-devnet.gateway.tatum.io",
      BACKUP,
    ]);
  });

  test("is ignored when blank, not https, or already in the list", () => {
    expect(parseRpcUrls({ RPC_URLS: PUB, RPC_URL_BACKUP: "  " })).toHaveLength(2);
    expect(parseRpcUrls({ RPC_URLS: PUB, RPC_URL_BACKUP: "http://insecure.example" })).toHaveLength(2);
    expect(parseRpcUrls({ RPC_URLS: PUB, RPC_URL_BACKUP: "https://solana-devnet.gateway.tatum.io" })).toHaveLength(2);
  });

  test("without public URLs it still follows the default devnet URL", () => {
    expect(parseRpcUrls({ RPC_URL_BACKUP: BACKUP })).toEqual(["https://solana-devnet.api.onfinality.io/public", BACKUP]);
  });

  test("relayerRpcUrls rotates only the public URLs and keeps the backup last", () => {
    const env = { RPC_URLS: PUB, RPC_URL_BACKUP: BACKUP };
    for (const offset of [0, 1, 2, 3, 7]) {
      const urls = relayerRpcUrls(env, offset);
      expect(urls).toHaveLength(3);
      expect(urls[2]).toBe(BACKUP);
    }
    expect(relayerRpcUrls(env, 1)[0]).toBe("https://solana-devnet.gateway.tatum.io");
    expect(relayerRpcUrls({ RPC_URLS: PUB }, 1)).toEqual(rotateUrls(parseRpcUrls({ RPC_URLS: PUB }), 1));
  });

  test("withRpcFallback reaches the backup when every public URL fails", async () => {
    const urls = parseRpcUrls({ RPC_URLS: PUB, RPC_URL_BACKUP: BACKUP });
    const { result, url } = await withRpcFallback(
      urls,
      async (u) => {
        if (u !== BACKUP) throw new Error("rpc http 503");
        return "ok";
      },
      { retries: 0, sleep: async () => {} },
    );
    expect(result).toBe("ok");
    expect(url).toBe(BACKUP);
  });

  test("a final error never carries an RPC URL (health output is public)", async () => {
    const urls = parseRpcUrls({ RPC_URLS: PUB, RPC_URL_BACKUP: BACKUP });
    const err = await withRpcFallback(
      urls,
      async (u) => {
        throw new Error(`request to ${u} failed, reason: boom`);
      },
      { retries: 0, sleep: async () => {} },
    ).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).not.toContain("SECRETKEY123");
    expect(String((err as Error).message)).not.toContain("quiknode");
    expect(String((err as Error).message)).toContain("[rpc]");
  });
});
