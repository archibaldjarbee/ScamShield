// Keywords indicating potential scams - **REMOVED, will be fetched from storage**
// const scamKeywords = [ ... ];

async function checkBlacklist() {
  const currentHostname = window.location.hostname;

  chrome.storage.local.get('scamShieldBlacklist', (result) => {
    const blacklist = result.scamShieldBlacklist || []; // Default to empty array if not found
    if (blacklist.includes(currentHostname)) {
      displayWarningBanner();
    }
  });
  // Removed the try/catch block that fetched blacklist.json
}

function displayWarningBanner() {
  const banner = document.createElement('div');
  banner.id = 'scam-shield-warning-banner';
  banner.textContent = '⚠️ Known fraud site—proceed with extreme caution or go back.';
  
  // Basic styles - can be moved to a CSS file later
  banner.style.position = 'fixed';
  banner.style.top = '0';
  banner.style.left = '0';
  banner.style.width = '100%';
  banner.style.backgroundColor = 'red';
  banner.style.color = 'white';
  banner.style.padding = '10px';
  banner.style.textAlign = 'center';
  banner.style.zIndex = '99999999'; // Ensure it's on top
  banner.style.fontSize = '16px';
  banner.style.fontWeight = 'bold';

  document.body.prepend(banner);
}

// --- Keyword-Based Link Scanner --- 

document.addEventListener('click', function(event) {
  const link = event.target.closest('a');

  if (link && link.href) {
    // Fetch keywords from storage before proceeding
    chrome.storage.local.get('scamShieldKeywords', (result) => {
      const scamKeywords = result.scamShieldKeywords || []; // Default to empty array
      
      if (scamKeywords.length === 0) {
        console.log("Scam Shield: No keywords found in storage.");
        return; // Don't proceed if keywords aren't loaded
      }
      
      const href = link.href.toLowerCase();
      const linkText = link.textContent.toLowerCase();
      const combinedText = href + ' ' + linkText;

      const foundKeyword = scamKeywords.find(keyword => combinedText.includes(keyword));

      if (foundKeyword) {
        // Prevent the default navigation immediately
        event.preventDefault();

        // Ask the user for confirmation
        const confirmationMessage = `⚠️ Scam Shield Alert ⚠️\n\nThis link contains the term "${foundKeyword}" which is sometimes used in phishing attempts.\n\nLink: ${link.href}\n\nAre you sure you want to proceed?`;
        
        if (window.confirm(confirmationMessage)) {
          // User confirmed, navigate to the link 
          window.location.href = link.href; 
        } else {
          // User cancelled, do nothing
          console.log('Scam Shield: Navigation cancelled by user.');
        }
      }
    });
  }
}, true); // Use capture phase to intercept the click early

// Run the blacklist check when the content script is loaded
checkBlacklist(); 