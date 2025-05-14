// Keywords indicating potential scams - **REMOVED, will be fetched from storage**
// const scamKeywords = [ ... ];

const EXTENSION_STATUS_KEY = 'scamShieldActiveStatus';
let extensionIsActive = true; // Default to true, will be updated from storage

// Store a reference to the warning UI if it's visible
let currentWarningUI = null;

async function initializeContentScriptStatus() {
    try {
        const data = await chrome.storage.local.get(EXTENSION_STATUS_KEY);
        if (data[EXTENSION_STATUS_KEY] !== undefined) {
            extensionIsActive = data[EXTENSION_STATUS_KEY];
        }
        console.log("Scam Shield (Content Script): Initialized. Active status:", extensionIsActive);
    } catch (error) {
        console.error("Scam Shield (Content Script): Error loading status:", error);
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
        console.log("Scam Shield (Content Script): Listeners active.");
    } else {
        console.log("Scam Shield (Content Script): Extension is inactive. Listeners not attached.");
    }
}

// Call initialization
initializeContentScriptStatus();

async function checkBlacklist() {
  // This function will only be called if extensionIsActive is true
  const currentHostname = window.location.hostname;

  try {
    const data = await chrome.storage.local.get('scamShieldBlacklist');
    const blacklist = data.scamShieldBlacklist || []; 
    if (blacklist.includes(currentHostname)) {
      displayWarningBanner();
    }
  } catch (error) {
    console.error("Scam Shield (Content Script): Error checking blacklist:", error);
  }
}

// NEW: Function to create and display graduated warnings
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
        // For now, just dismisses. Could add a session storage flag to not warn again for this site/session.
        console.log("Scam Shield: User chose to proceed.");
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

// Modify existing displayWarningBanner to use the new system
function displayWarningBanner() {
  // This function will now call displayGraduatedWarning
  // Old banner logic is effectively replaced.
  if (document.getElementById('scam-shield-graduated-warning')) return; // Already showing a new warning

  // Remove old banner if it somehow still exists (defensive)
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
  console.log("Scam Shield (Content Script): Displayed RED graduated warning for blacklisted site.");
}

// --- Keyword-Based Link Scanner and Page Scanner ---

// Function to scan page content for keywords
async function scanPageContentForKeywords() {
    if (!extensionIsActive || currentWarningUI) return; // Don't scan if inactive or warning already shown

    console.log("Scam Shield (Content Script): Scanning page content for keywords.");
    try {
        const data = await chrome.storage.local.get('scamShieldKeywords');
        const scamKeywords = data.scamShieldKeywords || [];
        if (scamKeywords.length === 0) return;

        const bodyText = document.body.innerText.toLowerCase();
        // Simple scan for now, could be made more sophisticated
        // To avoid multiple alerts for same keywords, we can just find the first one.
        const foundKeyword = scamKeywords.find(keyword => bodyText.includes(keyword.toLowerCase()));

        if (foundKeyword) {
            console.log("Scam Shield (Content Script): Keyword '" + foundKeyword + "' found in page content.");
            const title = "Suspicious Content Detected";
            const message = `The page content includes the term "${foundKeyword}", which is sometimes associated with unwanted or deceptive content. Review carefully before interacting.`;
            const recommendations = [
                "Be cautious with any forms or requests for information.",
                "Verify the website's authenticity through other means if unsure.",
                "If this is unexpected, consider navigating away."
            ];
            displayGraduatedWarning('yellow', title, message, recommendations);
            return true; // Indicate a warning was shown
        }
    } catch (error) {
        console.error("Scam Shield (Content Script): Error scanning page content:", error);
    }
    return false; // No warning shown
}

// Modified linkScannerClickListener
async function linkScannerClickListener(event) {
  if (!extensionIsActive || currentWarningUI) return; // Don't scan if inactive or warning already shown

  const link = event.target.closest('a');
  if (link && link.href && !link.href.startsWith('javascript:')) { // Ignore javascript: links
    try {
        const data = await chrome.storage.local.get('scamShieldKeywords');
        const scamKeywords = data.scamShieldKeywords || [];
        if (scamKeywords.length === 0) return;
        
        const href = link.href.toLowerCase();
        const linkText = link.textContent.toLowerCase();
        const combinedText = href + ' ' + linkText;
        const foundKeyword = scamKeywords.find(keyword => combinedText.includes(keyword.toLowerCase()));

        if (foundKeyword) {
            event.preventDefault(); // Prevent navigation only if keyword found
            console.log("Scam Shield (Content Script): Keyword '" + foundKeyword + "' found in link:", link.href);
            const title = "Suspicious Link Detected";
            const message = `This link contains the term "${foundKeyword}" which is sometimes used in phishing or scam attempts. Clicking this link could lead to a malicious website.`;
            const recommendations = [
                "Do not click this link if you don\'t trust the source.",
                "Hover over the link to see the full URL (already done by browser, but good reminder).",
                "If unsure, type the intended website address directly into your browser."
            ];
            // Override Proceed button for links to actually navigate if chosen
            displayGraduatedWarning('yellow', title, message, recommendations);
            
            // Special handling for proceed on link warnings
            if (currentWarningUI) {
                 const proceedButton = currentWarningUI.querySelector('#warning-proceed');
                 if(proceedButton) {
                    const newProceedButton = proceedButton.cloneNode(true);
                    proceedButton.parentNode.replaceChild(newProceedButton, proceedButton);
                    newProceedButton.addEventListener('click', () => {
                        console.log("Scam Shield: User chose to proceed with link:", link.href);
                        if(currentWarningUI) currentWarningUI.remove();
                        currentWarningUI = null;
                        window.location.href = link.href; // Navigate
                    });
                 }
            }
        }
    } catch (error) {
        console.error("Scam Shield (Content Script): Error in link scanner:", error);
    }
  }
}

// --- Level 2 Risk Factor Detection ---

function analyzeUrlForRisk(url) {
    const riskFactors = [];
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;

        // Check for IP address as hostname
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
            riskFactors.push("URL uses an IP address instead of a domain name.");
        }

        // Check for excessive subdomains
        const subdomainParts = hostname.split('.');
        // Heuristic: if not an IP, and more than 4 parts (e.g., a.b.c.d.com -> 5 parts, d.com -> 2 parts)
        if (subdomainParts.length > 4 && !riskFactors.some(r => r.includes("IP address"))) {
            riskFactors.push("URL has an unusually high number of subdomains.");
        }

        // Check for excessive hyphens in the hostname
        if ((hostname.match(/-/g) || []).length > 3) {
            riskFactors.push("URL contains multiple hyphens, sometimes used for obfuscation.");
        }
        
        // Potential future checks:
        // - Punycode detection (parsedUrl.hostname will be the decoded version)
        // - Very long hostname
        // - Keywords in domain itself (e.g., 'login', 'secure', 'bank' combined with others)

    } catch (e) {
        console.warn("Scam Shield (Content Script): Could not parse URL for risk analysis:", url, e);
    }
    return riskFactors;
}

// This will be called by initializeContentScriptStatus
async function checkForLevel2Warnings() {
    if (!extensionIsActive || currentWarningUI) return false; // Skip if inactive or warning shown

    let detectedKeywordsOnPage = new Set();
    let urlRiskFactors = analyzeUrlForRisk(window.location.href);

    // Gather keywords from page content
    try {
        const data = await chrome.storage.local.get('scamShieldKeywords');
        const scamKeywords = data.scamShieldKeywords || [];
        if (scamKeywords.length > 0) {
            const bodyText = document.body.innerText.toLowerCase();
            scamKeywords.forEach(keyword => {
                if (bodyText.includes(keyword.toLowerCase())) {
                    detectedKeywordsOnPage.add(keyword);
                }
            });
        }
    } catch (error) {
        console.error("Scam Shield (Content Script): Error gathering keywords for L2 check:", error);
    }

    const multipleKeywordsFactor = detectedKeywordsOnPage.size > 2;
    let l2Reasons = [];

    if (multipleKeywordsFactor) {
        l2Reasons.push(`Multiple suspicious keywords found on page (${Array.from(detectedKeywordsOnPage).slice(0,3).join(', ')}${detectedKeywordsOnPage.size > 3 ? '...' : ''}).`);
    }
    urlRiskFactors.forEach(factor => l2Reasons.push(factor));

    // Trigger L2 warning if at least one URL risk factor AND one keyword, OR multiple keywords AND some URL factor, OR 2+ URL factors
    // Simplified: if total combined reasons > 1 (e.g. 1 URL risk + 1 keyword group, or 2 URL risks)
    if (l2Reasons.length > 1) { 
        console.log("Scam Shield (Content Script): Level 2 risk factors detected:", l2Reasons);
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
        return true; // L2 Warning shown
    }
    return false; // No L2 warning shown
}

// Listener for storage changes to dynamically enable/disable if needed
chrome.storage.onChanged.addListener(async (changes, namespace) => { // made async
    if (namespace === 'local' && changes[EXTENSION_STATUS_KEY]) {
        const newStatus = changes[EXTENSION_STATUS_KEY].newValue;
        console.log("Scam Shield (Content Script): Detected status change to:", newStatus);
        
        const oldStatus = extensionIsActive;
        extensionIsActive = newStatus;

        if (newStatus === false && oldStatus === true) {
            document.removeEventListener('click', linkScannerClickListener, true);
            if (currentWarningUI) {
                currentWarningUI.remove();
                currentWarningUI = null;
            }
            // Remove old red banner if present (though it should be replaced by new UI)
            const oldBanner = document.getElementById('scam-shield-warning-banner');
            if (oldBanner) oldBanner.remove();
            console.log("Scam Shield (Content Script): Deactivated features due to status change.");
        } else if (newStatus === true && oldStatus === false) {
            // Re-initialize logic, which includes checks and attaching listeners if no warning is up
            await initializeContentScriptStatus(); 
            console.log("Scam Shield (Content Script): Re-activated features due to status change.");
        }
    }
}); 