import { log, warn, error, debug } from '../shared/logger.js'; // Added for potential future use

// This is a placeholder to ensure the directory is created.
// We will populate this with refactored code later. 

// Elements
let blacklistUl = null;
let statusIndicator = null;
let statusTextEl = null;
let reportStatusEl = null;
let newBlacklistUrlInput = null;

/**
 * Initializes UI module with references to DOM elements from the popup.
 * @param {object} elements - An object containing DOM element references.
 * @param {HTMLElement} elements.blacklistUl - The UL element for the blacklist.
 * @param {HTMLElement} elements.statusIndicator - The div element for status indicator.
 * @param {HTMLElement} elements.statusTextEl - The span element for status text.
 * @param {HTMLElement} elements.reportStatusEl - The div element for user messages.
 * @param {HTMLInputElement} elements.newBlacklistUrlInput - The input field for new blacklist URLs.
 */
export function initUI(elements) {
    blacklistUl = elements.blacklistUl;
    statusIndicator = elements.statusIndicator;
    statusTextEl = elements.statusTextEl;
    reportStatusEl = elements.reportStatusEl;
    newBlacklistUrlInput = elements.newBlacklistUrlInput;
    debug("(Popup/UIUpdater): UI elements initialized.");
}

/**
 * Updates the visual status indicator and text in the popup.
 * @param {boolean} [isActive=true] - Whether the extension is currently active.
 * @param {string} [message='Active'] - The status message to display.
 */
export function updateStatusDisplay(isActive = true, message = 'Active') {
    if (!statusIndicator || !statusTextEl) {
        warn("(Popup/UIUpdater): Status display elements not initialized.");
        return;
    }

    if (isActive) {
        statusIndicator.classList.remove('inactive');
    } else {
        statusIndicator.classList.add('inactive');
    }
    statusTextEl.textContent = message;
}

/**
 * Renders the list of blacklisted hostnames in the popup UI.
 * @param {string[]} currentBlacklist - Array of blacklisted hostname strings.
 * @param {function} removeCallback - Async function to call when a remove button is clicked. 
 *                                    It receives the hostname to remove as an argument.
 */
export function renderBlacklistUI(currentBlacklist, removeCallback) {
    if (!blacklistUl) {
        warn("(Popup/UIUpdater): Blacklist UL element not initialized.");
        return;
    }

    blacklistUl.innerHTML = ''; // Clear existing list

    if (currentBlacklist.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.textContent = 'Blacklist is empty.';
        emptyLi.style.fontStyle = 'italic';
        emptyLi.style.textAlign = 'center';
        blacklistUl.appendChild(emptyLi);
        return;
    }

    currentBlacklist.forEach(hostname => {
        const listItem = document.createElement('li');
        
        const textSpan = document.createElement('span');
        textSpan.textContent = hostname;
        textSpan.style.wordBreak = 'break-all';

        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.dataset.hostname = hostname;
        removeButton.classList.add('remove-btn');
        removeButton.addEventListener('click', async (event) => {
            event.target.disabled = true;
            event.target.textContent = 'Removing...';
            try {
                await removeCallback(hostname); 
            } catch (e) {
                error("(Popup/UIUpdater): Error in removeCallback for", hostname, e);
                showUserMessage(`Error removing ${hostname}.`, 3000);
                // Re-enable button if it wasn't re-rendered by a successful callback
                if(event.target) { // Check if target still exists
                    event.target.disabled = false;
                    event.target.textContent = 'Remove';
                }
            }
        });

        listItem.appendChild(textSpan);
        listItem.appendChild(removeButton);
        blacklistUl.appendChild(listItem);
    });
}

/**
 * Displays a message to the user in the report status area of the popup.
 * Applies an animation class for the message.
 * @param {string} message - The message to display.
 * @param {number} [duration=3000] - How long the message should be visible in ms. 
 *                                   If 0 or less, message persists until cleared otherwise, but animation class is still removed.
 */
export function showUserMessage(message, duration = 3000) {
    if (!reportStatusEl) {
        warn("(Popup/UIUpdater): Report status element not initialized.");
        return;
    }
    reportStatusEl.textContent = message;
    reportStatusEl.classList.add('show-message');

    const animationDuration = 500;

    if (duration > 0) {
        setTimeout(() => {
            reportStatusEl.textContent = '';
            reportStatusEl.classList.remove('show-message');
        }, duration);
    } else {
        setTimeout(() => {
            reportStatusEl.classList.remove('show-message');
        }, animationDuration);
    }
}

/**
 * Clears the value of a given input element.
 * @param {HTMLInputElement} inputElement - The input element to clear.
 */
export function clearInput(inputElement) {
    if (inputElement && typeof inputElement.value !== 'undefined') {
        inputElement.value = '';
    } else {
        warn("(Popup/UIUpdater): Attempted to clear invalid input element.", inputElement);
    }
} 