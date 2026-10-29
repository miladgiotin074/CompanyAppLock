const mem = new Map();

/** In-memory screen cache so a visited page can paint before the network answers. */
export const cache = {
  get(key) {
    return mem.get(key);
  },
  set(key, value) {
    mem.set(key, value);
    return value;
  },
};
