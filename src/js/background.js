chrome.runtime.onInstalled.addListener(async () => {
  console.log("Scam Shield: Extension installed/updated.");

  // Initialize blacklist from blacklist.json
  try {
    const response = await fetch(chrome.runtime.getURL('data/blacklist.json')); // Updated path
    if (response.ok) {
      const blacklist = await response.json();
      chrome.storage.local.set({ scamShieldBlacklist: blacklist }, () => {
        console.log("Scam Shield: Initial blacklist loaded from JSON and stored.", blacklist);
      });
    } else {
      console.error("Scam Shield: Could not fetch blacklist.json for initial setup.", response.status);
      chrome.storage.local.set({ scamShieldBlacklist: [] }, () => {
        console.log("Scam Shield: Initialized with an empty blacklist due to fetch error.");
      });
    }
  } catch (error) {
    console.error("Scam Shield: Error fetching or parsing blacklist.json for initial setup:", error);
    chrome.storage.local.set({ scamShieldBlacklist: [] }, () => {
      console.log("Scam Shield: Initialized with an empty blacklist due to error.");
    });
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
    console.log("Scam Shield: Initial scam keywords stored.", initialScamKeywords);
  });
}); 