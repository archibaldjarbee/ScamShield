import { log, warn, error, debug } from '../shared/logger.js';
import * as apiCache from './apiCache.js';
import * as phishTankClient from './phishtankClient.js';
import * as safeBrowsingClient from './safeBrowsingClient.js';
import * as virusTotalClient from './virusTotalClient.js';
import * as aiEngine from './aiEngine.js';

const EXTENSION_STATUS_KEY = 'scamShieldActiveStatus';
let isExtensionCurrentlyActive = true; // Local cache in background

// API Weights for unified score
const API_WEIGHTS = {
    PHISHTANK: 0.30,
    SAFE_BROWSING: 0.30,
    VIRUSTOTAL: 0.30,
    AI_ENGINE: 0.40,
    NLP_CONTENT: 0.25
};

// Severity Tiers
const SEVERITY_THRESHOLDS = {
    LOW: 0.3,       // Score > 0.3
    MEDIUM: 0.6,    // Score > 0.6
    HIGH: 0.8       // Score > 0.8
};

/**
 * Initializes the background script's understanding of the extension's active status.
 * Reads from chrome.storage.local, defaults to true (active) if not set,
 * and updates the local isExtensionCurrentlyActive variable.
 * @async
 */
async function initializeBackgroundStatus() {
    try {
        const data = await chrome.storage.local.get(EXTENSION_STATUS_KEY);
        if (data[EXTENSION_STATUS_KEY] === undefined) {
            isExtensionCurrentlyActive = true; // Default to active
            await chrome.storage.local.set({ [EXTENSION_STATUS_KEY]: isExtensionCurrentlyActive });
            log("(Background): Status initialized to active.");
        } else {
            isExtensionCurrentlyActive = data[EXTENSION_STATUS_KEY];
            log("(Background): Loaded status:", isExtensionCurrentlyActive);
        }
    } catch (e) { // Changed error variable name to avoid conflict with logger's error function
        error("(Background): Error loading status:", e);
        isExtensionCurrentlyActive = true; // Default to active on error
    }
}

// Call initialization on startup
initializeBackgroundStatus();

/**
 * Listener for extension installation or update.
 * Initializes default blacklist, keywords, and extension status in chrome.storage.
 * @param {chrome.runtime.InstalledDetails} details - Details about the installation or update.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  log("Extension installed/updated. Reason:", details.reason);

  // Ensure status is initialized on first install or update if not present
  await initializeBackgroundStatus(); 

  // Initialize blacklist from blacklist.json
  try {
    const response = await fetch(chrome.runtime.getURL('data/blacklist.json')); 
    if (response.ok) {
      const blacklist = await response.json();
      chrome.storage.local.set({ scamShieldBlacklist: blacklist }, () => {
        log("Initial blacklist loaded/reloaded from JSON and stored.", blacklist);
      });
    } else {
      error("Could not fetch blacklist.json for initial setup.", response.status);
      const currentData = await chrome.storage.local.get('scamShieldBlacklist');
      if (!currentData.scamShieldBlacklist) {
        chrome.storage.local.set({ scamShieldBlacklist: [] }, () => {
            log("Initialized with an empty blacklist due to fetch error.");
        });
      }
    }
  } catch (e) { // Changed error variable name
    error("Error fetching or parsing blacklist.json for initial setup:", e);
    const currentData = await chrome.storage.local.get('scamShieldBlacklist');
      if (!currentData.scamShieldBlacklist) {
        chrome.storage.local.set({ scamShieldBlacklist: [] }, () => {
            log("Initialized with an empty blacklist due to error.");
        });
      }
  }

  // Initialize scam keywords
  const initialScamKeywords = [
    "pin",
    "bank-transfer",
    "lottery",
    "prize",
    "urgent",
    "account-verify",
    "confirm-details",
    "suspicious-login",
    "verify-identity",
    "unusual-activity",
    "secure-your-account"
  ];
  chrome.storage.local.set({ scamShieldKeywords: initialScamKeywords }, () => {
    log("Initial scam keywords stored/updated.", initialScamKeywords);
  });

  // Initialize debug mode setting
  try {
    const data = await chrome.storage.local.get('scamShieldDebugMode');
    if (data.scamShieldDebugMode === undefined) {
      await chrome.storage.local.set({ scamShieldDebugMode: false });
      log("(Background): Debug mode initialized to false in storage.");
    }
  } catch (e) {
    error("(Background): Error initializing debug mode in storage:", e);
  }

  // Initialize custom keywords storage
  try {
    const data = await chrome.storage.local.get('scamShieldCustomKeywords');
    if (data.scamShieldCustomKeywords === undefined) {
      await chrome.storage.local.set({ scamShieldCustomKeywords: [] });
      log("(Background): Custom keywords initialized to an empty array in storage.");
    }
  } catch (e) {
    error("(Background): Error initializing custom keywords in storage:", e);
  }
}); 

/**
 * Listener for messages from other parts of the extension (e.g., popup).
 * Handles EXTENSION_STATUS_TOGGLED, REQUEST_URL_CHECK, and PAGE_CONTENT_FOR_ANALYSIS messages.
 * @param {object} message - The message object sent.
 * @param {chrome.runtime.MessageSender} sender - Information about the script that sent the message.
 * @param {function} sendResponse - Function to call to send a response back to the message sender.
 * @returns {boolean} - True to indicate that sendResponse will be called asynchronously.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTENSION_STATUS_TOGGLED') {
        isExtensionCurrentlyActive = message.active;
        log("(Background): Received status update. Now:", isExtensionCurrentlyActive);
        sendResponse({ success: true, message: "Status received by background" });
    } else if (message.type === 'REQUEST_URL_CHECK') {
        log(`(Background): Received REQUEST_URL_CHECK for ${message.url} from tab ${message.tabId || sender.tab?.id}`);
        const tabIdForCheck = message.tabId || sender.tab?.id;
        if (message.url && tabIdForCheck) {
            checkUrlThreats(message.url, tabIdForCheck, null)
                .then(result => sendResponse({ success: true, result }))
                .catch(err => {
                    error(`(Background): Error processing REQUEST_URL_CHECK:`, err);
                    sendResponse({ success: false, error: err.message });
                });
            return true; // Indicates asynchronous response
        } else {
            warn(`(Background): REQUEST_URL_CHECK missing URL or a valid tabId. URL: ${message.url}, message.tabId: ${message.tabId}, sender.tab?.id: ${sender.tab?.id}.`);
            sendResponse({ success: false, error: "URL or tab ID missing/invalid in REQUEST_URL_CHECK" });
        }
    } else if (message.type === 'PAGE_CONTENT_FOR_ANALYSIS') {
        log(`(Background): Received PAGE_CONTENT_FOR_ANALYSIS for ${message.url} from tab ${sender.tab?.id}. Text length: ${message.textContent?.length}`);
        if (message.url && sender.tab?.id && message.textContent) {
            checkUrlThreats(message.url, sender.tab.id, message.textContent)
                .then(result => {
                    sendResponse({ success: true, updatedThreatDetails: result });
                })
                .catch(err => {
                    error(`(Background): Error processing PAGE_CONTENT_FOR_ANALYSIS:`, err);
                    sendResponse({ success: false, error: err.message });
                });
            return true; // Indicates asynchronous response
        } else {
            sendResponse({ success: false, error: "URL, tab ID, or textContent missing in PAGE_CONTENT_FOR_ANALYSIS" });
        }
    }
    // Return true if sendResponse will be called asynchronously.
    return true; 
});

/**
 * Normalizes an API result to a 0-1 score.
 * @param {string} source - The API source (e.g., 'PHISHTANK', 'AI_ENGINE', 'NLP_CONTENT').
 * @param {object} result - The result object from the API client.
 * @returns {number} A score between 0 and 1.
 */
function normalizeScore(source, result) {
    if (!result || result.error) return 0; // No score if error or no result

    switch (source) {
        case 'PHISHTANK':
            // PhishTank: isPhishing (boolean)
            return result.isPhishing ? 1 : 0;
        case 'SAFE_BROWSING':
            // Google Safe Browsing: isMalicious (boolean based on threats)
            return result.isMalicious ? 1 : 0; // Could be refined based on threat types
        case 'VIRUSTOTAL':
            // VirusTotal: score (already 0-1 from positives/total)
            return result.score || 0;
        case 'AI_ENGINE': // For URL Heuristics
            return result.score || 0;
        case 'NLP_CONTENT': // For NLP Content Analysis
            return result.score || 0;
        default:
            return 0;
    }
}

/**
 * Determines the severity level based on the unified score.
 * @param {number} score - The unified threat score (0-1).
 * @returns {string} Severity level ('NONE', 'LOW', 'MEDIUM', 'HIGH').
 */
function getSeverity(score) {
    if (score >= SEVERITY_THRESHOLDS.HIGH) return 'HIGH';
    if (score >= SEVERITY_THRESHOLDS.MEDIUM) return 'MEDIUM';
    if (score >= SEVERITY_THRESHOLDS.LOW) return 'LOW';
    return 'NONE'; // Or 'SAFE'
}

/**
 * Main function to check a URL against all configured threat intelligence APIs.
 * @param {string} url - The URL to check.
 * @param {number} tabId - The ID of the tab where the URL is being checked.
 * @param {string|null} textContent - Optional: Page text content for NLP analysis. If null, NLP won't run yet.
 */
async function checkUrlThreats(url, tabId, textContent) {
    if (!isExtensionCurrentlyActive) {
        log(`(Background) Extension is inactive. Skipping threat check for ${url}`);
        return;
    }
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        log(`(Background) Invalid or non-HTTP(S) URL. Skipping threat check for ${url}`);
        return;
    }

    log(`(Background) Initiating threat check for URL: ${url} in tab ${tabId}`);

    let unifiedScore = 0;
    const sourceResults = {};
    let anySourceReportedThreat = false;

    // 1. Local AI Engine URL Analysis
    try {
        const aiAnalysisResult = aiEngine.analyzeUrlLocally(url);
        sourceResults.aiEngine = aiAnalysisResult;
        const aiScore = aiAnalysisResult.score || 0;
        if (aiScore > 0) anySourceReportedThreat = true;
        unifiedScore += aiScore * API_WEIGHTS.AI_ENGINE;
        log(`(Background) AI Engine URL check for ${url}: Score=${aiScore.toFixed(3)}`, aiAnalysisResult.details);
    } catch (e) {
        error(`(Background) Error running AI Engine URL analysis for ${url}:`, e);
        sourceResults.aiEngine = { score: 0, error: e.message, details: {} };
    }

    // 2. PhishTank
    try {
        let phishTankResult = await apiCache.getCachedResponse('phishtank', url);
        if (!phishTankResult) {
            debug(`(Background) PhishTank cache miss for ${url}. Fetching from API.`);
            phishTankResult = await phishTankClient.checkPhishTank(url);
            if (phishTankResult && !phishTankResult.error) {
                await apiCache.setCachedResponse('phishtank', url, phishTankResult, apiCache.TTL_PHISHTANK);
            }
        } else {
            debug(`(Background) PhishTank cache hit for ${url}.`);
        }
        sourceResults.phishtank = phishTankResult;
        const phishTankScore = normalizeScore('PHISHTANK', phishTankResult);
        if (phishTankScore > 0) anySourceReportedThreat = true;
        unifiedScore += phishTankScore * API_WEIGHTS.PHISHTANK;
        log(`(Background) PhishTank check for ${url}: Score=${phishTankScore}, Result:`, phishTankResult);
    } catch (e) {
        error(`(Background) Error checking PhishTank for ${url}:`, e);
        sourceResults.phishtank = { error: e.message };
    }

    // 3. Google Safe Browsing
    try {
        let safeBrowsingResult = await apiCache.getCachedResponse('safebrowsing', url);
        if (!safeBrowsingResult) {
            debug(`(Background) Safe Browsing cache miss for ${url}. Fetching from API.`);
            safeBrowsingResult = await safeBrowsingClient.checkGoogleSafeBrowsing(url);
            if (safeBrowsingResult && !safeBrowsingResult.error) {
                await apiCache.setCachedResponse('safebrowsing', url, safeBrowsingResult, apiCache.TTL_SAFE_BROWSING);
            }
        } else {
            debug(`(Background) Safe Browsing cache hit for ${url}.`);
        }
        sourceResults.safeBrowsing = safeBrowsingResult;
        const safeBrowsingScore = normalizeScore('SAFE_BROWSING', safeBrowsingResult);
        if (safeBrowsingScore > 0) anySourceReportedThreat = true;
        unifiedScore += safeBrowsingScore * API_WEIGHTS.SAFE_BROWSING;
        log(`(Background) Safe Browsing check for ${url}: Score=${safeBrowsingScore}, Result:`, safeBrowsingResult);
    } catch (e) {
        error(`(Background) Error checking Safe Browsing for ${url}:`, e);
        sourceResults.safeBrowsing = { error: e.message };
    }

    // 4. VirusTotal
    try {
        let virusTotalResult = await apiCache.getCachedResponse('virustotal', url);
        if (!virusTotalResult) {
            debug(`(Background) VirusTotal cache miss for ${url}. Fetching from API.`);
            virusTotalResult = await virusTotalClient.checkVirusTotal(url);
            if (virusTotalResult && !virusTotalResult.error) {
                await apiCache.setCachedResponse('virustotal', url, virusTotalResult, apiCache.TTL_VIRUSTOTAL);
            }
        } else {
            debug(`(Background) VirusTotal cache hit for ${url}.`);
        }
        sourceResults.virusTotal = virusTotalResult;
        const virusTotalScore = normalizeScore('VIRUSTOTAL', virusTotalResult);
        if (virusTotalScore > 0) anySourceReportedThreat = true;
        unifiedScore += virusTotalScore * API_WEIGHTS.VIRUSTOTAL;
        log(`(Background) VirusTotal check for ${url}: Score=${virusTotalScore}, Result:`, virusTotalResult);
    } catch (e) {
        error(`(Background) Error checking VirusTotal for ${url}:`, e);
        sourceResults.virusTotal = { error: e.message };
    }
    
    // 5. NLP Content Analysis (if textContent is provided)
    if (textContent) {
        try {
            const nlpAnalysisResult = await aiEngine.analyzePageContentLocally(textContent);
            sourceResults.nlpContent = nlpAnalysisResult;
            const nlpScore = normalizeScore('NLP_CONTENT', nlpAnalysisResult);
            if (nlpScore > 0) anySourceReportedThreat = true;
            unifiedScore += nlpScore * API_WEIGHTS.NLP_CONTENT;
            log(`(Background) NLP Content check for ${url}: Score=${nlpScore.toFixed(3)}`, nlpAnalysisResult.details || nlpAnalysisResult.keywordsFound);
        } catch (e) {
            error(`(Background) Error running NLP Content analysis for ${url}:`, e);
            sourceResults.nlpContent = { score: 0, error: e.message, details: {} };
        }
    } else {
        sourceResults.nlpContent = { score: 0, error: "Not run / no content provided", details: {} };
        debug(`(Background) NLP Content analysis skipped for ${url} as no textContent was provided in this call.`);
    }
    
    // Ensure score is capped at 1 after all additions
    unifiedScore = Math.min(unifiedScore, 1);
    // Also ensure score is not negative if any component somehow produced a negative value (should not happen with current normalizers)
    unifiedScore = Math.max(unifiedScore, 0);

    const severity = getSeverity(unifiedScore);
    const threatDetails = {
        url: url,
        unifiedScore: unifiedScore,
        severity: severity,
        anySourceReportedThreat: anySourceReportedThreat,
        sources: sourceResults,
        timestamp: new Date().toISOString()
    };

    log(`(Background) Threat check complete for ${url}: Unified Score = ${unifiedScore}, Severity = ${severity}`, threatDetails);

    // TODO: Implement resiliency & fallbacks more explicitly if all primary APIs fail.
    // For now, errors are logged, and scoring proceeds with available data.
    // Fallback could involve using stale cache or local blacklist/keyword checks if unifiedScore is 0 and errors occurred.

    if (anySourceReportedThreat || severity !== 'NONE') {
        // Send message to content script to display a warning
        chrome.tabs.sendMessage(tabId, {
            type: "SHOW_WARNING_BANNER",
            details: threatDetails
        }).catch(e => {
            // This can happen if the content script isn't ready or the tab is closed.
            // Or if the tab is a special page (e.g., chrome://) where content scripts don't run.
            if (e.message.includes("Could not establish connection") || e.message.includes("No matching signature")) {
                 warn(`(Background) Could not send warning to tab ${tabId} for ${url}. Content script might not be injected or tab closed.`);
            } else {
                error(`(Background) Error sending warning to content script for tab ${tabId} (${url}):`, e);
            }
        });
        // Update icon to indicate a threat
        chrome.action.setIcon({
            path: {
                "16": "/src/assets/logo/logo-warning-16.png",
                "32": "/src/assets/logo/logo-warning-32.png"
            },
            tabId: tabId
        });

    } else {
         // Reset icon if site is deemed safe by APIs
        chrome.action.setIcon({
            path: {
                "16": "/src/assets/logo/logo-16.png",
                "32": "/src/assets/logo/logo-32.png"
            },
            tabId: tabId
        });
    }
    return threatDetails; // Return details for potential use by caller (e.g. manual check)
}

// Listener for tab updates to trigger URL checks
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Minimal test log to see if the listener fires AT ALL (KEEP THIS FOR NOW)
    console.log('[Scam Shield - SW onUpdated Test] Event Fired:', tabId, changeInfo, tab);
    debug('(Background) [TEST] onUpdated event fired.', { tabId, status: changeInfo.status, url: tab ? tab.url : 'No tab object' });

    // Restore original logic below
    // Enhanced logging to debug why API checks might not be triggering
    // The debug log below is similar to the [TEST] one, can be removed if [TEST] is kept, or kept for more detail.
    debug(`(Background) onUpdated event (full details): TabID=${tabId}, Status=${changeInfo.status}, URL=${tab.url}`, changeInfo, tab);

    // Check if the extension is active and the tab has finished loading and has a URL
    if (isExtensionCurrentlyActive && changeInfo.status === 'complete' && tab.url) {
        // Avoid checking chrome://, about:, file://, etc. URLs
        if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
            log(`(Background) Tab ${tabId} updated to ${tab.url}, status: ${changeInfo.status}. Triggering threat check.`);
            checkUrlThreats(tab.url, tabId).catch(e => {
                error(`(Background) Unhandled error during onUpdated check for ${tab.url}:`, e);
            });
        } else {
            debug(`(Background) Tab ${tabId} updated to non-http(s) URL: ${tab.url}. Skipping API checks.`);
        }
    } else {
        // Log why the main condition was not met (if status is 'complete' but other parts fail)
        if (changeInfo.status === 'complete') { // Only log these specific failures if status was already complete
            if (!tab.url) {
                debug(`(Background) onUpdated: Tab.url is not set for TabID=${tabId} when status is complete.`);
            } else if (!isExtensionCurrentlyActive) {
                debug(`(Background) onUpdated: Extension is not active when status is complete. TabID=${tabId}`);
            }
        } 
        // Optional: log for other statuses if needed, but can be noisy
        // else { 
        //    debug(`(Background) onUpdated: Main conditions not met. Status: ${changeInfo.status}, URL: ${tab.url}, Active: ${isExtensionCurrentlyActive}`);
        // }
    }
});

// Example debug log
debug("(Background): Service worker script loaded and advanced threat detection initialized.");

// TODO: Implement exponential backoff for API retries.
// TODO: Implement more robust offline mode behavior.
// TODO: Add UI in options page for managing API keys.
// TODO: Add alternative feeds (OpenPhish, URLhaus) as fallbacks - would require new client modules.

// Ensure warning icons are specified in manifest.json web_accessible_resources if not already
// "src/assets/logo/logo-warning-16.png",
// "src/assets/logo/logo-warning-32.png" 

// Inside service_worker.js for testing
async function testNLP() {
    const testText1 = "URGENT! We have detected unusual activity on your account. Please verify your account immediately to avoid suspension. Click here to confirm your details and secure your login. This is your final notice, act now or your account will be locked.";
    const result1 = await aiEngine.analyzePageContentLocally(testText1);
    log("NLP Test 1 Result:", result1);

    const benignText = "This is a very long and safe text about the history of the internet, discussing various protocols like TCP/IP, HTTP, and the development of web browsers. It does not contain any scary words or urgent calls to action, nor does it promise any prizes or ask for account verification. It's purely informational and educational, designed to be as innocuous as possible for testing purposes. We need to ensure it passes the 100 character minimum for the NLP analysis to run. This should be sufficient.";
    const resultBenign = await aiEngine.analyzePageContentLocally(benignText);
    log("NLP Test Benign Result:", resultBenign);
    
    // Add more test cases here
}

// Call it, perhaps after initialization or on some trigger
// For example, at the end of your service worker script for immediate testing on reload:
testNLP().catch(e => error("NLP Test function error:", e)); 