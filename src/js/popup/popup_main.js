import { initUI, showUserMessage } from './ui_updater.js';
import { 
    addUrlToBlacklist, 
    reportCurrentTabHostname, 
    refreshBlacklistDisplay,
    setBlacklistUrlInputRef
} from './blacklist_manager.js';
import { loadInitialStatus, toggleExtensionStatus } from './status_manager.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Cache DOM elements
    const elements = {
        reportButton: document.getElementById('report-button'),
        blacklistUl: document.getElementById('blacklist'),
        addToBlacklistBtn: document.getElementById('addToBlacklistBtn'),
        newBlacklistUrlInput: document.getElementById('newBlacklistUrl'),
        statusIndicator: document.getElementById('statusIndicator'),
        statusTextEl: document.getElementById('statusText'),
        reportStatusEl: document.getElementById('report-status')
    };

    // Initialize UI module with DOM elements
    initUI(elements);
    // Pass the input element reference to blacklist_manager
    setBlacklistUrlInputRef(elements.newBlacklistUrlInput);

    // Load initial extension status and update display
    await loadInitialStatus();

    // Load and render the blacklist
    await refreshBlacklistDisplay();

    // Event Listeners
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
            // addUrlToBlacklist or reportCurrentTabHostname will show messages
            setTimeout(() => { elements.reportButton.disabled = false; }, 1500);
        });
    }
    
    // Event listener for the status indicator to toggle status (example)
    if (elements.statusIndicator) {
        elements.statusIndicator.addEventListener('click', async () => {
            await toggleExtensionStatus();
            // Potentially refresh other UI parts if status affects them
        });
        // Make status clickable by adding a cursor style
        elements.statusIndicator.style.cursor = 'pointer';
        elements.statusTextEl.style.cursor = 'pointer'; 
        elements.statusTextEl.addEventListener('click', async () => {
             await toggleExtensionStatus();
        });

    }

    console.log("Scam Shield Popup Initialized");
}); 