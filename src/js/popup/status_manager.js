import { updateStatusDisplay } from './ui_updater.js';
import { log, warn, error, debug } from '../shared/logger.js'; // Import logger

const EXTENSION_STATUS_KEY = 'scamShieldActiveStatus';
let currentStatus = true; // Local cache of the status

/**
 * Loads the initial extension status from chrome.storage.local.
 * If no status is found, defaults to active (true) and stores it.
 * Updates the UI display with the loaded status.
 * @async
 * @returns {Promise<boolean>} The current active status of the extension.
 */
export async function loadInitialStatus() {
    try {
        const data = await chrome.storage.local.get(EXTENSION_STATUS_KEY);
        if (data[EXTENSION_STATUS_KEY] === undefined) {
            // If no status is stored, default to true (active) and store it.
            currentStatus = true;
            await chrome.storage.local.set({ [EXTENSION_STATUS_KEY]: currentStatus });
            log("(Popup/StatusManager): Extension status initialized to active.");
        } else {
            currentStatus = data[EXTENSION_STATUS_KEY];
        }
    } catch (e) { // Error variable changed
        error("(Popup/StatusManager): Error loading extension status:", e);
        currentStatus = true; // Default to active on error
    }
    updateStatusDisplay(currentStatus, currentStatus ? 'Active' : 'Inactive');
    debug("(Popup/StatusManager): Initial status loaded:", currentStatus);
    return currentStatus;
}

/**
 * Gets the locally cached extension status.
 * Assumes loadInitialStatus has been called prior to this.
 * @returns {boolean} The current cached active status of the extension.
 */
export function getExtensionStatus() {
    // Returns the cached status. Assumes loadInitialStatus has been called.
    return currentStatus;
}

/**
 * Toggles the extension's active status (active/inactive).
 * Saves the new status to chrome.storage.local and updates the UI.
 * Sends a message to the background script about the status change.
 * @async
 * @returns {Promise<boolean>} The new active status of the extension.
 */
export async function toggleExtensionStatus() {
    currentStatus = !currentStatus;
    try {
        await chrome.storage.local.set({ [EXTENSION_STATUS_KEY]: currentStatus });
        log("(Popup/StatusManager): Extension status toggled and saved to:", currentStatus);
        updateStatusDisplay(currentStatus, currentStatus ? 'Active' : 'Inactive');
        
        // Notify the background script about the status change
        chrome.runtime.sendMessage({ type: 'EXTENSION_STATUS_TOGGLED', active: currentStatus }, (response) => {
            if (chrome.runtime.lastError) {
                warn("(Popup/StatusManager): Could not send status toggle message to background:", chrome.runtime.lastError.message);
            } else if (response && response.success) {
                debug("(Popup/StatusManager): Background script acknowledged status change.");
            }
        });

    } catch (e) { // Error variable changed
        error("(Popup/StatusManager): Error saving extension status:", e);
        // Revert optimistic update on error if needed, though UI already updated
        currentStatus = !currentStatus; // Revert local cache
        updateStatusDisplay(currentStatus, currentStatus ? 'Active' : 'Inactive'); // Revert UI
    }
    return currentStatus;
}

// More complex status logic could go here in the future, e.g., timed deactivation, etc. 