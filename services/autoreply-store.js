class MemoryStore {
  constructor() {
    this.data = new Map();
  }

  async put(key, value) {
    this.data.set(key, value);
  }

  async get(key) {
    return this.data.get(key) ?? null;
  }

  async list({ prefix = '' } = {}) {
    const keys = [];
    for (const name of this.data.keys()) {
      if (name.startsWith(prefix)) keys.push({ name });
    }
    return { keys };
  }
}

function createAutoreplyStore() {
  return new MemoryStore();
}

module.exports = { createAutoreplyStore };
