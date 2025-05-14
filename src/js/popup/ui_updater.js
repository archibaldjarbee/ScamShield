// This is a placeholder to ensure the directory is created.
// We will populate this with refactored code later. 

// Elements
let blacklistUl = null;
let statusIndicator = null;
let statusTextEl = null;
let reportStatusEl = null;
let newBlacklistUrlInput = null;

export function initUI(elements) {
    blacklistUl = elements.blacklistUl;
    statusIndicator = elements.statusIndicator;
    statusTextEl = elements.statusTextEl;
    reportStatusEl = elements.reportStatusEl;
    newBlacklistUrlInput = elements.newBlacklistUrlInput;
}

export function updateStatusDisplay(isActive = true, message = 'Active') {
    if (!statusIndicator || !statusTextEl) return;

    if (isActive) {
        statusIndicator.classList.remove('inactive');
    } else {
        statusIndicator.classList.add('inactive');
    }
    statusTextEl.textContent = message;
}

export function renderBlacklistUI(currentBlacklist, removeCallback) {
    if (!blacklistUl) return;

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
            await removeCallback(hostname); 
            // No need to re-enable here, renderBlacklist will redraw or error handled by callback
        });

        listItem.appendChild(textSpan);
        listItem.appendChild(removeButton);
        blacklistUl.appendChild(listItem);
    });
}

export function showUserMessage(message, duration = 3000) {
    if (!reportStatusEl) return;
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

export function clearInput(inputElement) {
    if (inputElement) {
        inputElement.value = '';
    }
} 