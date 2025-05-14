const LOG_PREFIX = 'Scam Shield:';

/**
 * Logs a standard message to the console.
 * @param {...any} args - Arguments to log.
 */
export function log(...args) {
    console.log(LOG_PREFIX, ...args);
}

/**
 * Logs a warning message to the console.
 * @param {...any} args - Arguments to log as a warning.
 */
export function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
}

/**
 * Logs an error message to the console.
 * @param {...any} args - Arguments to log as an error.
 */
export function error(...args) {
    console.error(LOG_PREFIX, ...args);
}

let _debugMode = false; // Default to false

// Attempt to load debug mode state from storage asynchronously.
// This means that for the very first logs in the lifecycle, _debugMode might be its default (false)
// until this callback completes. This is usually acceptable for a debug flag.
(async () => {
    try {
        const result = await chrome.storage.local.get('scamShieldDebugMode');
        _debugMode = !!result.scamShieldDebugMode;
        if (_debugMode) {
            // Use console.log directly here to avoid potential issues if 'log' itself relies on async setup
            console.log(LOG_PREFIX, 'Debug mode explicitly enabled via storage.');
        }
    } catch (e) {
        console.error(LOG_PREFIX, 'Error reading scamShieldDebugMode from storage:', e);
        // Keep _debugMode as its default (false) if storage read fails
    }
})();

/**
 * Logs a debug message to the console, only if _debugMode is true.
 * @param {...any} args - Arguments to log as a debug message.
 */
export function debug(...args) {
    if (_debugMode) {
        console.debug(LOG_PREFIX, '[DEBUG]', ...args);
    }
}

// Example of how to potentially make DEBUG_MODE configurable via storage:
// (This would require async initialization or a slightly different pattern if used widely at module load)
/*
Previously discussed structure was here.
We have now implemented an async loading mechanism above for _debugMode.
*/ 