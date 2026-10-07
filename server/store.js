'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Persistent store for the plasmid annotation set.
 *
 * The complete set is replaced atomically on every save: the new file is
 * written to a temporary path, fsynced, then renamed over the old one, so
 * a crash can never leave a half-written file and a failed save never
 * changes the existing data. Writes are serialized through a promise
 * chain so concurrent PUTs cannot interleave.
 */
class AnnotationStore {
  /**
   * @param {string} filePath JSON file backing the store.
   * @param {Array<{name:string,start:number,length:number}>} seed
   *        deterministic annotations used when the file does not exist.
   */
  constructor(filePath, seed) {
    this.filePath = filePath;
    this.seed = seed.map((a) => ({ ...a }));
    this.annotations = null;
    this.writeQueue = Promise.resolve();
  }

  /** Load from disk, seeding the file on first boot. */
  async init() {
    let raw = null;
    try {
      raw = await fs.promises.readFile(this.filePath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (raw === null) {
      this.annotations = this.seed.map((a) => ({ ...a }));
      await this.#writeFile(this.annotations);
    } else {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.annotations)) {
        throw new Error(`Corrupt annotation file: ${this.filePath}`);
      }
      this.annotations = parsed.annotations.map((a) => ({
        name: a.name,
        start: a.start,
        length: a.length,
      }));
    }
    return this.getAll();
  }

  /** Current set (deep copy; callers may not mutate the store). */
  getAll() {
    return this.annotations.map((a) => ({ ...a }));
  }

  /**
   * Atomically replace the complete set. The array must already have been
   * validated; the in-memory copy is only updated after the file is
   * durably renamed into place.
   */
  async replaceAll(annotations) {
    const next = annotations.map((a) => ({ ...a }));
    const run = this.writeQueue.then(async () => {
      await this.#writeFile(next);
      this.annotations = next;
    });
    // Keep the queue alive even if this write fails.
    this.writeQueue = run.catch(() => {});
    await run;
    return this.getAll();
  }

  async #writeFile(annotations) {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}`;
    const payload = JSON.stringify(
      { version: 1, annotations },
      null,
      2
    );
    const handle = await fs.promises.open(tmp, 'w');
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(tmp, this.filePath);
  }
}

module.exports = { AnnotationStore };
