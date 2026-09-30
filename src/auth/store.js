import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');

// Only digests of bearer credentials are indexed. Payloads (including the
// upstream API key and registered client secrets) are encrypted at rest.
export class MongoOAuthStore {
  constructor(uri, encryptionKey) {
    if (!/^[a-f0-9]{64}$/i.test(encryptionKey || '')) {
      throw new Error('POSTMCPAI_OAUTH_ENCRYPTION_KEY must be 32 random bytes encoded as 64 hex characters');
    }
    this.key = Buffer.from(encryptionKey, 'hex');
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  }
  async collection() {
    if (!this.ready) this.ready = (async () => {
      await this.client.connect();
      const collection = this.client.db().collection('postmcp_oauth');
      await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      return collection;
    })();
    return this.ready;
  }
  seal(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  open(record) {
    if (!record || (record.expiresAt && record.expiresAt.getTime() <= Date.now())) return null;
    const bytes = Buffer.from(record.payload, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return { ...JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()])), used: record.used };
  }
  async put(kind, id, value, expiresAt) {
    const collection = await this.collection();
    await collection.insertOne({ _id: `${kind}:${digest(id)}`, payload: this.seal(value), used: false,
      ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}) });
  }
  async get(kind, id) {
    return this.open(await (await this.collection()).findOne({ _id: `${kind}:${digest(id)}` }));
  }
  async consume(kind, id) {
    // Atomic across instances: only one request may redeem a code or refresh.
    return this.open(await (await this.collection()).findOneAndUpdate(
      { _id: `${kind}:${digest(id)}`, used: false }, { $set: { used: true } }, { returnDocument: 'before' }));
  }
  async delete(kind, id) {
    await (await this.collection()).deleteOne({ _id: `${kind}:${digest(id)}` });
  }
  async close() { await this.client.close(); }
}
