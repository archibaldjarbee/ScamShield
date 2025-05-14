import { initUI, showUserMessage } from './ui_updater.js';
import { loadInitialStatus, toggleExtensionStatus } from './status_manager.js';
import { log, debug, error } from '../shared/logger.js';

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
        statusIndicator: document.getElementById('statusIndicator'),
        statusTextEl: document.getElementById('statusText'),
        reportStatusEl: document.getElementById('report-status'),
        openOptionsPageBtn: document.getElementById('openOptionsPageBtn')
    };

    initUI(elements);

    await loadInitialStatus();

    if (elements.reportButton) {
        elements.reportButton.addEventListener('click', async () => {
            elements.reportButton.disabled = true;
            showUserMessage('Reporting site...', elements.reportStatusEl, false);

            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab && tab.url) {
                    const url = new URL(tab.url);
                    const hostnameToReport = url.hostname;
                    log(`(PopupMain) "Report Current Site" clicked for ${hostnameToReport}. This should ideally be handled via options page or a dedicated reporting mechanism.`);
                    showUserMessage(`Site ${hostnameToReport} noted. Manage blacklist in settings.`, elements.reportStatusEl, false, 4000);
                } else {
                    showUserMessage('Could not get current tab URL to report.', elements.reportStatusEl, true);
                }
            } catch (e) {
                error("(PopupMain) Error reporting site:", e);
                showUserMessage('Error reporting site.', elements.reportStatusEl, true);
            }
            setTimeout(() => {
                if (elements.reportButton) elements.reportButton.disabled = false;
            }, 1500);
        });
    }
    
    if (elements.statusIndicator && elements.statusTextEl) {
        const updateStatusAndAnalysis = async () => {
            await toggleExtensionStatus();
        };
        elements.statusIndicator.addEventListener('click', updateStatusAndAnalysis);
        elements.statusIndicator.style.cursor = 'pointer';
        elements.statusTextEl.style.cursor = 'pointer'; 
        elements.statusTextEl.addEventListener('click', updateStatusAndAnalysis);
    }

    if (elements.openOptionsPageBtn) {
        elements.openOptionsPageBtn.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });
    }

    log("Popup Initialized (Simplified)");
}); 