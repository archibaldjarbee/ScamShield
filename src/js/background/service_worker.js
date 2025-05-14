const EXTENSION_STATUS_KEY = 'scamShieldActiveStatus';
let isExtensionCurrentlyActive = true; // Local cache in background

// Function to get initial status and set up listener
async function initializeBackgroundStatus() {
    try {
        const data = await chrome.storage.local.get(EXTENSION_STATUS_KEY);
        if (data[EXTENSION_STATUS_KEY] === undefined) {
            isExtensionCurrentlyActive = true; // Default to active
            await chrome.storage.local.set({ [EXTENSION_STATUS_KEY]: isExtensionCurrentlyActive });
            console.log("Scam Shield (Background): Status initialized to active.");
        } else {
            isExtensionCurrentlyActive = data[EXTENSION_STATUS_KEY];
            console.log("Scam Shield (Background): Loaded status:", isExtensionCurrentlyActive);
        }
    } catch (error) {
        console.error("Scam Shield (Background): Error loading status:", error);
        isExtensionCurrentlyActive = true; // Default to active on error
    }
}

// Call initialization on startup
initializeBackgroundStatus();

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("Scam Shield: Extension installed/updated. Reason:", details.reason);

  // Ensure status is initialized on first install or update if not present
  await initializeBackgroundStatus(); 

  // Initialize blacklist from blacklist.json
  try {
    const response = await fetch(chrome.runtime.getURL('data/blacklist.json')); 
    if (response.ok) {
      const blacklist = await response.json();
      chrome.storage.local.set({ scamShieldBlacklist: blacklist }, () => {
        console.log("Scam Shield: Initial blacklist loaded/reloaded from JSON and stored.", blacklist);
      });
    } else {
      console.error("Scam Shield: Could not fetch blacklist.json for initial setup.", response.status);
      // Only set to empty if it wasn't already populated, to avoid overwriting user additions on simple update
      const currentData = await chrome.storage.local.get('scamShieldBlacklist');
      if (!currentData.scamShieldBlacklist) {
        chrome.storage.local.set({ scamShieldBlacklist: [] }, () => {
            console.log("Scam Shield: Initialized with an empty blacklist due to fetch error.");
        });
      }
    }
  } catch (error) {
    console.error("Scam Shield: Error fetching or parsing blacklist.json for initial setup:", error);
    const currentData = await chrome.storage.local.get('scamShieldBlacklist');
      if (!currentData.scamShieldBlacklist) {
        chrome.storage.local.set({ scamShieldBlacklist: [] }, () => {
            console.log("Scam Shield: Initialized with an empty blacklist due to error.");
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
  // Set keywords (this will overwrite if they change in an update, which is often desired)
  chrome.storage.local.set({ scamShieldKeywords: initialScamKeywords }, () => {
    console.log("Scam Shield: Initial scam keywords stored/updated.", initialScamKeywords);
  });
}); 

// Listen for messages from the popup (or other extension parts)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTENSION_STATUS_TOGGLED') {
        isExtensionCurrentlyActive = message.active;
        console.log("Scam Shield (Background): Received status update. Now:", isExtensionCurrentlyActive);
        // Here you would add logic that the background script needs to run based on active status
        // For example, if inactive, it might unregister content scripts or stop monitoring certain things.
        sendResponse({ success: true, message: "Status received by background" });
    }
    return true; // Keep the message channel open for asynchronous sendResponse if needed elsewhere
});

// Example of how the background might use this status
// This is just for demonstration; actual use would be integrated into existing/new background tasks.
// chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
//   if (isExtensionCurrentlyActive && changeInfo.status === 'complete' && tab.url) {
//     console.log("Scam Shield (Background): Extension is active. Would process tab:", tab.url);
//     // Potentially inject content script or perform checks if not done by manifest or if finer control is needed.
//   }
// }); 