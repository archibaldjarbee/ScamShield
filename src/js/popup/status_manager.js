import { updateStatusDisplay } from './ui_updater.js';

const EXTENSION_STATUS_KEY = 'scamShieldActiveStatus';
let currentStatus = true; // Local cache of the status

export async function loadInitialStatus() {
    try {
        const data = await chrome.storage.local.get(EXTENSION_STATUS_KEY);
        if (data[EXTENSION_STATUS_KEY] === undefined) {
            // If no status is stored, default to true (active) and store it.
            currentStatus = true;
            await chrome.storage.local.set({ [EXTENSION_STATUS_KEY]: currentStatus });
            console.log("Scam Shield: Extension status initialized to active.");
        } else {
            currentStatus = data[EXTENSION_STATUS_KEY];
        }
    } catch (error) {
        console.error("Scam Shield: Error loading extension status:", error);
        currentStatus = true; // Default to active on error
    }
    updateStatusDisplay(currentStatus, currentStatus ? 'Active' : 'Inactive');
    return currentStatus;
}

export function getExtensionStatus() {
    // Returns the cached status. Assumes loadInitialStatus has been called.
    return currentStatus;
}

export async function toggleExtensionStatus() {
    currentStatus = !currentStatus;
    try {
        await chrome.storage.local.set({ [EXTENSION_STATUS_KEY]: currentStatus });
        console.log("Scam Shield: Extension status toggled and saved to:", currentStatus);
        updateStatusDisplay(currentStatus, currentStatus ? 'Active' : 'Inactive');
        
        // Notify the background script about the status change
        chrome.runtime.sendMessage({ type: 'EXTENSION_STATUS_TOGGLED', active: currentStatus }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("Scam Shield: Could not send status toggle message to background:", chrome.runtime.lastError.message);
            } else if (response && response.success) {
                console.log("Scam Shield: Background script acknowledged status change.");
            }
        });

    } catch (error) {
        console.error("Scam Shield: Error saving extension status:", error);
        // Revert optimistic update on error if needed, though UI already updated
        currentStatus = !currentStatus; // Revert local cache
        updateStatusDisplay(currentStatus, currentStatus ? 'Active' : 'Inactive'); // Revert UI
    }
    return currentStatus;
}

// More complex status logic could go here in the future, e.g., timed deactivation, etc. 