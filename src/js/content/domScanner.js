import { log, debug, warn } from '../shared/logger.js';

// Keywords for sensitive information (for hidden field detection)
const SENSITIVE_FIELD_KEYWORDS = ['password', 'ssn', 'creditcard', 'cvv', 'securitycode', 'passphrase', 'secret', 'pin', 'socialsecurity', 'bankaccount'];

// Extremely simplified patterns for linting stability, to be refined later.
const OBFUSCATION_PATTERNS = {
    eval: new RegExp('eval', 'i'),
    functionConstructor: new RegExp('Function', 'i'),
    fromCharCode: new RegExp('fromCharCode', 'i'), 
    longStrings: new RegExp('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'i'),
    excessiveEscapes: new RegExp('x[0-9a-fA-F]{2}x[0-9a-fA-F]{2}x[0-9a-fA-F]{2}x[0-9a-fA-F]{2}x[0-9a-fA-F]{2}', 'g'),
    unescape: new RegExp('unescape', 'i'),
    documentWrite: new RegExp('documentwrite', 'i'), 
    scriptAttributeWithJS: new RegExp('setAttribute[^\\n]*javascript:', 'i')
};
const MIN_HEX_ESCAPES_FOR_SUSPICION = 5; // Adjusted for simplified pattern

class DOMScanner {
    constructor() {
        debug(`(DOMScanner) Initialized.`);
        this.suspiciousElements = [];
        this.activeHighlights = {};
        try {
            this.pageUrl = window.location.href;
        } catch (e) {
            this.pageUrl = 'unknown_page';
            warn(`(DOMScanner) Could not access window.location.href directly on construction:`, e);
        }
    }

    /**
     * Main function to scan the entire page for various DOM-based threats.
     */
    scanPage() {
        debug(`(DOMScanner) Starting full page scan for ${this.pageUrl}...`);
        this.removeAllHighlights(); // Clear previous highlights
        this.suspiciousElements = []; 

        try { this.detectHiddenFormFields(); } catch (e) { warn(`(DOMScanner) Error in detectHiddenFormFields:`, e); }
        try { this.detectPotentiallyObfuscatedJS(); } catch (e) { warn(`(DOMScanner) Error in detectPotentiallyObfuscatedJS:`, e); }
        try { this.detectDeceptiveFormLayoutsAndIframes(); } catch (e) { warn(`(DOMScanner) Error in detectDeceptiveFormLayoutsAndIframes:`, e); }
        
        this.highlightAllSuspiciousElements();

        if (this.suspiciousElements.length > 0) {
            log(`(DOMScanner) Found ${this.suspiciousElements.length} suspicious items on ${this.pageUrl}.`, this.suspiciousElements.map(s => ({ type: s.type, reason: s.reason, tagName: s.element ? s.element.tagName : 'N/A' })));
            // TODO: Send summary to service worker if needed, ensure details are serializable
        }
        debug(`(DOMScanner) Page scan complete for ${this.pageUrl}.`);
    }

    detectHiddenFormFields() {
        const forms = document.querySelectorAll('form');
        forms.forEach((form, formIndex) => {
            const inputs = form.querySelectorAll('input, textarea, select');
            inputs.forEach((input) => {
                const style = window.getComputedStyle(input);
                const isEffectivelyHidden = input.type === 'hidden' ||
                                 style.display === 'none' ||
                                 style.visibility === 'hidden' ||
                                 parseFloat(style.opacity) < 0.01 || // Check for very low opacity
                                 input.offsetHeight === 0 || input.offsetWidth === 0 ||
                                 (parseInt(style.left, 10) < -9000 && style.position === 'absolute') || 
                                 (parseInt(style.top, 10) < -9000 && style.position === 'absolute') ||
                                 (input.getBoundingClientRect().width < 1 && input.getBoundingClientRect().height < 1) ;

                if (isEffectivelyHidden) {
                    const fieldName = input.name || input.id || '';
                    SENSITIVE_FIELD_KEYWORDS.forEach(keyword => {
                        if (fieldName.toLowerCase().includes(keyword.toLowerCase())) {
                            const message = `Potentially sensitive hidden field found: '${fieldName}' in form #${formIndex + 1}.`;
                            warn(`(DOMScanner) ${message}`, input);
                            this.suspiciousElements.push({ element: input, reason: message, type: 'hiddenSensitiveField' });
                        }
                    });
                }
            });
        });
    }

    detectPotentiallyObfuscatedJS() {
        const scripts = document.querySelectorAll('script');
        scripts.forEach((script, scriptIndex) => {
            const scriptContent = script.innerHTML || ''; 
            if (!script.src && scriptContent.trim().length > 10) { // Only analyze non-empty inline scripts
                let suspicionScore = 0;
                let reasons = [];

                if (OBFUSCATION_PATTERNS.eval.test(scriptContent)) { suspicionScore += 0.4; reasons.push('eval()'); }
                if (OBFUSCATION_PATTERNS.functionConstructor.test(scriptContent)) { suspicionScore += 0.3; reasons.push('new Function()'); }
                if (OBFUSCATION_PATTERNS.fromCharCode.test(scriptContent)) { suspicionScore += 0.2; reasons.push('String.fromCharCode'); }
                if (OBFUSCATION_PATTERNS.longStrings.test(scriptContent)) { suspicionScore += 0.3; reasons.push('long quoted strings'); }
                if (OBFUSCATION_PATTERNS.unescape.test(scriptContent)) { suspicionScore += 0.3; reasons.push('unescape()'); }
                if (OBFUSCATION_PATTERNS.documentWrite.test(scriptContent)) { suspicionScore += 0.1; reasons.push('document.write()'); }
                if (OBFUSCATION_PATTERNS.scriptAttributeWithJS.test(scriptContent)) { suspicionScore += 0.3; reasons.push('setAttribute with javascript: URI'); }
                
                if (OBFUSCATION_PATTERNS.excessiveEscapes.test(scriptContent)) { 
                    suspicionScore += 0.4; 
                    reasons.push('many hex escapes'); 
                }

                if (suspicionScore > 0.5) { // Lowered threshold slightly
                    const message = `Potentially obfuscated JS in inline script #${scriptIndex + 1}. Reasons: ${reasons.join(', ')}. Score: ${suspicionScore.toFixed(2)}`;
                    warn(`(DOMScanner) ${message}`, script);
                    this.suspiciousElements.push({ element: script, reason: message, type: 'obfuscatedJS' });
                }
            }
        });

        const sensitiveInputsQuery = 'input[type="text"], input[type="password"], input[type="email"], textarea';
        document.querySelectorAll(sensitiveInputsQuery).forEach(input => {
            ['onkeydown', 'onkeyup', 'onkeypress', 'oninput'].forEach(handler => {
                if (input.hasAttribute(handler)) {
                    const message = `Key event handler '${handler}' on sensitive input '${input.name || input.id || "(no name/id)"}'.`;
                    warn(`(DOMScanner) ${message}`, input);
                    this.suspiciousElements.push({ element: input, reason: message, type: 'inputKeyListener' });
                }
            });
        });
    }
    
    detectDeceptiveFormLayoutsAndIframes() {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach((iframe) => {
            let isSuspiciousIframe = false;
            let iframeReasons = [];
            const rect = iframe.getBoundingClientRect();
            const style = window.getComputedStyle(iframe);

            const opacity = parseFloat(style.opacity);
            if (opacity < 0.05 && opacity > 0) { 
                isSuspiciousIframe = true;
                iframeReasons.push(`Nearly transparent (opacity: ${opacity}).`);
            }
            
            if (opacity < 0.1 && (rect.width > window.innerWidth * 0.8 || rect.height > window.innerHeight * 0.8) && rect.width > 1 && rect.height > 1) {
                 isSuspiciousIframe = true;
                 iframeReasons.push(`Large, nearly transparent iframe.`);
            }
            if (rect.width <= 1 && rect.height <= 1 && style.display !== 'none' && style.visibility !== 'hidden') {
                 iframeReasons.push('Pixel-sized iframe (1x1 or smaller).');
            }

            try {
                const iframeSrc = iframe.src;
                if (iframeSrc && iframeSrc !== 'about:blank') {
                    const iframeUrl = new URL(iframeSrc); // Absolute URLs in src should parse directly
                    const topUrl = new URL(this.pageUrl);
                    if (iframeUrl.hostname !== topUrl.hostname) {
                        iframeReasons.push(`Cross-origin (src: ${iframeUrl.hostname})`);
                    }
                } else if (!iframeSrc || iframeSrc === 'about:blank') {
                     if (iframe.contentDocument && iframe.contentDocument.body && iframe.contentDocument.body.innerHTML.length > 100) {
                         iframeReasons.push('Blank/no-src iframe with embedded content.');
                         if (iframe.contentDocument.querySelector('form')) { 
                            isSuspiciousIframe = true; iframeReasons.push('Contains form(s).');
                         }
                     }
                }
            } catch (e) { iframeReasons.push(`Error parsing iframe src.`); }

            if (isSuspiciousIframe || (iframeReasons.includes('Pixel-sized iframe (1x1 or smaller).') && iframeReasons.length > 1) ){
                const message = `Suspicious iframe. Reasons: ${iframeReasons.join(', ')}`;
                warn(`(DOMScanner) ${message}`, iframe);
                this.suspiciousElements.push({ element: iframe, reason: message, type: 'suspiciousIframe' });
            }
        });

        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            const formAction = form.getAttribute('action');
            if (formAction) {
                try {
                    const actionUrl = new URL(formAction, this.pageUrl); 
                    const topUrl = new URL(this.pageUrl);
                    if (actionUrl.hostname !== topUrl.hostname) {
                        const message = `Form submits cross-origin (${actionUrl.hostname}, current: ${topUrl.hostname}).`;
                        warn(`(DOMScanner) ${message}`, form);
                        this.suspiciousElements.push({ element: form, reason: message, type: 'crossDomainFormAction' });
                    }
                } catch (e) { warn(`(DOMScanner) Could not parse form action URL: '${formAction}'. Error: ${e.message}`); }
            }
        });
    }
    
    highlightElement(element, reason, type) {
        if (!element || typeof element.getBoundingClientRect !== 'function') return;
        if (!document.body || !document.body.contains(element)) return;

        const uniqueId = element.dataset.scamshieldId || Math.random().toString(36).substring(2, 9);
        element.dataset.scamshieldId = uniqueId; // Mark element to avoid re-highlighting same instance if scan runs multiple times
        const highlightId = `scamshield-highlight-${uniqueId}`;

        if (document.getElementById(highlightId)) { // If this specific highlight instance exists, update or skip
            const existingTooltip = document.getElementById(highlightId).querySelector('span');
            if (existingTooltip && !existingTooltip.textContent.includes(reason.substring(0,30))) {
                existingTooltip.textContent += ` | ${reason.substring(0, 100)}${reason.length > 100 ? '...' : ''}`;
            }
            return;
        }

        let div = document.createElement('div');
        div.id = highlightId;
        Object.assign(div.style, {
            position: 'absolute', border: '2px dashed red', borderRadius: '3px',
            padding: '0', margin: '0', pointerEvents: 'none', 
            zIndex: '2147483640', boxSizing: 'border-box'
        });

        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && type !== 'hiddenSensitiveField') return;

        div.style.left = `${rect.left + window.scrollX}px`;
        div.style.top = `${rect.top + window.scrollY}px`;
        div.style.width = `${rect.width || 2}px`; // Min width/height for visibility if element is truly 0x0
        div.style.height = `${rect.height || 2}px`;

        let tooltip = document.createElement('span');
        tooltip.textContent = `ScamShield (${type}): ${reason.substring(0, 100)}${reason.length > 100 ? '...' : ''}`;
        Object.assign(tooltip.style, {
            position: 'absolute', bottom: 'calc(100% + 2px)', left: '0', backgroundColor: 'rgba(200,0,0,0.9)',
            color: 'white', padding: '3px 6px', fontSize: '11px', borderRadius: '3px',
            whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '2147483641'
        });
        
        div.appendChild(tooltip);
        document.body.appendChild(div);
        this.activeHighlights[uniqueId] = {div, element, reason, type};
    }
    
    highlightAllSuspiciousElements() {
        this.suspiciousElements.forEach(item => {
            try {
                if (item.element && (typeof item.element.getBoundingClientRect === 'function')) {
                    this.highlightElement(item.element, item.reason, item.type);
                }
            } catch (e) { warn(`(DOMScanner) Error highlighting element type ${item.type}:`, e, item.element ? item.element.tagName : 'unknown'); }
        });
    }

    removeAllHighlights() {
        for (const id in this.activeHighlights) {
            if (this.activeHighlights[id] && this.activeHighlights[id].div) {
                this.activeHighlights[id].div.remove();
            }
        }
        this.activeHighlights = {};
         // Clean up dataset markers if any were missed (e.g. if element was removed from DOM before highlight removal)
        document.querySelectorAll('[data-scamshield-id]').forEach(el => delete el.dataset.scamshieldId);
    }

    /**
     * Attaches listeners to forms to analyze them before submission.
     */
    analyzeFormsOnSubmit() {
        debug(`(DOMScanner) Attaching form submit listeners...`);
        document.querySelectorAll('form').forEach(form => {
            if (!form._scamShieldSubmitListenerAttached) {
                form.addEventListener('submit', (event) => {
                    if (form.dataset.scamShieldProceed === 'true') {
                        delete form.dataset.scamShieldProceed;
                        return;
                    }

                    let isHighlySuspicious = false;
                    let submissionWarnings = [];
                    const formAction = form.getAttribute('action');
                    const formMethod = form.method ? form.method.toUpperCase() : 'GET';

                    if (formAction) {
                        try {
                            const actionUrl = new URL(formAction, this.pageUrl);
                            const topUrl = new URL(this.pageUrl);
                            if (actionUrl.hostname !== topUrl.hostname) {
                                isHighlySuspicious = true;
                                submissionWarnings.push(`Submits to different domain: ${actionUrl.hostname}`);
                            }
                        } catch (e) { /* ignore */ }
                    }
                    
                    let hasPasswordField = false;
                    const inputs = form.querySelectorAll('input, textarea, select');
                    inputs.forEach(input => {
                        if (input.type === 'password') hasPasswordField = true;
                        const style = window.getComputedStyle(input);
                        const isHidden = input.type === 'hidden' || style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.01 || input.offsetHeight === 0 || input.offsetWidth === 0;
                        if (isHidden) {
                            const fieldName = input.name || input.id || '';
                            SENSITIVE_FIELD_KEYWORDS.forEach(keyword => {
                                if (fieldName.toLowerCase().includes(keyword.toLowerCase())) {
                                    isHighlySuspicious = true;
                                    submissionWarnings.push(`Contains hidden sensitive field: '${fieldName}'`);
                                }
                            });
                        }
                    });

                    if (hasPasswordField && isHighlySuspicious && !submissionWarnings.some(w => w.includes('password'))) {
                         submissionWarnings.push("Contains password(s) AND other suspicious factors.");
                    } 
                    if (hasPasswordField && formMethod === 'GET' && formAction && formAction.toLowerCase().startsWith('http:')){
                        isHighlySuspicious = true;
                        submissionWarnings.push("Password submitted via GET to an insecure HTTP URL.");
                    }

                    if (isHighlySuspicious && submissionWarnings.length > 0) {
                        warn(`(DOMScanner) Highly suspicious form submission. Reasons: ${submissionWarnings.join('; ')}`, form);
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        this.showSubmissionWarningDialog(form, submissionWarnings);
                    } else if (submissionWarnings.length > 0) {
                        // Log less critical warnings without blocking
                        debug(`(DOMScanner) Form has some non-blocking warnings: ${submissionWarnings.join('; ')}`);
                    }
                }, true); 
                form._scamShieldSubmitListenerAttached = true;
            }
        });
    }

    showSubmissionWarningDialog(form, warnings) {
        const existingDialog = document.getElementById('scamshield-submission-dialog');
        if (existingDialog) existingDialog.remove();

        const dialog = document.createElement('div');
        dialog.id = 'scamshield-submission-dialog';
        Object.assign(dialog.style, {
            position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
            backgroundColor: '#fff', border: '1px solid #cc0000', borderRadius: '8px', color: '#333',
            padding: '20px', zIndex: '2147483647', boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
            maxWidth: '500px', width: 'calc(100% - 40px)', textAlign: 'left'
        });

        let htmlContent = 
            `<h3 style="margin-top:0; color:#cc0000; font-family:sans-serif; font-size:16px; border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:15px;">Scam Shield Warning!</h3>
            <p style="font-family:sans-serif; font-size:14px; margin-bottom:10px;">This form may be risky:</p>
            <ul style="margin-bottom:20px; font-family:sans-serif; font-size:13px; padding-left: 20px; list-style-type: disclosure-closed;">`;
        warnings.forEach(w => { htmlContent += `<li style="margin-bottom:8px;">${w.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</li>`; }); // Sanitize warnings
        htmlContent += `</ul>
            <p style="font-family:sans-serif; font-size:14px;"><strong>Do you want to submit it anyway?</strong></p>
            <div style="text-align:right; margin-top:25px;">
                <button id="scamshield-cancel-submission" style="padding:10px 15px; margin-right:10px; background-color:#f0f0f0; border:1px solid #ccc; border-radius:5px; cursor:pointer; font-size:13px; font-weight:bold;">Cancel</button>
                <button id="scamshield-confirm-submission" style="padding:10px 15px; background-color:#d9534f; color:white; border:1px solid #d43f3a; border-radius:5px; cursor:pointer; font-size:13px; font-weight:bold;">Proceed</button>
            </div>`;
        dialog.innerHTML = htmlContent;
        if (document.body) { // Ensure body exists
            document.body.appendChild(dialog);
        } else {
            warn("(DOMScanner) document.body not available when trying to show submission dialog.");
            alert("Scam Shield Warning! Form is suspicious: \n" + warnings.join("\n")); // Fallback alert
            return; // Can't proceed if no body to attach to
        }

        document.getElementById('scamshield-confirm-submission').onclick = () => {
            log("(DOMScanner) User chose to proceed with suspicious form submission.");
            dialog.remove();
            form.dataset.scamShieldProceed = "true";
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                form.submit();
            }
            setTimeout(() => { if(form.dataset) delete form.dataset.scamShieldProceed; }, 100);
        };

        document.getElementById('scamshield-cancel-submission').onclick = () => {
            log("(DOMScanner) User cancelled suspicious form submission.");
            dialog.remove();
            chrome.runtime.sendMessage({ 
                type: "SUSPICIOUS_FORM_SUBMISSION_USER_CANCELLED", 
                details: { url: this.pageUrl, formAction: form.getAttribute('action'), warnings: warnings }
            }).catch(e => debug(`(DOMScanner) Error sending USER_CANCELLED to SW:`, e));
        };
        
        chrome.runtime.sendMessage({ 
            type: "SUSPICIOUS_FORM_SUBMISSION_SHOWED_WARNING", 
            details: { url: this.pageUrl, formAction: form.getAttribute('action'), warnings: warnings }
        }).catch(e => debug(`(DOMScanner) Error sending SHOWED_WARNING to SW:`, e));
    }
}

export default DOMScanner; 