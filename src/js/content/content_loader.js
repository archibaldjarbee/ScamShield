try {
  import(chrome.runtime.getURL('src/js/content/content_script.js'))
    .then(() => console.log('Scam Shield: Main content script loaded successfully.'))
    .catch(e => console.error('Scam Shield: Error loading main content script:', e));
} catch (e) {
  console.error('Scam Shield: Error in content_loader.js:', e);
} 