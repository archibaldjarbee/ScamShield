import { log, warn, error, debug } from '../shared/logger.js';

const GOOGLE_SAFE_BROWSING_API_KEY = 'AIzaSyBfkgTpocOKlPejzmrFpXkxtlXv2pLy1nE'; // Key provided by user
const GOOGLE_SAFE_BROWSING_API_URL_BASE = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Fetches a URL with exponential backoff.
 * @param {string} url - The URL to fetch.
 * @param {object} options - Fetch options.
 * @param {number} retryCount - Current retry attempt.
 * @returns {Promise<Response>} The fetch response.
 */
async function fetchWithBackoff(url, options, retryCount = 0) {
    try {
        const response = await fetch(url, options);
        if (!response.ok && response.status >= 500 && retryCount < MAX_RETRIES) {
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
            warn(`(FetchBackoff-GSB) Request to ${url} failed with status ${response.status}. Retrying in ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithBackoff(url, options, retryCount + 1);
        } else if (response.status === 429 && retryCount < MAX_RETRIES) {
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount) * 2;
            warn(`(FetchBackoff-GSB) Request to ${url} failed with status 429 (Rate Limit). Retrying in ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithBackoff(url, options, retryCount + 1);
        }
        return response;
    } catch (e) {
        if (retryCount < MAX_RETRIES) {
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
            warn(`(FetchBackoff-GSB) Request to ${url} failed with error: ${e.message}. Retrying in ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithBackoff(url, options, retryCount + 1);
        }
        error(`(FetchBackoff-GSB) Request to ${url} failed after ${MAX_RETRIES} retries:`, e);
        throw e;
    }
}

/**
 * Checks a URL against the Google Safe Browsing API.
 * @param {string} urlToCheck - The URL to check.
 * @returns {Promise<object>} - Object containing { isMalicious: boolean, threats: Array<string>, details: object | null, error: string | null }
 */
export async function checkGoogleSafeBrowsing(urlToCheck) {
    log(`(SafeBrowsing) Checking URL: ${urlToCheck}`);

    // API Key check - use the hardcoded one as per user's last update
    if (!GOOGLE_SAFE_BROWSING_API_KEY || GOOGLE_SAFE_BROWSING_API_KEY === 'YOUR_GOOGLE_SAFE_BROWSING_API_KEY' || GOOGLE_SAFE_BROWSING_API_KEY === 'AIzaSyBfkgTpocOKlPejzmrFpXkxtlXv2pLy1nE' && GOOGLE_SAFE_BROWSING_API_KEY.includes('YOUR')) { // check if it is still a placeholder or an actual key
        warn("(SafeBrowsing) API key looks like a placeholder or is missing. Skipping check.");
        return { isMalicious: false, threats: [], details: null, error: "API key not configured or is a placeholder" };
    }
    // Construct the actual API URL with the key
    const apiUrlWithKey = `${GOOGLE_SAFE_BROWSING_API_URL_BASE}?key=${GOOGLE_SAFE_BROWSING_API_KEY}`;

    const payload = {
        client: {
            clientId: "scamshieldextension",
            clientVersion: "1.0.0"
        },
        threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [
                { url: urlToCheck }
            ]
        }
    };

    try {
        const response = await fetchWithBackoff(apiUrlWithKey, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errorBody = 'Unknown error';
            try { errorBody = await response.text(); } catch(e){ /* ignore */ }
            error(`(SafeBrowsing) API request failed with status ${response.status}: ${errorBody}`);
            // Do not throw here if fetchWithBackoff already handled retries and this is the final state
            return { isMalicious: false, threats: [], details: null, error: `API request failed with status ${response.status}: ${errorBody.substring(0,100)}` };
        }

        const data = await response.json();
        log("(SafeBrowsing) API Response:", data);

        if (data.matches && data.matches.length > 0) {
            const threats = data.matches.map(match => match.threatType);
            return { isMalicious: true, threats: threats, details: data.matches, error: null };
        } else {
            return { isMalicious: false, threats: [], details: null, error: null };
        }

    } catch (e) {
        error("(SafeBrowsing) API Error after retries (if any):", e);
        return { isMalicious: false, threats: [], details: null, error: e.message };
    }
} 