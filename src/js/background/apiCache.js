import { log, warn, error, debug } from '../shared/logger.js';

const CACHE_PREFIX = 'api_cache_';

/**
 * Gets a cached API response for a given URL and API source.
 * @param {string} apiUrlKey - A unique key identifying the API source (e.g., 'phishtank', 'safebrowsing', 'virustotal').
 * @param {string} itemKey - The specific item being looked up (e.g., the URL).
 * @returns {Promise<object | null>} The cached data if found and not expired, otherwise null.
 */
export async function getCachedResponse(apiUrlKey, itemKey) {
    const cacheKey = `${CACHE_PREFIX}${apiUrlKey}_${itemKey}`;
    try {
        const result = await chrome.storage.local.get(cacheKey);
        if (result[cacheKey]) {
            const cachedItem = result[cacheKey];
            if (cachedItem.expiresAt > Date.now()) {
                log(`(Cache) Hit for ${apiUrlKey} - ${itemKey}`);
                return cachedItem.data;
            } else {
                log(`(Cache) Expired data for ${apiUrlKey} - ${itemKey}`);
                // Optionally remove expired item
                await chrome.storage.local.remove(cacheKey);
                return null;
            }
        }
        log(`(Cache) Miss for ${apiUrlKey} - ${itemKey}`);
        return null;
    } catch (e) {
        error("(Cache) Error getting cached response:", e);
        return null;
    }
}

/**
 * Sets an API response in the cache.
 * @param {string} apiUrlKey - A unique key identifying the API source.
 * @param {string} itemKey - The specific item being looked up (e.g., the URL).
 * @param {object} data - The data to cache.
 * @param {number} ttlMilliseconds - Time-to-live for this cache entry in milliseconds.
 * @returns {Promise<void>}
 */
export async function setCachedResponse(apiUrlKey, itemKey, data, ttlMilliseconds) {
    const cacheKey = `${CACHE_PREFIX}${apiUrlKey}_${itemKey}`;
    const expiresAt = Date.now() + ttlMilliseconds;
    try {
        await chrome.storage.local.set({ [cacheKey]: { data, expiresAt } });
        log(`(Cache) Stored response for ${apiUrlKey} - ${itemKey}, expires in ${ttlMilliseconds / 1000}s`);
    } catch (e) {
        error("(Cache) Error setting cached response:", e);
    }
}

/**
 * Clears all API cache entries or specific ones if a key is provided.
 * @param {string} [apiUrlKey] - Optional: if provided, only clears cache for this API source.
 * @returns {Promise<void>}
 */
export async function clearCache(apiUrlKey) {
    try {
        const allItems = await chrome.storage.local.get(null);
        const keysToRemove = [];
        for (const key in allItems) {
            if (key.startsWith(CACHE_PREFIX)) {
                if (apiUrlKey && key.startsWith(`${CACHE_PREFIX}${apiUrlKey}_`)) {
                    keysToRemove.push(key);
                } else if (!apiUrlKey) {
                    keysToRemove.push(key);
                }
            }
        }
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
            log(`(Cache) Cleared ${keysToRemove.length} items. ${apiUrlKey ? `(for ${apiUrlKey})` : '(all API cache)'}`);
        } else {
            log("(Cache) No items to clear.");
        }
    } catch (e) {
        error("(Cache) Error clearing cache:", e);
    }
}

// Example TTLs (can be configured elsewhere or passed in)
export const TTL_PHISHTANK = 1 * 60 * 60 * 1000; // 1 hour
export const TTL_SAFE_BROWSING = 12 * 60 * 60 * 1000; // 12 hours
export const TTL_VIRUSTOTAL = 24 * 60 * 60 * 1000; // 24 hours 