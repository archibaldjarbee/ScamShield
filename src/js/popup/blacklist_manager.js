import { showUserMessage, clearInput, renderBlacklistUI } from './ui_updater.js';
import { log, warn, error, debug } from '../shared/logger.js'; // Import logger

const STORAGE_KEY = 'scamShieldBlacklist';

// Store a reference to newBlacklistUrlInput from ui_updater
let newBlacklistUrlInputElement = null;

/**
 * Sets a reference to the blacklist URL input element.
 * Used to clear the input field after adding a URL.
 * @param {HTMLInputElement} element - The input element for new blacklist URLs.
 */
export function setBlacklistUrlInputRef(element) {
    newBlacklistUrlInputElement = element;
}

/**
 * Retrieves the current blacklist from chrome.storage.local.
 * @async
 * @returns {Promise<string[]>} A promise that resolves to an array of blacklisted hostnames.
 */
export async function getBlacklist() {
    try {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        debug("(Popup/BlacklistManager): Blacklist fetched:", data[STORAGE_KEY] || []);
        return data[STORAGE_KEY] || [];
    } catch (e) {
        error("(Popup/BlacklistManager): Error fetching blacklist:", e);
        showUserMessage('Error fetching blacklist.');
        return [];
    }
}

/**
 * Saves the given blacklist to chrome.storage.local.
 * @async
 * @param {string[]} blacklist - The array of hostnames to save.
 */
async function saveBlacklist(blacklist) {
    try {
        await chrome.storage.local.set({ [STORAGE_KEY]: blacklist });
        debug("(Popup/BlacklistManager): Blacklist saved.", blacklist);
    } catch (e) {
        error("(Popup/BlacklistManager): Error saving blacklist:", e);
        showUserMessage('Error saving blacklist.');
    }
}

/**
 * Parses a URL input string and extracts the hostname.
 * Handles inputs with or without http(s):// prefix.
 * @param {string} urlInput - The URL or hostname string to parse.
 * @returns {string|null} The extracted hostname, or null if parsing fails or input is invalid.
 */
export function parseHostname(urlInput) {
    if (!urlInput || urlInput.trim() === '') {
        return null;
    }
    try {
        const url = new URL(urlInput.startsWith('http') ? urlInput : `http://${urlInput}`);
        return url.hostname;
    } catch (e) {
        warn("(Popup/BlacklistManager): Input is not a full URL, treating as hostname:", urlInput);
        if (/[\s\/\:\?\#\[\]\@\!\$\&\'\(\)\*\+\,\;\=]/.test(urlInput)) {
            return null; 
        }
        return urlInput.trim(); 
    }
}

/**
 * Adds a given URL (after parsing its hostname) to the blacklist.
 * Updates storage and refreshes the UI.
 * @async
 * @param {string} urlToAdd - The URL or hostname string to add.
 */
export async function addUrlToBlacklist(urlToAdd) {
    const hostname = parseHostname(urlToAdd);

    if (!hostname) {
        showUserMessage('Invalid URL or hostname provided.');
        return;
    }

    showUserMessage(`Adding '${hostname}'...`, 0); // Message without timeout
    const currentBlacklist = await getBlacklist();

    if (!currentBlacklist.includes(hostname)) {
        const updatedBlacklist = [...currentBlacklist, hostname];
        await saveBlacklist(updatedBlacklist);
        showUserMessage(`'${hostname}' added to blacklist.`);
        log("(Popup/BlacklistManager): Added to blacklist:", hostname);
    } else {
        showUserMessage(`'${hostname}' is already in the blacklist.`);
    }
    if (newBlacklistUrlInputElement) {
        clearInput(newBlacklistUrlInputElement); // Clear the input using the reference
    }
    await refreshBlacklistDisplay();
}

/**
 * Gets the hostname of the current active tab.
 * @async
 * @returns {Promise<string|null>} A promise that resolves to the hostname, or null if an error occurs.
 */
export async function reportCurrentTabHostname() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
            const url = new URL(tab.url);
            if (url.hostname) {
                return url.hostname;
            } else {
                showUserMessage('Could not get hostname from current tab.');
            }
        } else {
            showUserMessage('Could not get current tab information.');
        }
    } catch (e) {
        error("(Popup/BlacklistManager): Error getting current tab hostname:", e);
        showUserMessage('Error reporting site.');
    }
    return null;
}

/**
 * Removes a hostname from the blacklist.
 * Updates storage and refreshes the UI.
 * @async
 * @param {string} hostnameToRemove - The hostname to remove from the blacklist.
 */
export async function removeFromBlacklist(hostnameToRemove) {
    showUserMessage(`Removing '${hostnameToRemove}'...`, 0);
    const currentBlacklist = await getBlacklist();
    const updatedBlacklist = currentBlacklist.filter(site => site !== hostnameToRemove);

    if (currentBlacklist.length !== updatedBlacklist.length) {
        await saveBlacklist(updatedBlacklist);
        log("(Popup/BlacklistManager): Removed from blacklist:", hostnameToRemove);
        showUserMessage(`'${hostnameToRemove}' removed from blacklist.`);
    } else {
        showUserMessage(`'${hostnameToRemove}' was not found in the blacklist.`, 3000);
    }
    await refreshBlacklistDisplay(); 
}

/**
 * Refreshes the displayed blacklist in the UI by fetching the latest list and re-rendering it.
 * @async
 */
export async function refreshBlacklistDisplay() {
    const currentBlacklist = await getBlacklist();
    renderBlacklistUI(currentBlacklist, removeFromBlacklist); // Pass the remove function directly
} 