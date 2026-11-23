import type { KeyIdStorage } from './types'

/** Build the storage key for a certificate's cached E-IMZO key id. */
export function keyIdCacheKey(idPart: string): string {
  return `keyId-${idPart}`
}

/**
 * Cookie-backed storage (default). Session cookies (no explicit expiry), `SameSite=Lax`,
 * `path=/`, and `Secure` over HTTPS. Safe no-op when `document` is unavailable (SSR).
 */
export function cookieKeyIdStorage(): KeyIdStorage {
  const available = typeof document !== 'undefined'
  const attributes = available && document.location.protocol === 'https:'
    ? '; path=/; SameSite=Lax; Secure'
    : '; path=/; SameSite=Lax'
  return {
    get(key) {
      if (!available) return null
      const prefix = encodeURIComponent(key) + '='
      const found = document.cookie
        .split('; ')
        .find((row) => row.startsWith(prefix))
      if (!found) return null
      try {
        return decodeURIComponent(found.slice(prefix.length))
      } catch {
        return null
      }
    },
    set(key, value) {
      if (!available) return
      document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}${attributes}`
    },
    remove(key) {
      if (!available) return
      document.cookie = `${encodeURIComponent(key)}=${attributes}; Max-Age=0`
    },
  }
}

/** `localStorage`-backed storage. Safe no-op when `localStorage` is unavailable. */
export function localStorageKeyIdStorage(): KeyIdStorage {
  const store = (): Storage | null => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null
    } catch {
      return null
    }
  }
  return {
    get: (key) => store()?.getItem(key) ?? null,
    set: (key, value) => store()?.setItem(key, value),
    remove: (key) => store()?.removeItem(key),
  }
}

/** In-memory storage. SSR/CI-safe; cleared on reload. */
export function memoryKeyIdStorage(): KeyIdStorage {
  const map = new Map<string, string>()
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  }
}
