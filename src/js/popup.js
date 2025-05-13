document.addEventListener('DOMContentLoaded', () => {
  const reportButton = document.getElementById('report-button');
  const reportStatus = document.getElementById('report-status');
  const blacklistDisplay = document.getElementById('blacklist-display');

  // Function to render the blacklist
  async function renderBlacklist() {
    const data = await chrome.storage.local.get('scamShieldBlacklist');
    const currentBlacklist = data.scamShieldBlacklist || [];
    
    blacklistDisplay.innerHTML = ''; // Clear existing list

    if (currentBlacklist.length === 0) {
      blacklistDisplay.innerHTML = '<li><i>Blacklist is empty.</i></li>';
      return;
    }

    currentBlacklist.forEach(hostname => {
      const listItem = document.createElement('li');
      listItem.style.display = 'flex';
      listItem.style.justifyContent = 'space-between';
      listItem.style.marginBottom = '3px';

      const textSpan = document.createElement('span');
      textSpan.textContent = hostname;
      textSpan.style.marginRight = '10px';
      textSpan.style.wordBreak = 'break-all'; // Prevent long names overflowing

      const removeButton = document.createElement('button');
      removeButton.textContent = 'Remove';
      removeButton.dataset.hostname = hostname; // Store hostname to identify which to remove
      removeButton.style.padding = '1px 4px';
      removeButton.style.fontSize = '0.8em';
      removeButton.classList.add('remove-button'); // Add class for event delegation

      listItem.appendChild(textSpan);
      listItem.appendChild(removeButton);
      blacklistDisplay.appendChild(listItem);
    });
  }

  // Event listener for reporting a site
  if (reportButton) {
    reportButton.addEventListener('click', async () => {
      reportStatus.textContent = 'Reporting...';
      reportButton.disabled = true;

      try {
        // 1. Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab && tab.url) {
          // 2. Extract hostname from the URL
          const url = new URL(tab.url);
          const hostname = url.hostname;

          if (!hostname) {
             reportStatus.textContent = 'Could not get hostname from tab.';
             reportButton.disabled = false;
             return;
          }

          // 3. Get the current blacklist from storage
          const data = await chrome.storage.local.get('scamShieldBlacklist');
          const currentBlacklist = data.scamShieldBlacklist || [];

          // 4. Add the hostname if it's not already there
          if (!currentBlacklist.includes(hostname)) {
            const updatedBlacklist = [...currentBlacklist, hostname];

            // 5. Save the updated blacklist back to storage
            await chrome.storage.local.set({ scamShieldBlacklist: updatedBlacklist });
            reportStatus.textContent = `Site '${hostname}' reported and added to blacklist.`;
            console.log("Scam Shield: Added to blacklist:", hostname, "New list:", updatedBlacklist);
            renderBlacklist(); // Re-render the list after adding
          } else {
            reportStatus.textContent = `Site '${hostname}' is already in the blacklist.`;
          }

        } else {
          reportStatus.textContent = 'Could not get current tab information.';
        }
      } catch (error) {
        console.error("Scam Shield: Error reporting site:", error);
        reportStatus.textContent = 'Error reporting site. Check console.';
      } finally {
        // Re-enable button after a short delay unless it was already blacklisted
        if (!reportStatus.textContent.includes('already in the blacklist')) {
           setTimeout(() => { reportButton.disabled = false; }, 1500);
        }
      }
    });
  }

  // Event listener for removing a site (using event delegation)
  if (blacklistDisplay) {
    blacklistDisplay.addEventListener('click', async (event) => {
      if (event.target.classList.contains('remove-button')) {
        const hostnameToRemove = event.target.dataset.hostname;
        event.target.disabled = true; // Disable button temporarily
        event.target.textContent = 'Removing...';

        try {
          const data = await chrome.storage.local.get('scamShieldBlacklist');
          const currentBlacklist = data.scamShieldBlacklist || [];
          
          const updatedBlacklist = currentBlacklist.filter(site => site !== hostnameToRemove);

          await chrome.storage.local.set({ scamShieldBlacklist: updatedBlacklist });
          console.log("Scam Shield: Removed from blacklist:", hostnameToRemove, "New list:", updatedBlacklist);
          renderBlacklist(); // Re-render the list immediately
        } catch (error) {
          console.error("Scam Shield: Error removing site:", error);
          event.target.disabled = false; 
          event.target.textContent = 'Remove';
        }
      }
    });
  }

  // Initial rendering of the blacklist when popup opens
  renderBlacklist();
}); 