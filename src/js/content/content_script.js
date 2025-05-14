import { log, warn, error, debug } from '../shared/logger.js';

// Keywords indicating potential scams - **REMOVED, will be fetched from storage**
// const scamKeywords = [ ... ];

const EXTENSION_STATUS_KEY = 'scamShieldActiveStatus';
let extensionIsActive = true; // Default to true, will be updated from storage

// Store a reference to the warning UI if it's visible
let currentWarningUI = null;

/**
 * Initializes the content script's understanding of the extension's active status.
 * Reads from chrome.storage.local, then proceeds to run checks and attach listeners if active.
 * This function orchestrates the initial activation of content script features based on stored settings.
 * @async
 */
async function initializeContentScriptStatus() {
    try {
        const data = await chrome.storage.local.get(EXTENSION_STATUS_KEY);
        if (data[EXTENSION_STATUS_KEY] !== undefined) {
            extensionIsActive = data[EXTENSION_STATUS_KEY];
        }
        log("(Content Script): Initialized. Active status:", extensionIsActive);
    } catch (e) {
        error("(Content Script): Error loading status:", e);
        extensionIsActive = true; 
    }

    if (extensionIsActive) {
        await checkBlacklist(); // L3 (Red) - stops if warning shown
        
        if (!currentWarningUI) { // Only proceed if no L3 warning
            const l2WarningShown = await checkForLevel2Warnings(); // L2 (Orange)
            if (!l2WarningShown && !currentWarningUI) { // Only proceed if no L2 warning
                await scanPageContentForKeywords(); // L1 (Yellow for page content)
            }
        }
        // Link scanner (L1 for links) is always active if extension is active, 
        // but displayGraduatedWarning itself checks currentWarningUI.
        document.addEventListener('click', linkScannerClickListener, true);
        log("(Content Script): Listeners active.");
    } else {
        log("(Content Script): Extension is inactive. Listeners not attached.");
    }
}

// Call initialization
initializeContentScriptStatus();

// Add listener for messages from the background script (service worker)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log("(Content Script) Received message:", message);
    if (message.type === "SHOW_WARNING_BANNER") {
        if (!extensionIsActive) {
            log("(Content Script) Extension is not active, not showing API-based warning banner.");
            return;
        }
        const { details } = message;
        let level = 'yellow'; // Default for LOW
        if (details.severity === 'HIGH') level = 'red';
        else if (details.severity === 'MEDIUM') level = 'orange';

        let title = `Potential Threat Detected (${details.severity})`;
        if (details.severity === 'NONE' && details.anySourceReportedThreat) {
             // This case might occur if the score is low but one source was positive.
             // Or if we want to inform about a specific finding even if overall score is low.
            title = "Security Alert";
            level = 'yellow'; // Ensure it's at least yellow if any source reported a threat
        }

        // Construct a more detailed message
        let apiMessage = `Scam Shield analysis for <strong style="word-break: break-all;">${details.url}</strong> (Score: ${details.unifiedScore.toFixed(2)}):<br>`;
        
        const contributingSources = [];
        for (const sourceKey in details.sources) {
            const sourceResult = details.sources[sourceKey];
            if (sourceResult && !sourceResult.error) {
                let contributed = false;
                if (sourceKey === 'phishtank' && sourceResult.isPhishing) {
                    apiMessage += `- PhishTank: Reported as phishing.<br>`;
                    contributed = true;
                }
                if (sourceKey === 'safeBrowsing' && sourceResult.isMalicious && sourceResult.threats) {
                    apiMessage += `- Google Safe Browsing: Found threats (${sourceResult.threats.join(', ')}).<br>`;
                    contributed = true;
                }
                if (sourceKey === 'virusTotal' && sourceResult.isMalicious && sourceResult.positives !== null) {
                    apiMessage += `- VirusTotal: ${sourceResult.positives}/${sourceResult.total} engines flagged as malicious/suspicious.<br>`;
                    contributed = true;
                }
                if (contributed) contributingSources.push(sourceKey);
            }
        }

        if (contributingSources.length === 0 && details.anySourceReportedThreat) {
            apiMessage += "One or more security sources reported a potential issue not detailed above.<br>";
        }
        if (contributingSources.length === 0 && !details.anySourceReportedThreat && details.severity !== 'NONE') {
            apiMessage += "Multiple signals suggest caution, though no single source confirmed a specific threat.<br>";
        }
        if (details.severity === 'NONE' && !details.anySourceReportedThreat) {
            // This should ideally not happen if the service worker only sends messages for threats.
            // But as a safeguard:
            log("(Content Script) SHOW_WARNING_BANNER received for severity NONE and no source threats. Ignoring.");
            return; 
        }

        const recommendations = [
            "Verify the website address (URL) is correct.",
            "Do not enter sensitive information if you are unsure.",
            "If in doubt, close the page or navigate to a known safe site."
        ];

        displayGraduatedWarning(level, title, apiMessage, recommendations);
        sendResponse({ success: true, message: "Banner displayed" });
    }
    return true; // Keep channel open for async response if needed in other handlers
});

/**
 * Checks if the current page's hostname is in the Scam Shield blacklist.
 * If it is, displays a Level 3 (Red) graduated warning, taking precedence over other checks.
 * @async
 */
async function checkBlacklist() {
  // This function will only be called if extensionIsActive is true
  const currentHostname = window.location.hostname;

  try {
    const data = await chrome.storage.local.get('scamShieldBlacklist');
    const blacklist = data.scamShieldBlacklist || []; 
    if (blacklist.includes(currentHostname)) {
      displayWarningBanner();
    }
  } catch (e) {
    error("(Content Script): Error checking blacklist:", e);
  }
}

/**
 * Displays a graduated warning UI on the page.
 * This function creates and injects a modal-like warning overlay.
 * It ensures only one such warning is visible at a time by managing `currentWarningUI`.
 * @param {'red'|'orange'|'yellow'} level - The severity level of the warning. Determines visual styling (e.g., border color).
 * @param {string} title - The title displayed in the warning header.
 * @param {string} message - The main informational message for the warning. Can include HTML for formatting (e.g., <ul> for lists).
 * @param {string[]} recommendations - An array of strings, each representing a piece of advice for the user.
 */
function displayGraduatedWarning(level, title, message, recommendations) {
    if (currentWarningUI) {
        currentWarningUI.remove(); // Remove any existing warning
    }

    currentWarningUI = document.createElement('div');
    currentWarningUI.id = 'scam-shield-graduated-warning';
    currentWarningUI.classList.add(`level-${level}`); // e.g., level-red, level-orange

    let borderColor = '#cc0000'; // Default red
    if (level === 'yellow') borderColor = '#ffc107';
    if (level === 'orange') borderColor = '#ff9800';

    currentWarningUI.innerHTML = `
        <div class="warning-header" style="background-color: ${borderColor};">
            <span class="warning-icon">⚠️</span>
            <h3 class="warning-title">${title}</h3>
        </div>
        <div class="warning-body">
            <p class="warning-message">${message}</p>
            ${recommendations && recommendations.length > 0 ? 
                `<div class="warning-recommendations">
                    <h4>Recommendations:</h4>
                    <ul>${recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>
                </div>` : ''
            }
        </div>
        <div class="warning-actions">
            <button id="warning-go-back">Go Back</button>
            <button id="warning-proceed">Proceed with Caution</button>
            <button id="warning-close">Dismiss</button> <!-- Added Dismiss -->
        </div>
    `;

    document.body.appendChild(currentWarningUI);

    // Add event listeners for actions
    currentWarningUI.querySelector('#warning-go-back').addEventListener('click', () => {
        history.back();
        currentWarningUI.remove();
        currentWarningUI = null;
    });

    currentWarningUI.querySelector('#warning-proceed').addEventListener('click', () => {
        log("User chose to proceed.");
        // For now, just dismisses. Could add a session storage flag to not warn again for this site/session.
        currentWarningUI.remove();
        currentWarningUI = null;
    });
    
    currentWarningUI.querySelector('#warning-close').addEventListener('click', () => {
        currentWarningUI.remove();
        currentWarningUI = null;
    });

    // Inject styles for the warning UI
    injectWarningStyles(); 
}

/**
 * Injects the necessary CSS styles for the graduated warning UI into the page's head.
 * Ensures styles are only injected once by checking for an existing style element with a specific ID.
 */
function injectWarningStyles() {
    if (document.getElementById('scam-shield-warning-styles')) return;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'scam-shield-warning-styles';
    styleSheet.textContent = `
        #scam-shield-graduated-warning {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 500px;
            background-color: #fff;
            border: 3px solid;
            border-radius: 8px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
            z-index: 100000000; /* Max z-index */
            color: #333;
            font-family: Arial, sans-serif;
            font-size: 16px;
            overflow: hidden;
            animation: fadeInWarning 0.3s ease-out;
        }
        @keyframes fadeInWarning {
            from { opacity: 0; transform: translate(-50%, -45%); }
            to { opacity: 1; transform: translate(-50%, -50%); }
        }
        #scam-shield-graduated-warning.level-red { border-color: #cc0000; }
        #scam-shield-graduated-warning.level-orange { border-color: #ff9800; }
        #scam-shield-graduated-warning.level-yellow { border-color: #ffc107; }

        .warning-header {
            padding: 10px 15px;
            color: white;
            display: flex;
            align-items: center;
        }
        .warning-header .warning-icon {
            font-size: 1.8em;
            margin-right: 10px;
        }
        .warning-header .warning-title {
            margin: 0;
            font-size: 1.2em;
            font-weight: bold;
        }
        .warning-body {
            padding: 15px;
            line-height: 1.6;
        }
        .warning-body .warning-message {
            margin-top: 0;
            margin-bottom: 15px;
        }
        .warning-recommendations h4 {
            margin-top: 0;
            margin-bottom: 5px;
            font-size: 1em;
        }
        .warning-recommendations ul {
            margin: 0;
            padding-left: 20px;
        }
        .warning-actions {
            padding: 10px 15px;
            background-color: #f0f0f0;
            text-align: right;
            border-top: 1px solid #ddd;
        }
        .warning-actions button {
            padding: 8px 15px;
            border: none;
            border-radius: 4px;
            margin-left: 10px;
            cursor: pointer;
            font-weight: bold;
            transition: opacity 0.2s ease;
        }
        .warning-actions button:hover { opacity: 0.8; }
        #warning-go-back { background-color: #6c757d; color: white; }
        #warning-proceed { background-color: #ffc107; color: #333; }
        #warning-close { background-color: #ddd; color: #333; }
        #scam-shield-graduated-warning.level-red #warning-proceed { background-color: #dc3545; color: white; }
        #scam-shield-graduated-warning.level-orange #warning-proceed { background-color: #fd7e14; color: white; }
    `;
    document.head.appendChild(styleSheet);
}

/**
 * Displays a specific Level 3 (Red) warning for blacklisted sites.
 * This is a convenience function that calls displayGraduatedWarning.
 * @deprecated Prefer calling displayGraduatedWarning directly with appropriate parameters for clarity and future flexibility.
 */
function displayWarningBanner() {
  if (document.getElementById('scam-shield-graduated-warning')) return; 
  const oldBanner = document.getElementById('scam-shield-warning-banner');
  if (oldBanner) oldBanner.remove();
  const title = "Known Scam Site Alert";
  const message = "This website is on the Scam Shield blacklist. It is strongly advised to go back and not share any personal information.";
  const recommendations = [
    "Do not enter any passwords or personal details.",
    "Close this tab immediately.",
    "If you have already entered information, monitor your accounts."
  ];
  displayGraduatedWarning('red', title, message, recommendations);
  log("(Content Script): Displayed RED graduated warning for blacklisted site.");
}

// --- Keyword-Based Link Scanner and Page Scanner ---

/**
 * Scans the current page's body text for predefined suspicious keywords.
 * If a keyword is found and no higher-level warning is active (`currentWarningUI` is null),
 * it displays a Level 1 (Yellow) warning.
 * @async
 * @returns {Promise<boolean>} A promise that resolves to true if a warning was shown, false otherwise.
 */
async function scanPageContentForKeywords() {
    if (!extensionIsActive || currentWarningUI) return false;
    debug("(Content Script): Scanning page content for keywords.");
    try {
        const data = await chrome.storage.local.get(['scamShieldKeywords', 'scamShieldCustomKeywords']);
        const defaultKeywords = data.scamShieldKeywords || [];
        const customKeywords = data.scamShieldCustomKeywords || [];
        const combinedKeywords = [...new Set([...defaultKeywords, ...customKeywords])];
        
        if (combinedKeywords.length === 0) return false;

        const bodyText = document.body.innerText.toLowerCase();
        const foundKeyword = combinedKeywords.find(keyword => {
            // Ensure keyword is a string and not empty before calling toLowerCase
            if (typeof keyword === 'string' && keyword.trim() !== '') {
                return bodyText.includes(keyword.toLowerCase());
            }
            return false;
        });

        if (foundKeyword) {
            log("(Content Script): Keyword '" + foundKeyword + "' found in page content.");
            const title = "Suspicious Content Detected";
            const message = `The page content includes the term "${foundKeyword}", which is sometimes associated with unwanted or deceptive content. Review carefully before interacting.`;
            const recommendations = [
                "Be cautious with any forms or requests for information.",
                "Verify the website's authenticity through other means if unsure.",
                "If this is unexpected, consider navigating away."
            ];
            displayGraduatedWarning('yellow', title, message, recommendations);
            return true; 
        }
    } catch (e) {
        error("(Content Script): Error scanning page content:", e);
    }
    return false; 
}

/**
 * Event listener for clicks on anchor (<a>) tags.
 * Scans the link's href and text content for suspicious keywords.
 * If a keyword is found and no other warning is currently displayed (`currentWarningUI` is null),
 * it prevents the default navigation, displays a Level 1 (Yellow) warning, and provides options
 * to proceed to the link or go back.
 * @async
 * @param {MouseEvent} event - The click event object.
 */
async function linkScannerClickListener(event) {
  if (!extensionIsActive || currentWarningUI) return;
  const link = event.target.closest('a');
  if (link && link.href && !link.href.startsWith('javascript:')) {
    try {
        const data = await chrome.storage.local.get(['scamShieldKeywords', 'scamShieldCustomKeywords']);
        const defaultKeywords = data.scamShieldKeywords || [];
        const customKeywords = data.scamShieldCustomKeywords || [];
        const combinedKeywords = [...new Set([...defaultKeywords, ...customKeywords])];

        if (combinedKeywords.length === 0) return;

        const href = link.href.toLowerCase();
        const linkText = link.textContent.toLowerCase();
        const combinedText = href + ' ' + linkText;
        const foundKeyword = combinedKeywords.find(keyword => {
            // Ensure keyword is a string and not empty before calling toLowerCase
            if (typeof keyword === 'string' && keyword.trim() !== '') {
                return combinedText.includes(keyword.toLowerCase());
            }
            return false;
        });

        if (foundKeyword) {
            event.preventDefault(); 
            debug("(Content Script): Keyword '" + foundKeyword + "' found in link:", link.href);
            const title = "Suspicious Link Detected";
            const message = `This link contains the term "${foundKeyword}" which is sometimes used in phishing or scam attempts. Clicking this link could lead to a malicious website.`;
            const recommendations = [
                "Do not click this link if you don\'t trust the source.",
                "Hover over the link to see the full URL.",
                "If unsure, type the intended website address directly into your browser."
            ];
            displayGraduatedWarning('yellow', title, message, recommendations);
            if (currentWarningUI) {
                 const proceedButton = currentWarningUI.querySelector('#warning-proceed');
                 if(proceedButton) {
                    const newProceedButton = proceedButton.cloneNode(true);
                    proceedButton.parentNode.replaceChild(newProceedButton, proceedButton);
                    newProceedButton.addEventListener('click', () => {
                        log("User chose to proceed with link:", link.href);
                        if(currentWarningUI) currentWarningUI.remove();
                        currentWarningUI = null;
                        window.location.href = link.href; 
                    });
                 }
            }
        }
    } catch (e) {
        error("(Content Script): Error in link scanner:", e);
    }
  }
}

// --- Level 2 Risk Factor Detection ---

/**
 * Analyzes a given URL string for common risk factors such as being an IP address,
 * having an excessive number of subdomains, or containing too many hyphens.
 * @param {string} url - The URL string to analyze.
 * @returns {string[]} An array of strings, where each string describes a detected risk factor. Returns an empty array if no risks are found or if the URL cannot be parsed.
 */
function analyzeUrlForRisk(url) {
    const riskFactors = [];
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
            riskFactors.push("URL uses an IP address instead of a domain name.");
        }
        const subdomainParts = hostname.split('.');
        if (subdomainParts.length > 4 && !riskFactors.some(r => r.includes("IP address"))) {
            riskFactors.push("URL has an unusually high number of subdomains.");
        }
        if ((hostname.match(/-/g) || []).length > 3) {
            riskFactors.push("URL contains multiple hyphens, sometimes used for obfuscation.");
        }
    } catch (e) {
        warn("(Content Script): Could not parse URL for risk analysis:", url, e);
    }
    return riskFactors;
}

/**
 * Checks the current page for Level 2 (Orange) warning conditions.
 * These conditions include a combination of multiple suspicious keywords found on the page
 * and/or significant risk factors identified in the page's URL.
 * If conditions are met and no higher-level warning is active, displays an L2 warning.
 * @async
 * @returns {Promise<boolean>} A promise that resolves to true if an L2 warning was shown, false otherwise.
 */
async function checkForLevel2Warnings() {
    if (!extensionIsActive || currentWarningUI) return false; 
    let detectedKeywordsOnPage = new Set();
    let urlRiskFactors = analyzeUrlForRisk(window.location.href);
    try {
        const data = await chrome.storage.local.get(['scamShieldKeywords', 'scamShieldCustomKeywords']);
        const defaultKeywords = data.scamShieldKeywords || [];
        const customKeywords = data.scamShieldCustomKeywords || [];
        const combinedKeywords = [...new Set([...defaultKeywords, ...customKeywords])];

        if (combinedKeywords.length > 0) {
            const bodyText = document.body.innerText.toLowerCase();
            combinedKeywords.forEach(keyword => {
                // Ensure keyword is a string and not empty before processing
                if (typeof keyword === 'string' && keyword.trim() !== '' && bodyText.includes(keyword.toLowerCase())) {
                    detectedKeywordsOnPage.add(keyword);
                }
            });
        }
    } catch (e) {
        error("(Content Script): Error gathering keywords for L2 check:", e);
    }
    const multipleKeywordsFactor = detectedKeywordsOnPage.size > 2;
    let l2Reasons = [];
    if (multipleKeywordsFactor) {
        l2Reasons.push(`Multiple suspicious keywords found on page (${Array.from(detectedKeywordsOnPage).slice(0,3).join(', ')}${detectedKeywordsOnPage.size > 3 ? '...' : ''}).`);
    }
    urlRiskFactors.forEach(factor => l2Reasons.push(factor));
    if (l2Reasons.length > 1) { 
        log("(Content Script): Level 2 risk factors detected:", l2Reasons);
        const title = "Elevated Risk Detected";
        let message = "This page exhibits multiple characteristics often associated with risky or deceptive websites. Details:\n<ul>";
        l2Reasons.forEach(reason => message += `<li>${reason}</li>`);
        message += "</ul>";
        const recommendations = [
            "Exercise extreme caution.",
            "Avoid submitting any sensitive information.",
            "Verify the site's legitimacy independently before proceeding."
        ];
        displayGraduatedWarning('orange', title, message, recommendations);
        return true; 
    }
    return false; 
}

/**
 * Listener for changes in `chrome.storage.local`.
 * Specifically watches for changes to the extension's active status (`EXTENSION_STATUS_KEY`).
 * Enables or disables content script features (listeners, warnings) dynamically based on the new status.
 * @async
 * @param {object} changes - An object where keys are the names of storage items that changed, 
 *                           and values are `StorageChange` objects describing the change.
 * @param {string} namespace - The storage area ('local', 'sync', or 'managed') where the change occurred.
 */
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local' && changes[EXTENSION_STATUS_KEY]) {
        const newStatus = changes[EXTENSION_STATUS_KEY].newValue;
        log("(Content Script): Detected status change to:", newStatus);
        const oldStatus = extensionIsActive;
        extensionIsActive = newStatus;
        if (newStatus === false && oldStatus === true) {
            document.removeEventListener('click', linkScannerClickListener, true);
            if (currentWarningUI) {
                currentWarningUI.remove();
                currentWarningUI = null;
            }
            const oldBanner = document.getElementById('scam-shield-warning-banner');
            if (oldBanner) oldBanner.remove();
            log("(Content Script): Deactivated features due to status change.");
        } else if (newStatus === true && oldStatus === false) {
            await initializeContentScriptStatus(); 
            log("(Content Script): Re-activated features due to status change.");
        }
    }
});

// Add a debug log at the end of the script for loaded confirmation
debug("(Content Script): Script loaded and initialized event listeners setup (if active)."); 