import { log, debug, error } from '../shared/logger.js';

const DEBUG_MODE_KEY = 'scamShieldDebugMode';
const CUSTOM_KEYWORDS_KEY = 'scamShieldCustomKeywords';
const BLACKLIST_KEY = 'scamShieldBlacklist'; // Key for the blacklist in storage

// --- UI Elements (Options Page) --- 
let uiElements = {};

/**
 * Displays a status message to the user on the options page.
 * @param {string} elementId - The ID of the status message element to use (e.g., 'customKeywordStatus', 'blacklistStatusOptions').
 * @param {string} message - The message to display.
 * @param {boolean} [isError=false] - True if the message is an error, false otherwise.
 * @param {number} [duration=3000] - How long the message should be visible (ms). 0 for persistent.
 */
function showOptionsPageStatusMessage(elementId, message, isError = false, duration = 3000) {
    const statusElement = uiElements[elementId]; // Use stored reference
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = 'status-message'; // Reset classes
        if (isError) {
            statusElement.classList.add('error');
        }
        statusElement.style.display = 'block'; // Make sure it is visible
        if (duration > 0) {
            setTimeout(() => {
                if (statusElement.textContent === message) { // Clear only if message hasn't changed
                statusElement.textContent = '';
                statusElement.classList.remove('error');
                    statusElement.style.display = 'none'; // Hide after timeout
                }
            }, duration);
        }
    } else {
        error('(OptionsPage) Status message element with ID ' + elementId + ' not found in uiElements.');
    }
}

/**
 * Renders the list of custom keywords in the UI.
 * @param {string[]} keywords - Array of custom keywords.
 */
function renderCustomKeywordList(keywords) {
    const listElement = uiElements.customKeywordList;
    if (!listElement) return;
    listElement.innerHTML = '';
    if (keywords.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.textContent = 'No custom keywords added yet.';
        emptyLi.style.justifyContent = 'center';
        emptyLi.style.fontStyle = 'italic';
        listElement.appendChild(emptyLi);
        return;
    }
    keywords.forEach(keyword => {
        const listItem = document.createElement('li');
        const textSpan = document.createElement('span');
        textSpan.textContent = keyword;
        
        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.classList.add('remove-btn');
        removeButton.dataset.keyword = keyword;

        removeButton.addEventListener('click', async (event) => {
            const keywordToRemove = event.target.dataset.keyword;
            await removeCustomKeyword(keywordToRemove);
        });

        listItem.appendChild(textSpan);
        listItem.appendChild(removeButton);
        listElement.appendChild(listItem);
    });
}

/**
 * Loads custom keywords from storage and renders them.
 */
async function loadAndRenderCustomKeywords() {
    try {
        const data = await chrome.storage.local.get(CUSTOM_KEYWORDS_KEY);
        const keywords = data[CUSTOM_KEYWORDS_KEY] || [];
        renderCustomKeywordList(keywords);
        debug('(OptionsPage): Custom keywords loaded and rendered:', keywords);
    } catch (e) {
        error('(OptionsPage): Error loading custom keywords:', e);
        showOptionsPageStatusMessage('customKeywordStatus', 'Error loading custom keywords.', true, 0); // Persistent error
    }
}

/**
 * Adds a new custom keyword to storage and updates the UI.
 * @param {string} keyword - The keyword to add.
 */
async function addCustomKeyword(keyword) {
    const cleanKeyword = keyword.trim().toLowerCase();
    if (!cleanKeyword) {
        showOptionsPageStatusMessage('customKeywordStatus', 'Keyword cannot be empty.', true);
        return;
    }

    try {
        const data = await chrome.storage.local.get(CUSTOM_KEYWORDS_KEY);
        let keywords = data[CUSTOM_KEYWORDS_KEY] || [];
        if (keywords.includes(cleanKeyword)) {
            showOptionsPageStatusMessage('customKeywordStatus', "Keyword '" + cleanKeyword + "' already exists.", false, 4000);
            return;
        }
        keywords.push(cleanKeyword);
        await chrome.storage.local.set({ [CUSTOM_KEYWORDS_KEY]: keywords });
        log('(OptionsPage): Custom keyword added: ' + cleanKeyword);
        showOptionsPageStatusMessage('customKeywordStatus', "Keyword '" + cleanKeyword + "' added successfully.");
        await loadAndRenderCustomKeywords();
    } catch (e) {
        error('(OptionsPage): Error adding custom keyword:', e);
        showOptionsPageStatusMessage('customKeywordStatus', 'Error adding keyword.', true, 0); // Persistent error
    }
}

/**
 * Removes a custom keyword from storage and updates the UI.
 * @param {string} keywordToRemove - The keyword to remove.
 */
async function removeCustomKeyword(keywordToRemove) {
    try {
        const data = await chrome.storage.local.get(CUSTOM_KEYWORDS_KEY);
        let keywords = data[CUSTOM_KEYWORDS_KEY] || [];
        const initialLength = keywords.length;
        keywords = keywords.filter(k => k !== keywordToRemove);

        if (keywords.length < initialLength) {
            await chrome.storage.local.set({ [CUSTOM_KEYWORDS_KEY]: keywords });
            log('(OptionsPage): Custom keyword removed: ' + keywordToRemove);
            showOptionsPageStatusMessage('customKeywordStatus', "Keyword '" + keywordToRemove + "' removed.");
            await loadAndRenderCustomKeywords();
        } else {
            showOptionsPageStatusMessage('customKeywordStatus', "Keyword '" + keywordToRemove + "' not found.", true);
        }
    } catch (e) {
        error('(OptionsPage): Error removing custom keyword:', e);
        showOptionsPageStatusMessage('customKeywordStatus', 'Error removing keyword.', true, 0); // Persistent error
    }
}

// --- Blacklist Management Functions ---

/**
 * Renders the list of blacklisted hostnames in the UI.
 * @param {string[]} hostnames - Array of blacklisted hostnames.
 */
function renderBlacklist(hostnames) {
    const listElement = uiElements.blacklistOptionsList;
    if (!listElement) {
        error("(OptionsPage): Blacklist list element not found in uiElements.");
        return;
    }
    listElement.innerHTML = '';
    if (hostnames.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.textContent = 'No sites blacklisted yet.';
        emptyLi.style.justifyContent = 'center';
        emptyLi.style.fontStyle = 'italic';
        listElement.appendChild(emptyLi);
        return;
    }
    hostnames.forEach(hostname => {
        const listItem = document.createElement('li');
        const textSpan = document.createElement('span');
        textSpan.textContent = hostname;
        
        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.classList.add('remove-btn');
        removeButton.dataset.hostname = hostname;

        removeButton.addEventListener('click', async (event) => {
            const hostnameToRemove = event.target.dataset.hostname;
            await removeHostnameFromBlacklist(hostnameToRemove);
        });

        listItem.appendChild(textSpan);
        listItem.appendChild(removeButton);
        listElement.appendChild(listItem);
    });
}

/**
 * Loads blacklisted hostnames from storage and renders them.
 */
async function loadAndRenderBlacklist() {
    try {
        const data = await chrome.storage.local.get(BLACKLIST_KEY);
        const hostnames = data[BLACKLIST_KEY] || [];
        renderBlacklist(hostnames);
        debug('(OptionsPage): Blacklist loaded and rendered:', hostnames);
    } catch (e) {
        error('(OptionsPage): Error loading blacklist:', e);
        showOptionsPageStatusMessage('blacklistStatusOptions', 'Error loading blacklist.', true, 0);
    }
}

/**
 * Adds a new hostname to the blacklist.
 * @param {string} hostnameInput - The hostname to add.
 */
async function addHostnameToBlacklist(hostnameInput) {
    let cleanHostname = hostnameInput.trim();
    if (!cleanHostname) {
        showOptionsPageStatusMessage('blacklistStatusOptions', 'Hostname cannot be empty.', true);
        return;
    }
    
    let attemptedHostname = cleanHostname; // Store for error messages
    try {
        // Attempt to create a URL object to validate and extract hostname
        let parsedUrl;
        try {
            parsedUrl = new URL('http://' + cleanHostname); // Avoid template literal for robustness here
            cleanHostname = parsedUrl.hostname;
        } catch (_) {
            // If URL constructor fails, it might be a simple domain or invalid.
            // Validate as a simple domain-like string.
            if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(cleanHostname)) {
                showOptionsPageStatusMessage('blacklistStatusOptions', 'Invalid hostname format. Please use a valid domain name (e.g., example.com).', true);
                return;
            }
            // If it passes regex, assume cleanHostname is already the intended domain.
        }

        const data = await chrome.storage.local.get(BLACKLIST_KEY);
        let hostnames = data[BLACKLIST_KEY] || [];
        if (hostnames.includes(cleanHostname)) {
            showOptionsPageStatusMessage('blacklistStatusOptions', "Hostname '" + cleanHostname + "' is already blacklisted.", false, 4000);
            return;
        }
        hostnames.push(cleanHostname);
        await chrome.storage.local.set({ [BLACKLIST_KEY]: hostnames });
        log('(OptionsPage): Hostname added to blacklist: ' + cleanHostname);
        showOptionsPageStatusMessage('blacklistStatusOptions', "Hostname '" + cleanHostname + "' added successfully.");
        await loadAndRenderBlacklist();
    } catch (e) {
        error('(OptionsPage): Error adding to blacklist (input: ' + attemptedHostname + '):', e);
        showOptionsPageStatusMessage('blacklistStatusOptions', 'Error adding to blacklist. Check console for details.', true, 0);
    }
}

/**
 * Removes a hostname from the blacklist.
 * @param {string} hostnameToRemove - The hostname to remove.
 */
async function removeHostnameFromBlacklist(hostnameToRemove) {
    try {
        const data = await chrome.storage.local.get(BLACKLIST_KEY);
        let hostnames = data[BLACKLIST_KEY] || [];
        const initialLength = hostnames.length;
        hostnames = hostnames.filter(h => h !== hostnameToRemove);

        if (hostnames.length < initialLength) {
            await chrome.storage.local.set({ [BLACKLIST_KEY]: hostnames });
            log('(OptionsPage): Hostname removed from blacklist: ' + hostnameToRemove);
            showOptionsPageStatusMessage('blacklistStatusOptions', "Hostname '" + hostnameToRemove + "' removed.");
            await loadAndRenderBlacklist();
        } else {
            showOptionsPageStatusMessage('blacklistStatusOptions', "Hostname '" + hostnameToRemove + "' not found in blacklist.", true);
        }
    } catch (e) {
        error('(OptionsPage): Error removing from blacklist:', e);
        showOptionsPageStatusMessage('blacklistStatusOptions', 'Error removing from blacklist.', true, 0);
    }
}

// --- Current Page Analysis Functions ---

/**
 * Requests threat analysis for the currently active tab.
 */
async function requestThreatAnalysisForActiveTab() {
    debug("(OptionsPage): Requesting threat analysis for active tab.");
    showOptionsPageStatusMessage('analysisStatusMessageOptions', 'Fetching analysis for current tab...', false, 0); // Persistent until result
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0 && tabs[0].url) {
            const currentTab = tabs[0];
            if (!currentTab.url.startsWith('http:') && !currentTab.url.startsWith('https:')) {
                displayThreatAnalysisInOptions({
                    url: currentTab.url,
                    score: 0,
                    severity: 'N/A',
                    message: 'Cannot analyze non-HTTP/HTTPS URLs.',
                    timestamp: new Date().toISOString()
                });
                showOptionsPageStatusMessage('analysisStatusMessageOptions', 'Cannot analyze non-HTTP/HTTPS URLs.', false);
                return;
            }
            // Send message to service worker to check the URL
            chrome.runtime.sendMessage(
                { type: "REQUEST_URL_CHECK", url: currentTab.url, tabId: currentTab.id },
                (response) => {
                    if (chrome.runtime.lastError) {
                        error("(OptionsPage) Error sending REQUEST_URL_CHECK:", chrome.runtime.lastError.message);
                        showOptionsPageStatusMessage('analysisStatusMessageOptions', 'Error requesting analysis: ' + chrome.runtime.lastError.message, true, 0);
                        displayThreatAnalysisInOptions({
                            url: currentTab.url,
                            score: 0,
                            severity: 'Error',
                            message: 'Could not fetch analysis from service worker.',
                            timestamp: new Date().toISOString()
                        });
                    } else if (response && response.success === false) {
                        error("(OptionsPage) Service worker returned error for REQUEST_URL_CHECK:", response.error);
                        showOptionsPageStatusMessage('analysisStatusMessageOptions', 'Analysis error: ' + (response.error || 'Unknown error'), true, 0);
                         displayThreatAnalysisInOptions({
                            url: currentTab.url,
                            score: 0,
                            severity: 'Error',
                            message: response.error || 'Failed to analyze URL.',
                            timestamp: new Date().toISOString()
                        });
                    } else if (response && response.success === true && response.result) {
                        debug("(OptionsPage) Received direct threat details:", response.result);
                        displayThreatAnalysisInOptions(response.result);
                        showOptionsPageStatusMessage('analysisStatusMessageOptions', 'Analysis complete.', false);
                    } else {
                         error("(OptionsPage) Unexpected response from REQUEST_URL_CHECK:", response);
                        showOptionsPageStatusMessage('analysisStatusMessageOptions', 'Unexpected response from analysis request.', true, 0);
                        displayThreatAnalysisInOptions({
                            url: currentTab.url,
                            score: 0,
                            severity: 'Error',
                            message: 'Unexpected response from service worker.',
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            );
        } else {
            displayThreatAnalysisInOptions({
                url: 'N/A',
                score: 0,
                severity: 'N/A',
                message: 'No active tab found or tab has no URL.',
                timestamp: new Date().toISOString()
            });
            showOptionsPageStatusMessage('analysisStatusMessageOptions', 'No active analyzable tab found.', false);
        }
    } catch (e) {
        error("(OptionsPage) Error requesting threat analysis:", e);
        showOptionsPageStatusMessage('analysisStatusMessageOptions', 'Failed to request analysis.', true, 0);
        displayThreatAnalysisInOptions({
            url: 'N/A',
            score: 0,
            severity: 'Error',
            message: 'Client-side error: ' + e.message,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Displays threat analysis results in the options page UI.
 * @param {object} threatDetails - The threat details object.
 * Expected structure: { url, score, severity, sources (optional), message (optional), timestamp }
 */
function displayThreatAnalysisInOptions(threatDetails) {
    debug("(OptionsPage) Displaying threat analysis:", threatDetails);

    if (!uiElements.analysisUrlOptions || !uiElements.analysisScoreOptions ||
        !uiElements.analysisSeverityOptions || !uiElements.analysisScoreBarOptions ||
        !uiElements.analysisDetailsBreakdownOptions || !uiElements.analysisTimestampOptions) {
        error("(OptionsPage) One or more analysis UI elements are missing.");
        return;
    }
    
    const { url, score, severity, sources, message, timestamp } = threatDetails;

    uiElements.analysisUrlOptions.textContent = url || 'N/A';
    uiElements.analysisUrlOptions.title = url || 'N/A';


    if (message && severity !== 'Error' && severity !== 'N/A') { // If there's a specific message (e.g. "Cannot analyze")
         uiElements.analysisScoreOptions.textContent = 'N/A';
         uiElements.analysisSeverityOptions.textContent = severity || '';
         uiElements.analysisScoreBarOptions.style.width = '0%';
         uiElements.analysisScoreBarOptions.className = 'score-bar-fill-options'; // Reset color
         uiElements.analysisDetailsBreakdownOptions.innerHTML = '<p><em>' + message + '</em></p>';
    } else if (severity === 'Error' || severity === 'N/A') {
        uiElements.analysisScoreOptions.textContent = 'Error';
        uiElements.analysisSeverityOptions.textContent = message ? '' : (severity || '');
        uiElements.analysisScoreBarOptions.style.width = '0%';
        uiElements.analysisScoreBarOptions.className = 'score-bar-fill-options';
        uiElements.analysisDetailsBreakdownOptions.innerHTML = '<p><em>' + (message || 'Analysis could not be performed or is not applicable.') + '</em></p>';
    } else {
        uiElements.analysisScoreOptions.textContent = score !== undefined ? score.toFixed(2) : 'N/A';
        uiElements.analysisSeverityOptions.textContent = severity || 'Unknown';
        
        const scorePercentage = score !== undefined ? Math.min(Math.max(score * 100, 0), 100) : 0;
        uiElements.analysisScoreBarOptions.style.width = scorePercentage + '%';
        uiElements.analysisScoreBarOptions.className = 'score-bar-fill-options'; // Reset
        if (severity) {
            uiElements.analysisScoreBarOptions.classList.add('severity-' + severity.toLowerCase() + '-options');
            uiElements.analysisSeverityOptions.className = 'severity-text-' + severity.toLowerCase() + '-options';
        }


        let detailsHtml = '';
        if (sources && Object.keys(sources).length > 0) {
            detailsHtml += '<ul>';
            for (const sourceName in sources) {
                const sourceData = sources[sourceName];
                let status = 'Not Found';
                let normalizedScore = 'N/A';
                if (sourceData.error) {
                    status = 'Error: ' + sourceData.error;
                } else if (sourceData.found) {
                    status = 'Threat Detected';
                    normalizedScore = sourceData.normalizedScore !== undefined ? sourceData.normalizedScore.toFixed(2) : 'N/A';
                } else if (sourceData.found === false) { // Explicitly false, meaning checked but no threat
                    status = 'No Threat Found';
                    normalizedScore = sourceData.normalizedScore !== undefined ? sourceData.normalizedScore.toFixed(2) : '0.00';
                }
                 detailsHtml += '<li><strong>' + sourceName + ':</strong> ' + status + ' (Score: ' + normalizedScore + ')</li>';
            }
            detailsHtml += '</ul>';
        } else if (message) {
            detailsHtml = '<p><em>' + message + '</em></p>';
        } else {
            detailsHtml = '<p><em>No detailed breakdown available.</em></p>';
        }
        uiElements.analysisDetailsBreakdownOptions.innerHTML = detailsHtml;
    }

    uiElements.analysisTimestampOptions.textContent = timestamp ? new Date(timestamp).toLocaleString() : 'N/A';
    // Clear status message if it was showing "Fetching..."
    if (uiElements.analysisStatusMessageOptions && uiElements.analysisStatusMessageOptions.textContent.startsWith('Fetching analysis')) {
        showOptionsPageStatusMessage('analysisStatusMessageOptions', 'Analysis complete.', false, 3000);
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    debug("(OptionsPage): DOM Content Loaded. Initializing...");

    // Populate uiElements object
    uiElements = {
        debugModeToggle: document.getElementById('debugModeToggle'),
        // Custom Keywords UI
        customKeywordInput: document.getElementById('customKeywordInput'),
        addCustomKeywordBtn: document.getElementById('addCustomKeywordBtn'),
        customKeywordList: document.getElementById('customKeywordList'),
        customKeywordStatus: document.getElementById('customKeywordStatus'),
        // Blacklist UI
        newBlacklistUrlOptions: document.getElementById('newBlacklistUrlOptions'),
        addToBlacklistBtnOptions: document.getElementById('addToBlacklistBtnOptions'),
        blacklistOptionsList: document.getElementById('blacklistOptionsList'),
        blacklistStatusOptions: document.getElementById('blacklistStatusOptions'),
        // Analysis UI
        analysisUrlOptions: document.getElementById('analysis-url-options'),
        analysisScoreOptions: document.getElementById('analysis-score-options'),
        analysisSeverityOptions: document.getElementById('analysis-severity-options'),
        analysisScoreBarOptions: document.getElementById('analysis-score-bar-options'), // This is the container/background
        analysisScoreBarFillOptions: document.getElementById('analysis-score-bar-options'), // Corrected: this should be the fill element if it's separate. The HTML has only one. Let's assume 'analysis-score-bar-options' is the one to style its width.
        analysisDetailsBreakdownOptions: document.getElementById('analysis-details-breakdown-options'),
        analysisTimestampOptions: document.getElementById('analysis-timestamp-options'),
        refreshAnalysisBtnOptions: document.getElementById('refreshAnalysisBtnOptions'),
        analysisStatusMessageOptions: document.getElementById('analysis-status-message-options')
    };
    
    // Error check for crucial UI elements
    for (const key in uiElements) {
        if (!uiElements[key]) {
            error('(OptionsPage): UI element not found for ID: ' + key.replace(/([A-Z])/g, '-$1').toLowerCase()); // Convert camelCase to kebab-case for potential ID
        }
    }


    // --- Debug Mode --- 
    if (uiElements.debugModeToggle) {
        try {
            const data = await chrome.storage.local.get(DEBUG_MODE_KEY);
            uiElements.debugModeToggle.checked = !!data[DEBUG_MODE_KEY];
            log('(OptionsPage): Debug mode initial state loaded: ' + uiElements.debugModeToggle.checked);
        } catch (e) {
            error("(OptionsPage): Error loading debug mode state:", e);
        }
        uiElements.debugModeToggle.addEventListener('change', async () => {
            const newState = uiElements.debugModeToggle.checked;
            try {
                await chrome.storage.local.set({ [DEBUG_MODE_KEY]: newState });
                log('(OptionsPage): Debug mode state saved: ' + newState);
            } catch (e) {
                error("(OptionsPage): Error saving debug mode state:", e);
            }
        });
    } else {
        error("(OptionsPage): Debug mode toggle checkbox not found!");
    }

    // --- Custom Keywords --- 
    if (uiElements.customKeywordInput && uiElements.addCustomKeywordBtn && uiElements.customKeywordList) {
        uiElements.addCustomKeywordBtn.addEventListener('click', async () => {
            const newKeyword = uiElements.customKeywordInput.value;
            if (newKeyword) { // Ensure not empty
                await addCustomKeyword(newKeyword);
                uiElements.customKeywordInput.value = ''; // Clear input
            } else {
                showOptionsPageStatusMessage('customKeywordStatus', 'Keyword cannot be empty.', true);
            }
        });

        uiElements.customKeywordInput.addEventListener('keypress', async (event) => {
            if (event.key === 'Enter') {
                const newKeyword = uiElements.customKeywordInput.value;
                 if (newKeyword) { // Ensure not empty
                    await addCustomKeyword(newKeyword);
                    uiElements.customKeywordInput.value = ''; // Clear input
                } else {
                    showOptionsPageStatusMessage('customKeywordStatus', 'Keyword cannot be empty.', true);
                }
            }
        });
        await loadAndRenderCustomKeywords();
    } else {
        error('(OptionsPage): Crucial custom keyword UI elements not found!');
    }

    // --- Blacklist Management ---
    if (uiElements.newBlacklistUrlOptions && uiElements.addToBlacklistBtnOptions && uiElements.blacklistOptionsList) {
        uiElements.addToBlacklistBtnOptions.addEventListener('click', async () => {
            const newHostname = uiElements.newBlacklistUrlOptions.value;
            if (newHostname) { // Ensure not empty
                await addHostnameToBlacklist(newHostname);
                uiElements.newBlacklistUrlOptions.value = ''; // Clear input
            } else {
                showOptionsPageStatusMessage('blacklistStatusOptions', 'Hostname cannot be empty.', true);
            }
        });
        
        uiElements.newBlacklistUrlOptions.addEventListener('keypress', async (event) => {
            if (event.key === 'Enter') {
                const newHostname = uiElements.newBlacklistUrlOptions.value;
                if (newHostname) { // Ensure not empty
                    await addHostnameToBlacklist(newHostname);
                    uiElements.newBlacklistUrlOptions.value = ''; // Clear input
                } else {
                    showOptionsPageStatusMessage('blacklistStatusOptions', 'Hostname cannot be empty.', true);
                }
            }
        });
        await loadAndRenderBlacklist(); // Load and display initial blacklist
    } else {
        error('(OptionsPage): Crucial blacklist UI elements not found!');
    }

    // --- Current Page Analysis ---
    if (uiElements.refreshAnalysisBtnOptions) {
        uiElements.refreshAnalysisBtnOptions.addEventListener('click', requestThreatAnalysisForActiveTab);
        // Initial analysis request when options page loads
        await requestThreatAnalysisForActiveTab();
    } else {
        error('(OptionsPage): Refresh analysis button not found!');
    }
    
    // Listener for messages from the service worker (e.g., for unsolicited updates or if direct callback fails)
    // This is a more robust way to get updates if the service worker broadcasts threat info
    // or if the initial `sendMessage` callback in `requestThreatAnalysisForActiveTab` doesn't cover all cases.
    // However, for direct request-response, the callback in `requestThreatAnalysisForActiveTab` is usually sufficient.
    // Let's keep it for now in case the service worker is also updated to send 'URL_ANALYSIS_COMPLETE'
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "URL_ANALYSIS_COMPLETE" && message.threatDetails) {
            debug("(OptionsPage) Received URL_ANALYSIS_COMPLETE message:", message.threatDetails);
            displayThreatAnalysisInOptions(message.threatDetails);
            // Acknowledge message if sendResponse is expected. 
            // For this use case, it might not be if this is a broadcast.
            // sendResponse({status: "received"}); 
            return true; // if you intend to use sendResponse asynchronously
        }
        // Handle other messages if necessary
    });


    log("(OptionsPage): Options page initialized successfully.");
}); 