// Debug flag
const DEBUG = true;

// Constants
const TARGET_URL = 'backend.leadconnectorhq.com/locations/search';
const DEBUGGER_VERSION = '1.2';

// Track attached debuggers
const attachedTabs = new Set();

// Track requests
const pendingRequests = new Map();

// Track intercepted data
let interceptedData = {
  headers: {},
  locationIds: [],
  featurePattern: null
};

/**
 * Debug logging utility
 * @param {...any} args - Items to log
 */
function debugLog(...args) {
  if (DEBUG) {
    console.log('[Bulk Operations Helper - Background]', ...args);
  }
}

/**
 * Stores captured data in chrome.storage
 * @param {Object} data - Data to store
 */
async function storeData(data) {
  try {
    await chrome.storage.local.set(data);
    debugLog('Data stored successfully:', data);
  } catch (error) {
    console.error('Error storing data:', error);
  }
}

/**
 * Gets header value case-insensitively
 * @param {Object} headers - Headers object
 * @param {string} headerName - Name of header to find
 * @returns {string|undefined} Header value
 */
function getHeaderCaseInsensitive(headers, headerName) {
  const headerKey = Object.keys(headers).find(
    key => key.toLowerCase() === headerName.toLowerCase()
  );
  return headerKey ? headers[headerKey] : undefined;
}

/**
 * Checks if response status is successful
 * @param {number} status - HTTP status code
 * @returns {boolean} Whether the status code indicates success
 */
function isSuccessStatus(status) {
  return status >= 200 && status < 300;
}

/**
 * Handles network request events
 * @param {Object} debuggeeId - The debugging target
 * @param {string} method - The network event method
 * @param {Object} params - Event parameters
 */
async function handleNetworkEvent(debuggeeId, method, params) {
  try {
    // Handle request initiation
    if (method === 'Network.requestWillBeSent') {
      const { request, requestId } = params;
      
      // Skip OPTIONS requests
      if (request.method === 'OPTIONS') {
        return;
      }

      // Store request info for later
      pendingRequests.set(requestId, {
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: request.postData
      });

      // Handle locations search request
      if (request.url.includes(TARGET_URL)) {
        debugLog('Target request intercepted:', request.url);
        debugLog('Request headers:', request.headers);
        
        // Store headers case-insensitively
        const headers = {
          authorization: getHeaderCaseInsensitive(request.headers, 'authorization'),
          'token-id': getHeaderCaseInsensitive(request.headers, 'token-id'),
          channel: 'APP',
          source: 'WEB_USER',
          version: getHeaderCaseInsensitive(request.headers, 'version')
        };

        interceptedData.headers = headers;
        await storeData({ headers });
        debugLog('Headers stored:', headers);
      }

      // Check if we're recording feature patterns
      const { isRecording } = await chrome.storage.local.get('isRecording');
      if (isRecording && request.method !== 'GET') {
        debugLog('Recording feature request:', request);
        
        // Store version header from successful requests
        const version = getHeaderCaseInsensitive(request.headers, 'version');
        if (version) {
          const updatedHeaders = { 
            ...interceptedData.headers, 
            version 
          };
          interceptedData.headers = updatedHeaders;
          await storeData({ headers: updatedHeaders });
        }

        // Store the request immediately for feature pattern
        const featurePattern = {
          url: request.url,
          method: request.method,
          headers: request.headers,
          body: request.postData ? JSON.parse(request.postData) : null
        };
        
        await storeData({ 
          featurePattern,
          isRecording: false // Stop recording after capturing pattern
        });
        
        debugLog('Feature pattern stored:', featurePattern);
      }
    }
    
    // Handle response loading complete
    if (method === 'Network.loadingFinished') {
      const { requestId } = params;
      
      // Get request info
      const requestInfo = pendingRequests.get(requestId);
      if (!requestInfo) {
        return;
      }

      try {
        debugLog('Getting response body for request:', requestId);
        const bodyResponse = await chrome.debugger.sendCommand(
          { tabId: debuggeeId.tabId },
          'Network.getResponseBody',
          { requestId }
        );

        // Handle locations search response
        if (requestInfo.url.includes(TARGET_URL) && bodyResponse?.body) {
          const data = JSON.parse(bodyResponse.body);
          debugLog('Response body:', data);

          if (data.locations && Array.isArray(data.locations)) {
            const locationIds = data.locations.map(loc => loc._id);
            debugLog('Extracted location IDs:', locationIds);
            await storeData({ locationIds });
          }
        }
      } catch (error) {
        debugLog('Could not get response body:', error.message);
      } finally {
        // Clean up
        pendingRequests.delete(requestId);
      }
    }

    // Handle response received (for error cases)
    if (method === 'Network.responseReceived') {
      const { requestId, response } = params;
      
      const requestInfo = pendingRequests.get(requestId);
      if (!requestInfo) {
        return;
      }

      if (!isSuccessStatus(response.status)) {
        debugLog('Non-success response:', response.status);
        pendingRequests.delete(requestId);
      }
    }
  } catch (error) {
    console.error('Error handling network event:', error);
  }
}

/**
 * Attaches debugger to a tab if not already attached
 * @param {number} tabId - ID of the tab to debug
 */
async function attachDebugger(tabId) {
  if (attachedTabs.has(tabId)) {
    debugLog('Debugger already attached to tab:', tabId);
    return;
  }

  try {
    debugLog('Attaching debugger to tab:', tabId);
    
    // Attach debugger
    await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);
    attachedTabs.add(tabId);
    debugLog('Debugger attached successfully');

    // Enable network tracking
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
    debugLog('Network tracking enabled');
  } catch (error) {
    console.error('Error attaching debugger:', error);
  }
}

/**
 * Detaches debugger from a tab
 * @param {number} tabId - ID of the tab to detach from
 */
async function detachDebugger(tabId) {
  if (!attachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.detach({ tabId });
    attachedTabs.delete(tabId);
    debugLog('Debugger detached from tab:', tabId);
  } catch (error) {
    console.error('Error detaching debugger:', error);
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('app.gohighlevel.com')) {
    attachDebugger(tabId);
  }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  detachDebugger(tabId);
});

// Listen for debugger events
chrome.debugger.onEvent.addListener(handleNetworkEvent);

// Listen for debugger detached events
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
  }
  debugLog('Debugger detached:', source);
});

// Handle extension installation/update
chrome.runtime.onInstalled.addListener(() => {
  debugLog('Extension installed/updated');
}); 