import { log, warn, error, debug } from '../shared/logger.js';

const VIRUSTOTAL_API_KEY = '19329d70550bfee1690e161333ef4d0ae6d2fb1d4d7180a1847afcf67ceb5c01'; // Replace with actual key
const VIRUSTOTAL_API_URL_BASE = 'https://www.virustotal.com/api/v3/urls'; // URL for submitting, GET for report

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
            warn(`(FetchBackoff-VT) Request to ${url} failed with status ${response.status}. Retrying in ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithBackoff(url, options, retryCount + 1);
        } else if (response.status === 429 && retryCount < MAX_RETRIES) {
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount) * 2;
            warn(`(FetchBackoff-VT) Request to ${url} failed with status 429 (Rate Limit). Retrying in ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithBackoff(url, options, retryCount + 1);
        } else if (response.status === 401 && options.headers && options.headers['x-apikey']) { // Unauthorized - API key issue
            error(`(FetchBackoff-VT) Request to ${url} failed with status 401 (Unauthorized). Check API Key. No retry.`);
            // No retry for 401 as it indicates an API key problem, not a transient one.
        }
        return response;
    } catch (e) {
        if (retryCount < MAX_RETRIES) {
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
            warn(`(FetchBackoff-VT) Request to ${url} failed with error: ${e.message}. Retrying in ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithBackoff(url, options, retryCount + 1);
        }
        error(`(FetchBackoff-VT) Request to ${url} failed after ${MAX_RETRIES} retries:`, e);
        throw e;
    }
}

/**
 * Analyzes a URL with VirusTotal API v3.
 * This typically involves two steps:
 * 1. Submit the URL for analysis (POST to /urls).
 * 2. Get the analysis report (GET to /analyses/{id}).
 *    However, for quicker checks, we can often directly GET /urls/{id} where id is base64(url).
 *
 * @param {string} urlToCheck - The URL to check.
 * @returns {Promise<object>} - Object containing { isMalicious: boolean, score: number | null, positives: number | null, total: number | null, details: object | null, error: string | null }
 */
export async function checkVirusTotal(urlToCheck) {
    log(`(VirusTotal) Checking URL: ${urlToCheck}`);

    if (!VIRUSTOTAL_API_KEY || VIRUSTOTAL_API_KEY === '19329d70550bfee1690e161333ef4d0ae6d2fb1d4d7180a1847afcf67ceb5c01') {
        warn("(VirusTotal) API key not configured. Skipping check.");
        return { isMalicious: false, score: null, positives: null, total: null, details: null, error: "API key not configured" };
    }

    // VirusTotal API v3 uses the URL itself (SHA256 hash of it, or simply the URL ID which is base64 encoded URL) for retrieval.
    // Let's try retrieving the report directly first.
    // The ID for a URL is the URL itself, after a specific normalization process, then base64 encoded without padding.
    // For simplicity and common use, let's assume the API handles direct URL strings for GET requests or use a library if available.
    // The VT client libraries often handle the ID generation.
    // A common way is to get the analysis of a URL by its base64 representation (without padding).
    const urlId = btoa(urlToCheck).replace(/=/g, ''); // Base64 encode and remove padding

    try {
        const response = await fetchWithBackoff(`${VIRUSTOTAL_API_URL_BASE}/${urlId}`, {
            method: 'GET',
            headers: {
                'x-apikey': VIRUSTOTAL_API_KEY
            }
        });

        if (response.status === 404) {
            // URL not found, means it hasn't been analyzed recently or at all.
            // We might want to submit it for analysis, but that's an async process and won't give immediate results.
            // For a real-time check, if it's not found, we consider it clean from VT's perspective for now or unknown.
            log("(VirusTotal) URL not found in database (404). It may not have been analyzed.");
            // To submit for analysis (would require handling the analysis polling):
            // const submissionResponse = await fetch(VIRUSTOTAL_API_URL_BASE, {
            //    method: 'POST',
            //    headers: { 'x-apikey': VIRUSTOTAL_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
            //    body: `url=${encodeURIComponent(urlToCheck)}`
            // });
            // const submissionData = await submissionResponse.json();
            // const analysisId = submissionData.data.id; // Then poll GET /analyses/{analysisId}
            return { isMalicious: false, score: 0, positives: 0, total: 0, details: { message: "URL not found or not yet analyzed." }, error: null };
        }

        if (response.status === 401) { // Explicitly handle 401 from final response (after fetchWithBackoff determined not to retry)
            error(`(VirusTotal) API request failed with status 401 (Unauthorized). Check API Key.`);
            return { isMalicious: false, score: null, positives: null, total: null, details: null, error: "API request failed: Unauthorized (Check API Key)" };
        }

        if (!response.ok) {
            let errorBody = 'Unknown error';
            try { errorBody = await response.text(); } catch(e){ /* ignore */ }
            error(`(VirusTotal) API request failed with status ${response.status}: ${errorBody}`);
            return { isMalicious: false, score: null, positives: null, total: null, details: null, error: `API request failed with status ${response.status}: ${errorBody.substring(0,100)}` };
        }

        const data = await response.json();
        log("(VirusTotal) API Response:", data);

        if (data.data && data.data.attributes) {
            const attributes = data.data.attributes;
            const stats = attributes.last_analysis_stats;
            // Example: consider malicious if more than a few engines flag it
            const positives = stats.malicious + stats.suspicious;
            const total = stats.harmless + stats.malicious + stats.suspicious + stats.timeout + stats.undetected;
            const score = total > 0 ? positives / total : 0;

            return {
                isMalicious: positives > 1, // Arbitrary threshold: 2 or more engines detect it as malicious/suspicious
                score: score, // Normalized score (0-1)
                positives: positives,
                total: total,
                details: attributes,
                error: null
            };
        } else {
            // Check for specific error structure from VirusTotal if available
            if (data.error && data.error.message) {
                error(`(VirusTotal) API returned an error: ${data.error.message} (Code: ${data.error.code})`);
                return { isMalicious: false, score: null, positives: null, total: null, details: data.error, error: `VirusTotal API Error: ${data.error.message}` };
            }
            return { isMalicious: false, score: 0, positives: 0, total: 0, details: data, error: "Unexpected API response structure" };
        }

    } catch (e) {
        error("(VirusTotal) API Error after retries (if any):", e);
        return { isMalicious: false, score: null, positives: null, total: null, details: null, error: e.message };
    }
} 