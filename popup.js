let locationIds = [];
let authData = null;

// Feature configurations
const features = {
  'sms-validation': {
    endpoint: 'https://backend.leadconnectorhq.com/appengine/twilio/subaccount/{locationId}/validate_sms',
    getPayload: (enable) => ({
      validateSms: enable
    })
  },
  'call-recording': {
    endpoint: 'https://backend.leadconnectorhq.com/phone-system/twilio-accounts',
    method: 'PUT',
    getPayload: (enable) => ({
      enableCallRecordingDeletion: enable,
      callRecordingRetentionPeriod: 60
    }),
    queryParam: 'locationId',
    contentType: 'application/json'
  }
};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  initializePopup();
});

async function initializePopup() {
  try {
    // Get both auth data and locations from storage
    const stored = await chrome.storage.local.get(['authData', 'locationIds']);
    console.log('Stored data:', stored);
    
    if (stored.authData && stored.locationIds?.length) {
      authData = stored.authData;
      locationIds = stored.locationIds;
      
      document.getElementById('auth-status').textContent = 'Ready to perform bulk operations';
      document.getElementById('location-count').textContent = locationIds.length;
      document.getElementById('location-info').style.display = 'block';
      document.getElementById('feature-controls').style.display = 'block';
    } else {
      document.getElementById('auth-status').textContent = 'Please navigate to Locations page and click Search';
    }
  } catch (error) {
    console.error('Initialization error:', error);
    document.getElementById('auth-status').textContent = 'Error: ' + error.message;
  }
}

// Handle feature updates
async function updateFeature(enable) {
  if (!locationIds.length) {
    document.getElementById('progress-text').textContent = 'No locations found. Please refresh the locations list.';
    return;
  }

  const featureSelect = document.getElementById('feature-select');
  const feature = features[featureSelect.value];
  
  document.getElementById('progress').style.display = 'block';
  document.getElementById('progress-text').textContent = 'Starting bulk update...';
  
  try {
    const results = await chrome.runtime.sendMessage({
      type: 'BULK_UPDATE_FEATURE',
      data: {
        locationIds,
        featureEndpoint: feature.endpoint,
        featurePayload: feature.getPayload(enable),
        method: feature.method || 'POST',
        queryParam: feature.queryParam
      }
    });

    if (results.error) {
      document.getElementById('progress-text').textContent = `Error: ${results.error}`;
      return;
    }

    updateProgress(results);
  } catch (error) {
    console.error('Update feature error:', error);
    document.getElementById('progress-text').textContent = `Error: ${error.message}`;
  }
}

// Update progress UI
function updateProgress(results) {
  const total = locationIds.length;
  const completed = results.successful.length + results.failed.length + results.skipped.length;
  const progressPercent = (completed / total) * 100;
  
  document.getElementById('progress-fill').style.width = `${progressPercent}%`;
  document.getElementById('progress-text').innerHTML = 
    `Completed: ${completed}/${total}<br>` +
    `Success: ${results.successful.length}<br>` +
    `Failed: ${results.failed.length}<br>` +
    `Skipped: ${results.skipped.length}`;
}

// Add button event listeners
document.getElementById('enable-btn').addEventListener('click', () => updateFeature(true));
document.getElementById('disable-btn').addEventListener('click', () => updateFeature(false)); 