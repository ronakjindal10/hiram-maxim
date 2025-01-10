// Debug flag
const DEBUG = true;

/**
 * Logs debug messages if DEBUG is enabled.
 * @param  {...any} args - Messages or data to log.
 */
function debugLog(...args) {
  if (DEBUG) {
    console.log('[Bulk Operations Helper - Content]', ...args);
  }
}

/**
 * Handles messages from the interceptor script.
 * @param {MessageEvent} event - The message event.
 */
function handleMessage(event) {
  if (event.source !== window || !event.data.type) return;

  if (event.data.type === 'LOCATIONS_DATA') {
    const locationIds = event.data.locations;
    const headers = event.data.headers;
    debugLog('Captured Location IDs:', locationIds);
    debugLog('Captured Headers:', headers);

    // Store the location IDs and headers using chrome.storage
    chrome.storage.local.set({ locationIds, headers }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error storing data:', chrome.runtime.lastError);
      } else {
        debugLog('Location IDs and headers stored successfully.');
      }
    });
  }
}

/**
 * Requests the background script to inject the interceptor script.
 */
function requestInterceptorInjection() {
  chrome.runtime.sendMessage({ action: 'injectInterceptor' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending message to background:', chrome.runtime.lastError);
    } else {
      debugLog('Interceptor injection response:', response.status);
    }
  });
}

/**
 * Initializes the content script by requesting script injection and setting up message listeners.
 */
function initialize() {
  debugLog('Initializing content script...');
  requestInterceptorInjection();
  window.addEventListener('message', handleMessage);
}

// Initialize the content script when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}