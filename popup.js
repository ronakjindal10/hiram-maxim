// Debug flag
const DEBUG = true;

/**
 * Debug logging utility
 * @param {...any} args - Items to log
 */
function debugLog(...args) {
  if (DEBUG) {
    console.log('[Bulk Operations Helper - Popup]', ...args);
  }
}

// DOM Elements
const locationList = document.getElementById('locationList');
const locationCount = document.getElementById('locationCount');
const startOperationBtn = document.getElementById('startOperation');
const operationStatus = document.getElementById('operationStatus');
const errorMessage = document.getElementById('errorMessage');

// State
let interceptedData = {
  headers: {},
  locationIds: []
};

/**
 * Updates the UI with location IDs
 * @param {string[]} locations - Array of location IDs
 */
function updateLocationList(locations) {
  debugLog('Updating location list:', locations);
  
  if (!locations || locations.length === 0) {
    locationList.innerHTML = '<div class="status">No locations captured yet. Click the location switcher...</div>';
    locationCount.textContent = '';
    startOperationBtn.disabled = true;
    return;
  }

  locationList.innerHTML = locations
    .map(id => `<div class="location-item">${id}</div>`)
    .join('');
  
  locationCount.textContent = `Total locations: ${locations.length}`;
  startOperationBtn.disabled = false;
}

/**
 * Performs operation on a single location
 * @param {string} locationId - Location ID
 * @param {Object} headers - Request headers
 */
async function performOperation(locationId, headers) {
  debugLog('Performing operation for location:', locationId);
  
  const url = `https://backend.leadconnectorhq.com/phone-system/twilio-accounts?locationId=${locationId}`;
  
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        ...headers
      },
      body: JSON.stringify({
        enableCallRecordingDeletion: true,
        callRecordingRetentionPeriod: 60
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Operation failed');
    }

    debugLog('Operation successful for location:', locationId);
    return { success: true, locationId };
  } catch (error) {
    console.error('Operation failed for location:', locationId, error);
    return { 
      success: false, 
      locationId,
      error: error.message
    };
  }
}

/**
 * Starts bulk operation on all locations
 */
async function startBulkOperation() {
  debugLog('Starting bulk operation');
  startOperationBtn.disabled = true;
  operationStatus.textContent = 'Starting bulk operation...';
  errorMessage.textContent = '';

  const results = {
    success: [],
    failed: []
  };

  const BATCH_SIZE = 5;
  const DELAY = 1000; // 1 second delay between batches

  for (let i = 0; i < interceptedData.locationIds.length; i += BATCH_SIZE) {
    const batch = interceptedData.locationIds.slice(i, i + BATCH_SIZE);
    
    operationStatus.textContent = `Processing batch ${Math.floor(i/BATCH_SIZE) + 1}...`;
    debugLog('Processing batch:', batch);
    
    const batchResults = await Promise.all(
      batch.map(id => performOperation(id, interceptedData.headers))
    );

    batchResults.forEach(result => {
      if (result.success) {
        results.success.push(result.locationId);
      } else {
        results.failed.push({
          locationId: result.locationId,
          error: result.error
        });
      }
    });

    if (i + BATCH_SIZE < interceptedData.locationIds.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY));
    }
  }

  debugLog('Bulk operation completed:', results);
  operationStatus.textContent = `Completed! Success: ${results.success.length}, Failed: ${results.failed.length}`;
  
  if (results.failed.length > 0) {
    errorMessage.textContent = `Failed locations: ${results.failed.map(f => f.locationId).join(', ')}`;
  }

  startOperationBtn.disabled = false;
}

/**
 * Initializes the popup
 */
async function initPopup() {
  debugLog('Initializing popup');
  try {
    const data = await chrome.storage.local.get(['locationIds', 'headers']);
    debugLog('Retrieved data from storage:', data);
    
    interceptedData = {
      locationIds: data.locationIds || [],
      headers: data.headers || {}
    };
    
    updateLocationList(interceptedData.locationIds);
  } catch (error) {
    console.error('Error initializing popup:', error);
    errorMessage.textContent = 'Error loading data. Please try again.';
  }
}

// Event Listeners
startOperationBtn.addEventListener('click', startBulkOperation);

// Initialize popup when opened
document.addEventListener('DOMContentLoaded', initPopup); 