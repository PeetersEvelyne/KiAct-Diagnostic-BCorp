// Couche de compatibilité : window.storage (artefact Claude) vers localStorage (GitHub Pages)
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    get: async (key) => { try { const v = localStorage.getItem(key); return v === null ? null : { key, value: v, shared: false }; } catch (e) { console.warn("storage.get failed for", key, e); return null; } },
    set: async (key, value) => { try { localStorage.setItem(key, value); return { key, value, shared: false }; } catch (e) { console.warn("storage.set failed for", key, e); return null; } },
    delete: async (key) => { try { localStorage.removeItem(key); return { key, deleted: true, shared: false }; } catch (e) { console.warn("storage.delete failed for", key, e); return null; } },
    list: async (prefix) => { try { const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!prefix || (k && k.startsWith(prefix))) keys.push(k); } return { keys, prefix, shared: false }; } catch (e) { console.warn("storage.list failed for", prefix, e); return null; } },
  };
}
