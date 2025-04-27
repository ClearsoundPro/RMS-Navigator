// popup.js

document.addEventListener('DOMContentLoaded', () => {
  // Restore saved options
  restoreOptions();

  // Save Settings
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveOptions);
  }

  // Clear Volume Cache
  const clearBtn = document.getElementById('clearVolumeCacheBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      // execute in page context
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tabId = tabs[0]?.id;
        if (!tabId) return alert('No active tab');
        chrome.tabs.executeScript(tabId, {
          code: `
            delete window.productVolumeMap;
            localStorage.removeItem('productVolumeMap');
            console.log('Volume cache cleared from page');
          `
        });
      });

      // UI feedback
      clearBtn.disabled = true;
      clearBtn.textContent = '✓ Cleared!';
      clearBtn.style.backgroundColor = '#28a745';
      setTimeout(() => {
        clearBtn.disabled = false;
        clearBtn.textContent = 'Reset Item Volume Cache';
        clearBtn.style.backgroundColor = '';
      }, 1200);
    });
  }
    });

/**
 * Save extension options.
 */
function saveOptions() {
  const subdomain = document.getElementById('subdomainInput').value.trim();
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const enableShortages = document.getElementById('enableShortagesCheckbox').checked;
  const enableSuppliers = document.getElementById('enableSuppliersCheckbox').checked;
  const enableVolume = document.getElementById('enableVolumeCheckbox').checked;
  const enableMessageBox = document.getElementById('enableMessageBoxCheckbox').checked;
  const enableOptionalAcc = document.getElementById('enableOptionalAccessoriesCheckbox').checked;
  const hideOrangeLines = document.getElementById('enableHideOrangeLinesCheckbox').checked;

  chrome.storage.sync.set({
    subdomain,
    apiKey,
    enableShortages,
    enableSuppliers,
    enableVolume,
    enableMessageBox,
    enableOptionalAccessories: enableOptionalAcc,
    hideOrangeLines
  }, () => alert('Settings saved!'));
}

/**
 * Restore extension options when popup loads.
 */
function restoreOptions() {
  chrome.storage.sync.get({
    subdomain: '',
    apiKey: '',
    enableShortages: true,
    enableSuppliers: true,
    enableVolume: false,
    enableMessageBox: true,
    enableOptionalAccessories: true,
    hideOrangeLines: false
  }, items => {
    document.getElementById('subdomainInput').value = items.subdomain;
    document.getElementById('apiKeyInput').value = items.apiKey;
    document.getElementById('enableShortagesCheckbox').checked = items.enableShortages;
    document.getElementById('enableSuppliersCheckbox').checked = items.enableSuppliers;
    document.getElementById('enableVolumeCheckbox').checked = items.enableVolume;
    document.getElementById('enableMessageBoxCheckbox').checked = items.enableMessageBox;
    document.getElementById('enableOptionalAccessoriesCheckbox').checked = items.enableOptionalAccessories;
    document.getElementById('enableHideOrangeLinesCheckbox').checked = items.hideOrangeLines;
  });
}
