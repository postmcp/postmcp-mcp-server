export class MemoryOAuthStore {
  records = new Map();
  async put(kind, id, value, expiresAt) {
    const key = `${kind}:${id}`;
    if (this.records.has(key)) throw new Error('Duplicate');
    this.records.set(key, { value: structuredClone({ ...value, used: false }), expiresAt });
  }
  async get(kind, id) {
    const record = this.records.get(`${kind}:${id}`);
    return record && (!record.expiresAt || record.expiresAt > Date.now()) ? structuredClone(record.value) : null;
  }
  async consume(kind, id) {
    const record = await this.get(kind, id);
    // No await between read/modify: mirror Mongo's atomic predicate.
    const stored = this.records.get(`${kind}:${id}`);
    if (!record || stored.value.used) return null;
    stored.value.used = true;
    return record;
  }
  async delete(kind, id) { this.records.delete(`${kind}:${id}`); }
}
