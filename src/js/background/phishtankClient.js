import { log, warn, error, debug } from '../shared/logger.js';

const PHISHTANK_API_KEY = 'YOUR_PHISHTANK_APP_KEY'; // Replace with actual key or method to get it
const PHISHTANK_BULK_FEED_URL = 'http://data.phishtank.com/data/online-valid.csv'; // Verify this URL

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000; // 1 second

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
            // Retry for server errors (5xx) or common rate limit (429)
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
            warn(`(FetchBackoff) Request to ${url} failed with status ${response.status}. Retrying in ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithBackoff(url, options, retryCount + 1);
        } else if (response.status === 429 && retryCount < MAX_RETRIES) { // Explicitly handle 429 Too Many Requests
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount) * 2; // Longer delay for rate limits
            warn(`(FetchBackoff) Request to ${url} failed with status 429 (Rate Limit). Retrying in ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithBackoff(url, options, retryCount + 1);
        }
        return response;
    } catch (e) {
        // Network errors or other fetch issues
        if (retryCount < MAX_RETRIES) {
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
            warn(`(FetchBackoff) Request to ${url} failed with error: ${e.message}. Retrying in ${delay}ms... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithBackoff(url, options, retryCount + 1);
        }
        error(`(FetchBackoff) Request to ${url} failed after ${MAX_RETRIES} retries:`, e);
        throw e; // Re-throw after max retries
    }
}

/**
 * Checks a URL against the PhishTank database.
 * @param {string} url - The URL to check.
 * @returns {Promise<object>} - Object containing { isPhishing: boolean, details: object | null, error: string | null }
 */
export async function checkPhishTank(urlToCheck) {
    log(`(PhishTank) Checking URL: ${urlToCheck}`);

    // Retrieve API key from storage or use constant (as per current setup)
    // For this example, we'll stick to the constant defined at the top.
    // const { phishTankApiKey } = await chrome.storage.local.get('phishTankApiKey');
    // const currentApiKey = phishTankApiKey || PHISHTANK_API_KEY;

    if (PHISHTANK_API_KEY && PHISHTANK_API_KEY !== 'YOUR_PHISHTANK_APP_KEY') {
        const apiUrl = `https://checkurl.phishtank.com/checkurl/index.php?url=${encodeURIComponent(urlToCheck)}&format=json&app_key=${PHISHTANK_API_KEY}`;
        try {
            // Note: PhishTank's free API might be very slow or have strict limits.
            // The fetchWithBackoff might not be as effective if the issue is a hard block rather than transient errors.
            // For a production scenario with PhishTank, their paid data feeds or a more robust API access method is usually needed.
            warn("(PhishTank) Attempting REST API call (Note: Free tier may be unreliable).");
            // const response = await fetchWithBackoff(apiUrl, {}); // Basic GET request
            // if (!response.ok) {
            //   throw new Error(`API request failed with status ${response.status}`);
            // }
            // const data = await response.json();
            // if (data.meta && data.meta.status === 'success') {
            //      const results = data.results;
            //      return { isPhishing: results.in_database && results.verified && results.valid, details: results, error: null };
            // } else {
            //      warn(`(PhishTank) API call successful but data indicates an issue: ${data.meta?.error_message || 'Unknown error from API'}`);
            //      return { isPhishing: false, details: data.results || null, error: data.meta?.error_message || 'PhishTank API reported an issue but not a network error' };   
            // }
            warn("(PhishTank) REST API call logic is still commented out. Needs implementation and PhishTank API key.");
            return { isPhishing: false, details: null, error: "REST API not fully implemented or key missing." };
        } catch (e) {
            error('(PhishTank) API Call Error:', e);
            return { isPhishing: false, details: null, error: e.message };
        }
    } else {
        warn("(PhishTank) Bulk feed check not suitable. API key for REST API is missing or placeholder.");
        return { isPhishing: false, details: null, error: "Bulk feed check not implemented / API key missing or placeholder" };
    }
}

// Placeholder for fetching and processing the bulk feed if that strategy is chosen
// async function updatePhishTankBulkFeed() {
//   try {
//     const response = await fetch(PHISHTANK_BULK_FEED_URL);
//     if (!response.ok) throw new Error('Failed to download PhishTank bulk feed.');
//     const csvData = await response.text();
//     // Parse CSV data and store it (e.g., in IndexedDB)
//     // This is a simplified example; CSV parsing can be complex.
//     const lines = csvData.split('\\n');
//     const phishingUrls = lines.slice(1) // Skip header
//                               .map(line => line.split(',')[1]) // Assuming URL is the second column
//                               .filter(url => url);
//     log('(PhishTank) Bulk feed updated with', phishingUrls.length, 'entries.');
//     // Store phishingUrls in chrome.storage.local or IndexedDB
//     // await chrome.storage.local.set({ phishTankData: phishingUrls });
//   } catch (e) {
//     error('(PhishTank) Error updating bulk feed:', e);
//   }
// }

// // Example: Call updatePhishTankBulkFeed periodically using chrome.alarms
// // chrome.alarms.create('updatePhishTankFeed', { periodInMinutes: 24 * 60 }); // Update daily
// // chrome.alarms.onAlarm.addListener(alarm => {
// //   if (alarm.name === 'updatePhishTankFeed') {
// //     updatePhishTankBulkFeed();
// //   }
// // });

// // Initial call if needed
// // updatePhishTankBulkFeed(); 