import { showUserMessage, clearInput, renderBlacklistUI } from './ui_updater.js';

const STORAGE_KEY = 'scamShieldBlacklist';

// Store a reference to newBlacklistUrlInput from ui_updater
let newBlacklistUrlInputElement = null;

export function setBlacklistUrlInputRef(element) {
    newBlacklistUrlInputElement = element;
}

export async function getBlacklist() {
    try {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        return data[STORAGE_KEY] || [];
    } catch (error) {
        console.error("Scam Shield: Error fetching blacklist:", error);
        showUserMessage('Error fetching blacklist.');
        return [];
    }
}

async function saveBlacklist(blacklist) {
    try {
        await chrome.storage.local.set({ [STORAGE_KEY]: blacklist });
    } catch (error) {
        console.error("Scam Shield: Error saving blacklist:", error);
        showUserMessage('Error saving blacklist.');
    }
}

export function parseHostname(urlInput) {
    if (!urlInput || urlInput.trim() === '') {
        return null;
    }
    try {
        const url = new URL(urlInput.startsWith('http') ? urlInput : `http://${urlInput}`);
        return url.hostname;
    } catch (e) {
        console.warn("Scam Shield: Input is not a full URL, treating as hostname:", urlInput);
        // Basic check for common invalid characters in hostnames if not a URL
        if (/[\s\/\:\?\#\[\]\@\!\$\&\'\(\)\*\+\,\;\=]/.test(urlInput)) {
            return null; // Likely not a valid raw hostname either
        }
        return urlInput.trim(); // Assume it's a raw hostname
    }
}

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
        console.log("Scam Shield: Added to blacklist:", hostname);
    } else {
        showUserMessage(`'${hostname}' is already in the blacklist.`);
    }
    if (newBlacklistUrlInputElement) {
        clearInput(newBlacklistUrlInputElement); // Clear the input using the reference
    }
    await refreshBlacklistDisplay();
}

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
    } catch (error) {
        console.error("Scam Shield: Error getting current tab hostname:", error);
        showUserMessage('Error reporting site.');
    }
    return null;
}


export async function removeFromBlacklist(hostnameToRemove) {
    showUserMessage(`Removing '${hostnameToRemove}'...`, 0);
    const currentBlacklist = await getBlacklist();
    const updatedBlacklist = currentBlacklist.filter(site => site !== hostnameToRemove);

    if (currentBlacklist.length !== updatedBlacklist.length) {
        await saveBlacklist(updatedBlacklist);
        console.log("Scam Shield: Removed from blacklist:", hostnameToRemove);
        showUserMessage(`'${hostnameToRemove}' removed from blacklist.`);
    } else {
        showUserMessage(`'${hostnameToRemove}' was not found in the blacklist.`, 3000);
    }
    await refreshBlacklistDisplay(); 
}

// This function now calls the UI function directly
export async function refreshBlacklistDisplay() {
    const currentBlacklist = await getBlacklist();
    renderBlacklistUI(currentBlacklist, removeFromBlacklist); // Pass the remove function directly
} 