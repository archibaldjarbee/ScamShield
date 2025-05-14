import { log, warn, error, debug } from '../shared/logger.js';

const EXTENSION_STATUS_KEY = 'scamShieldActiveStatus';
let isExtensionCurrentlyActive = true; // Local cache in background

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
 * Handles EXTENSION_STATUS_TOGGLED messages to update the background's active status.
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
    }
    // To make it clearer for future message types, ensure to return true only if sendResponse is async.
    // For this synchronous response, returning true is okay but not strictly necessary for this single message type.
    return true; 
});

// Example debug log
debug("(Background): Service worker script loaded and initialized.");

// Example of how the background might use this status
// This is just for demonstration; actual use would be integrated into existing/new background tasks.
// chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
//   if (isExtensionCurrentlyActive && changeInfo.status === 'complete' && tab.url) {
//     console.log("Scam Shield (Background): Extension is active. Would process tab:", tab.url);
//     // Potentially inject content script or perform checks if not done by manifest or if finer control is needed.
//   }
// }); 