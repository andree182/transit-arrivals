// Pure cache core: one instance per feed URL. No Cloudflare types so it unit-tests
// with an injected fetch + millisecond clock. Holds the last good feed bytes,
// refreshes when the TTL lapses, coalesces concurrent refreshes onto one promise,
// and serves last-good bytes (flagged stale) when an upstream refresh fails.
export class FeedCacheCore {
  constructor(fetchImpl, nowMs) {
    this._fetch = fetchImpl;
    this._now = nowMs;
    this._bytes = null;
    this._fetchedAt = 0;
    this._inflight = null;
  }
  async get(url, key, ttlSecs) {
    if (this._bytes && (this._now() - this._fetchedAt) < ttlSecs * 1000) {
      return { bytes: this._bytes, stale: false };
    }
    if (this._inflight) return this._inflight;
    this._inflight = this._refresh(url, key);
    try { return await this._inflight; }
    finally { this._inflight = null; }
  }
  async _refresh(url, key) {
    try {
      const r = await this._fetch(url, { headers: { Authorization: key }, cf: { cacheTtl: 0 } });
      if (!r.ok) throw new Error('upstream ' + r.status);
      const buf = new Uint8Array(await r.arrayBuffer());
      this._bytes = buf;
      this._fetchedAt = this._now();
      return { bytes: buf, stale: false };
    } catch (e) {
      if (this._bytes) return { bytes: this._bytes, stale: true };
      throw e;
    }
  }
}
