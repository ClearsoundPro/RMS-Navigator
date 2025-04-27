// popup.js

document.addEventListener('DOMContentLoaded', () => {
  // Restore saved options
  restoreOptions();

  // Save Settings handler
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveOptions);
  }

  // Clear Volume Cache handler
  const clearBtn = document.getElementById('clearVolumeCacheBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      // 1) Immediate UI feedback
      clearBtn.disabled = true;
      clearBtn.textContent = 'Clearing…';
      clearBtn.style.backgroundColor = '#f0f0f0';

      try {
        // 2) Find the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab');

        // 3) Use MV3 API if available, otherwise fall back to executeScript
        if (chrome.scripting && chrome.scripting.executeScript) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              delete window.productVolumeMap;
              localStorage.removeItem('productVolumeMap');
              console.log('✅ Volume cache cleared (MV3)');
            }
          });
        } else {
          // Fallback for Manifest V2
          await new Promise((resolve, reject) => {
            chrome.tabs.executeScript(
              tab.id,
              {
                code: `
                  delete window.productVolumeMap;
                  localStorage.removeItem('productVolumeMap');
                  console.log('✅ Volume cache cleared (MV2)');
                `
              },
              result => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(result);
              }
            );
          });
        }

        // 4) Show success
        clearBtn.textContent = '✓ Cleared';
        clearBtn.style.backgroundColor = '#28a745';

      } catch (err) {
        console.error('Failed to clear cache:', err);
        clearBtn.textContent = 'Error';
        clearBtn.style.backgroundColor = '#dc3545';
      } finally {
        // 5) Restore after short delay
        setTimeout(() => {
          clearBtn.disabled = false;
          clearBtn.textContent = 'Reset Item Volume Cache';
          clearBtn.style.backgroundColor = '';
        }, 1200);
      }
    });
  }
});

/**
 * Save extension options.
 */
function saveOptions() {
  const subdomain               = document.getElementById('subdomainInput').value.trim();
  const apiKey                  = document.getElementById('apiKeyInput').value.trim();
  const enableShortages         = document.getElementById('enableShortagesCheckbox').checked;
  const enableSuppliers         = document.getElementById('enableSuppliersCheckbox').checked;
  const enableVolume            = document.getElementById('enableVolumeCheckbox').checked;
  const enableMessageBox        = document.getElementById('enableMessageBoxCheckbox').checked;
  const enableOptionalAcc       = document.getElementById('enableOptionalAccessoriesCheckbox').checked;
  const hideOrangeLines         = document.getElementById('enableHideOrangeLinesCheckbox').checked;

  chrome.storage.sync.set({
    subdomain,
    apiKey,
    enableShortages,
    enableSuppliers,
    enableVolume,
    enableMessageBox,
    enableOptionalAccessories: enableOptionalAcc,
    hideOrangeLines
  }, () => {
    alert('Settings saved!');
  });
}

/**
 * Restore extension options when popup loads.
 */
function restoreOptions() {
  chrome.storage.sync.get({
    subdomain:                  '',
    apiKey:                     '',
    enableShortages:            true,
    enableSuppliers:            true,
    enableVolume:               false,
    enableMessageBox:           true,
    enableOptionalAccessories:  true,
    hideOrangeLines:            false
  }, items => {
    document.getElementById('subdomainInput').value                         = items.subdomain;
    document.getElementById('apiKeyInput').value                            = items.apiKey;
    document.getElementById('enableShortagesCheckbox').checked              = items.enableShortages;
    document.getElementById('enableSuppliersCheckbox').checked              = items.enableSuppliers;
    document.getElementById('enableVolumeCheckbox').checked                 = items.enableVolume;
    document.getElementById('enableMessageBoxCheckbox').checked             = items.enableMessageBox;
    document.getElementById('enableOptionalAccessoriesCheckbox').checked    = items.enableOptionalAccessories;
    document.getElementById('enableHideOrangeLinesCheckbox').checked        = items.hideOrangeLines;
  });
}