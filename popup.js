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
const recordFeatureBtn = document.getElementById('recordFeature');
const recordingStatus = document.getElementById('recordingStatus');
const featurePattern = document.getElementById('featurePattern');

// State
let interceptedData = {
  headers: {},
  locationIds: [],
  featurePattern: null
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
  startOperationBtn.disabled = !interceptedData.featurePattern;
}

/**
 * Updates the feature pattern display
 * @param {Object} pattern - Feature pattern object
 */
function updateFeaturePattern(pattern) {
  debugLog('Updating feature pattern:', pattern);
  
  if (!pattern) {
    featurePattern.innerHTML = '';
    recordingStatus.innerHTML = `
      <p class="status">No feature pattern recorded yet.</p>
      <ol class="steps">
        <li>Click 'Start Recording'</li>
        <li>Navigate to any location</li>
        <li>Toggle the feature you want to change</li>
        <li>Click 'Stop Recording' to confirm</li>
      </ol>
    `;
    recordFeatureBtn.textContent = 'Start Recording';
    recordFeatureBtn.classList.remove('recording');
    return;
  }

  featurePattern.innerHTML = `
    <div class="feature-pattern">
      URL: ${pattern.url}
      Method: ${pattern.method}
      Body: ${JSON.stringify(pattern.body, null, 2)}
    </div>
  `;
  startOperationBtn.disabled = !interceptedData.locationIds.length;
}

/**
 * Toggles feature recording mode
 * @param {boolean} isRecording - Whether recording is active
 */
async function toggleRecording(isRecording) {
  debugLog('Toggling recording:', isRecording);
  
  try {
    await chrome.storage.local.set({ isRecording });
    
    if (isRecording) {
      recordFeatureBtn.textContent = 'Stop Recording';
      recordFeatureBtn.classList.add('recording');
      recordingStatus.innerHTML = '<p class="status">Recording... Navigate to a location and toggle the feature.</p>';
    } else {
      recordFeatureBtn.textContent = 'Start Recording';
      recordFeatureBtn.classList.remove('recording');
    }
  } catch (error) {
    console.error('Error toggling recording:', error);
    errorMessage.textContent = 'Error toggling recording mode';
  }
}

/**
 * Performs operation on a single location
 * @param {string} locationId - Location ID
 * @param {Object} headers - Request headers
 * @param {Object} pattern - Feature pattern
 */
async function performOperation(locationId, headers, pattern) {
  debugLog('Performing operation for location:', locationId);
  
  try {
    const url = pattern.url;
    const response = await fetch(url, {
      method: pattern.method,
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'authorization': headers.authorization,
        'token-id': headers['token-id'],
        'channel': headers.channel || 'APP',
        'source': headers.source || 'WEB_USER',
        'version': headers.version || pattern.headers?.version || '2021-07-28',
        'x-location-id': locationId
      },
      body: JSON.stringify({
        ...pattern.body,
        locationId
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
      batch.map(id => performOperation(id, interceptedData.headers, interceptedData.featurePattern))
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
    const data = await chrome.storage.local.get(['locationIds', 'headers', 'featurePattern', 'isRecording']);
    debugLog('Retrieved data from storage:', data);
    
    interceptedData = {
      locationIds: data.locationIds || [],
      headers: data.headers || {},
      featurePattern: data.featurePattern || null
    };
    
    updateLocationList(interceptedData.locationIds);
    updateFeaturePattern(interceptedData.featurePattern);
    
    if (data.isRecording) {
      recordFeatureBtn.textContent = 'Stop Recording';
      recordFeatureBtn.classList.add('recording');
      recordingStatus.innerHTML = '<p class="status">Recording... Navigate to a location and toggle the feature.</p>';
    }
  } catch (error) {
    console.error('Error initializing popup:', error);
    errorMessage.textContent = 'Error loading data. Please try again.';
  }
}

// Event Listeners
startOperationBtn.addEventListener('click', startBulkOperation);
recordFeatureBtn.addEventListener('click', async () => {
  const isCurrentlyRecording = recordFeatureBtn.textContent === 'Stop Recording';
  await toggleRecording(!isCurrentlyRecording);
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  debugLog('Storage changes:', changes);
  
  for (const [key, { newValue }] of Object.entries(changes)) {
    switch (key) {
      case 'locationIds':
        interceptedData.locationIds = newValue || [];
        updateLocationList(interceptedData.locationIds);
        break;
      case 'headers':
        interceptedData.headers = newValue || {};
        break;
      case 'featurePattern':
        interceptedData.featurePattern = newValue || null;
        updateFeaturePattern(interceptedData.featurePattern);
        break;
    }
  }
});

// Initialize popup when opened
document.addEventListener('DOMContentLoaded', initPopup); 