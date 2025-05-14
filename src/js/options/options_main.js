import { log, debug, error } from '../shared/logger.js';

const DEBUG_MODE_KEY = 'scamShieldDebugMode';
const CUSTOM_KEYWORDS_KEY = 'scamShieldCustomKeywords';

/**
 * Displays a status message to the user on the options page.
 * @param {string} message - The message to display.
 * @param {boolean} [isError=false] - True if the message is an error, false otherwise.
 * @param {number} [duration=3000] - How long the message should be visible (ms). 0 for persistent.
 */
function showOptionsStatusMessage(message, isError = false, duration = 3000) {
    const statusElement = document.getElementById('customKeywordStatus');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = 'status-message'; // Reset classes
        if (isError) {
            statusElement.classList.add('error');
        }
        if (duration > 0) {
            setTimeout(() => {
                statusElement.textContent = '';
                statusElement.classList.remove('error');
            }, duration);
        }
    }
}

/**
 * Renders the list of custom keywords in the UI.
 * @param {string[]} keywords - Array of custom keywords.
 */
function renderCustomKeywordList(keywords) {
    const listElement = document.getElementById('customKeywordList');
    if (!listElement) return;

    listElement.innerHTML = ''; // Clear existing list
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
        showOptionsStatusMessage('Error loading custom keywords.', true);
    }
}

/**
 * Adds a new custom keyword to storage and updates the UI.
 * @param {string} keyword - The keyword to add.
 */
async function addCustomKeyword(keyword) {
    const cleanKeyword = keyword.trim().toLowerCase();
    if (!cleanKeyword) {
        showOptionsStatusMessage('Keyword cannot be empty.', true);
        return;
    }

    try {
        const data = await chrome.storage.local.get(CUSTOM_KEYWORDS_KEY);
        let keywords = data[CUSTOM_KEYWORDS_KEY] || [];
        if (keywords.includes(cleanKeyword)) {
            showOptionsStatusMessage(`Keyword '${cleanKeyword}' already exists.`, false, 4000);
            return;
        }
        keywords.push(cleanKeyword);
        await chrome.storage.local.set({ [CUSTOM_KEYWORDS_KEY]: keywords });
        log(`(OptionsPage): Custom keyword added: ${cleanKeyword}`);
        showOptionsStatusMessage(`Keyword '${cleanKeyword}' added successfully.`);
        await loadAndRenderCustomKeywords(); // Refresh list
    } catch (e) {
        error('(OptionsPage): Error adding custom keyword:', e);
        showOptionsStatusMessage('Error adding keyword.', true);
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
            log(`(OptionsPage): Custom keyword removed: ${keywordToRemove}`);
            showOptionsStatusMessage(`Keyword '${keywordToRemove}' removed.`);
            await loadAndRenderCustomKeywords(); // Refresh list
        } else {
            showOptionsStatusMessage(`Keyword '${keywordToRemove}' not found.`, true);
        }
    } catch (e) {
        error('(OptionsPage): Error removing custom keyword:', e);
        showOptionsStatusMessage('Error removing keyword.', true);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    debug("(OptionsPage): DOM Content Loaded.");

    const debugModeToggle = document.getElementById('debugModeToggle');
    const customKeywordInput = document.getElementById('customKeywordInput');
    const addCustomKeywordBtn = document.getElementById('addCustomKeywordBtn');

    // --- Debug Mode --- 
    if (!debugModeToggle) {
        error("(OptionsPage): Debug mode toggle checkbox not found!");
    } else {
        try {
            const data = await chrome.storage.local.get(DEBUG_MODE_KEY);
            debugModeToggle.checked = !!data[DEBUG_MODE_KEY];
            log(`(OptionsPage): Debug mode initial state loaded: ${debugModeToggle.checked}`);
        } catch (e) {
            error("(OptionsPage): Error loading debug mode state:", e);
        }
        debugModeToggle.addEventListener('change', async () => {
            const newState = debugModeToggle.checked;
            try {
                await chrome.storage.local.set({ [DEBUG_MODE_KEY]: newState });
                log(`(OptionsPage): Debug mode state saved: ${newState}`);
            } catch (e) {
                error("(OptionsPage): Error saving debug mode state:", e);
            }
        });
    }

    // --- Custom Keywords --- 
    if (!customKeywordInput || !addCustomKeywordBtn) {
        error('(OptionsPage): Custom keyword UI elements not found!');
    } else {
        addCustomKeywordBtn.addEventListener('click', async () => {
            const newKeyword = customKeywordInput.value;
            await addCustomKeyword(newKeyword);
            customKeywordInput.value = ''; // Clear input
        });

        customKeywordInput.addEventListener('keypress', async (event) => {
            if (event.key === 'Enter') {
                const newKeyword = customKeywordInput.value;
                await addCustomKeyword(newKeyword);
                customKeywordInput.value = ''; // Clear input
            }
        });
        await loadAndRenderCustomKeywords(); // Load and display initial keywords
    }

    log("(OptionsPage): Options page initialized.");
}); 