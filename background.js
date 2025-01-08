// Store auth data and locations
let authData = null;
let locationIds = [];

// Listen for webRequest to capture auth data and locations
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    if (details.url.includes('backend.leadconnectorhq.com/locations/search')) {
      const headers = {};
      const headerMap = new Map(details.requestHeaders.map(h => [h.name.toLowerCase(), h.value]));
      
      const authToken = headerMap.get('authorization');
      const tokenId = headerMap.get('token-id');
      
      if (authToken && tokenId) {
        authData = {
          bearerToken: authToken,
          tokenId: tokenId,
          companyId: new URL(details.url).searchParams.get('companyId'),
          headers: {
            'authorization': authToken,
            'token-id': tokenId,
            'channel': 'APP',
            'source': 'WEB_USER',
            'content-type': 'application/json',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8'
          }
        };

        // Store in chrome.storage
        chrome.storage.local.set({ authData });
      }
    }
    return { requestHeaders: details.requestHeaders };
  },
  { urls: ["*://backend.leadconnectorhq.com/*"] },
  ["requestHeaders"]
);

// Capture the response data to get location IDs
chrome.webRequest.onCompleted.addListener(
  async function(details) {
    if (details.url.includes('backend.leadconnectorhq.com/locations/search')) {
      try {
        // Fetch the response data
        const response = await fetch(details.url, {
          headers: authData.headers
        });
        const data = await response.json();
        
        if (data && Array.isArray(data.locations)) {
          locationIds = data.locations
            .filter(loc => loc && loc.id)
            .map(loc => loc.id);
          
          // Store locations in chrome.storage
          chrome.storage.local.set({ locationIds });
          
          log('Captured locations:', locationIds);
        }
      } catch (error) {
        log('Error capturing locations:', error);
      }
    }
  },
  { urls: ["*://backend.leadconnectorhq.com/*"] }
);

// Update message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'BULK_UPDATE_FEATURE') {
    handleBulkUpdate(request.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (request.type === 'GET_DATA') {
    sendResponse({ authData, locationIds });
    return true;
  }
});

// Add logging utility
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(data);
  }
}

// Update makeApiCall function
async function makeApiCall(url, method, headers, body, maxRetries = 3) {
  // Ensure all required headers are present
  const requestHeaders = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'content-type': 'application/json',
    'channel': 'APP',
    'source': 'WEB_USER',
    ...headers  // Spread the captured headers
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`Attempt ${attempt}: ${method} ${url}`);
      log('Request Headers:', requestHeaders);
      log('Request Body:', body);

      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        log(`Error Response (${response.status}):`, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseData = await response.json();
      log('Success Response:', responseData);
      return responseData;
    } catch (error) {
      log(`Error in attempt ${attempt}:`, error.message);
      if (attempt === maxRetries) throw error;
      log(`Waiting ${2000 * attempt}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

// Update handleBulkUpdate function
async function handleBulkUpdate({ locationIds, featureEndpoint, featurePayload, method = 'POST', queryParam = null }) {
  const results = {
    successful: [],
    failed: [],
    skipped: []
  };

  log(`Starting bulk update for ${locationIds.length} locations`);

  for (const locationId of locationIds) {
    try {
      const url = queryParam 
        ? `${featureEndpoint}?${queryParam}=${locationId}`
        : featureEndpoint.replace('{locationId}', locationId);

      log(`Processing location: ${locationId}`);
      await makeApiCall(
        url,
        method,
        authData.headers,
        featurePayload
      );
      results.successful.push(locationId);
      log(`Success for location: ${locationId}`);
    } catch (error) {
      log(`Error for location ${locationId}:`, error.message);
      if (error.message.includes('No twilio account found')) {
        results.skipped.push(locationId);
        log(`Skipped location ${locationId}: No Twilio account`);
      } else {
        results.failed.push(locationId);
        log(`Failed location ${locationId}: ${error.message}`);
      }
    }
    // Increase delay to 500ms
    log('Waiting 500ms before next location...');
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  log('Bulk update completed', results);
  return results;
} 