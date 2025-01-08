// Store auth tokens and headers
let authData = null;

// Listen for auth data from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'AUTH_DATA_CAPTURED') {
    authData = request.data;
  }
  
  if (request.type === 'GET_AUTH_DATA') {
    if (authData) {
      sendResponse(authData);
      return true;
    }
    
    // If not in memory, try to get from storage
    chrome.storage.local.get(['authData'], function(result) {
      sendResponse(result.authData || null);
    });
    return true;
  }
}); 