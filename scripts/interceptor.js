/**
 * interceptor.js
 * 
 * This script intercepts Fetch and XHR requests to capture location IDs and authentication headers from the API response.
 */

/**
 * Enables debug logging.
 */
window.BO_DEBUG = true;

/**
 * Logs debug messages if DEBUG is enabled.
 * @param  {...any} args - Messages or data to log.
 */
function debugLog(...args) {
  if (window.BO_DEBUG) {
    console.log('[Bulk Operations Helper - Interceptor]', ...args);
  }
}

/**
 * Intercepts Fetch requests.
 */
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    debugLog('Fetch called with args:', args);
    const response = await originalFetch.apply(this, args);
    const clonedResponse = response.clone();
    const url = args[0];

    if (url.includes('/locations/search')) {
      clonedResponse.json().then(data => {
        if (data.locations) {
          const locationIds = data.locations.map(loc => loc._id);
          debugLog('Captured Location IDs from Fetch:', locationIds);

          // Capture authentication headers (modify as needed)
          const headers = {
            authorization: clonedResponse.headers.get('authorization') || '',
            'token-id': clonedResponse.headers.get('token-id') || ''
          };

          window.postMessage({
            type: 'LOCATIONS_DATA',
            locations: locationIds,
            headers: headers
          }, '*');
        }
      }).catch(err => debugLog('Error parsing Fetch response:', err));
    }

    return response;
  };
})();

/**
 * Intercepts XHR requests.
 */
(function() {
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.addEventListener('load', function() {
      if (url.includes('/locations/search') && this.responseText) {
        try {
          const data = JSON.parse(this.responseText);
          if (data.locations) {
            const locationIds = data.locations.map(loc => loc._id);

            // Capture authentication headers from response headers
            const authorization = this.getResponseHeader('authorization') || '';
            const tokenId = this.getResponseHeader('token-id') || '';

            debugLog('Captured Location IDs from XHR:', locationIds);
            debugLog('Captured Headers from XHR:', { authorization, 'token-id': tokenId });

            window.postMessage({
              type: 'LOCATIONS_DATA',
              locations: locationIds,
              headers: {
                authorization: authorization,
                'token-id': tokenId
              }
            }, '*');
          }
        } catch (err) {
          debugLog('Error parsing XHR response:', err);
        }
      }
    });
    return originalOpen.apply(this, arguments);
  };
})();
