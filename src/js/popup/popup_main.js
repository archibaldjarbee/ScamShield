import { initUI, showUserMessage } from './ui_updater.js';
import { 
    addUrlToBlacklist, 
    reportCurrentTabHostname, 
    refreshBlacklistDisplay,
    setBlacklistUrlInputRef
} from './blacklist_manager.js';
import { loadInitialStatus, toggleExtensionStatus } from './status_manager.js';
import { log, debug } from '../shared/logger.js';

/**
 * Main entry point for the popup script.
 * Initializes UI elements, loads initial status and blacklist,
 * and sets up event listeners for user interactions.
 * @listens DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', async () => {
    debug("(PopupMain): DOM Content Loaded.");

    const elements = {
        reportButton: document.getElementById('report-button'),
        blacklistUl: document.getElementById('blacklist'),
        addToBlacklistBtn: document.getElementById('addToBlacklistBtn'),
        newBlacklistUrlInput: document.getElementById('newBlacklistUrl'),
        statusIndicator: document.getElementById('statusIndicator'),
        statusTextEl: document.getElementById('statusText'),
        reportStatusEl: document.getElementById('report-status')
    };

    initUI(elements);
    setBlacklistUrlInputRef(elements.newBlacklistUrlInput);

    await loadInitialStatus();
    await refreshBlacklistDisplay();

    if (elements.addToBlacklistBtn && elements.newBlacklistUrlInput) {
        elements.addToBlacklistBtn.addEventListener('click', async () => {
            const urlToAdd = elements.newBlacklistUrlInput.value.trim();
            if (urlToAdd) {
                await addUrlToBlacklist(urlToAdd);
            } else {
                showUserMessage('Please enter a URL to blacklist.');
            }
        });

        elements.newBlacklistUrlInput.addEventListener('keypress', async (event) => {
            if (event.key === 'Enter') {
                const urlToAdd = elements.newBlacklistUrlInput.value.trim();
                if (urlToAdd) {
                    await addUrlToBlacklist(urlToAdd);
                } else {
                    showUserMessage('Please enter a URL to blacklist.');
                }
            }
        });
    }

    if (elements.reportButton) {
        elements.reportButton.addEventListener('click', async () => {
            elements.reportButton.disabled = true;
            const hostnameToReport = await reportCurrentTabHostname();
            if (hostnameToReport) {
                await addUrlToBlacklist(hostnameToReport);
            }
            setTimeout(() => { 
                if (elements.reportButton) elements.reportButton.disabled = false; 
            }, 1500);
        });
    }
    
    if (elements.statusIndicator && elements.statusTextEl) {
        elements.statusIndicator.addEventListener('click', async () => {
            await toggleExtensionStatus();
        });
        elements.statusIndicator.style.cursor = 'pointer';
        elements.statusTextEl.style.cursor = 'pointer'; 
        elements.statusTextEl.addEventListener('click', async () => {
             await toggleExtensionStatus();
        });
    }

    log("Popup Initialized");
}); 