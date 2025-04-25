// popup.js

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);

function saveOptions() {
  const subdomainVal          = document.getElementById('subdomainInput').value.trim();
  const apiKeyVal             = document.getElementById('apiKeyInput').value.trim();
  const enableShortagesVal    = document.getElementById('enableShortagesCheckbox').checked;
  const enableSuppliersVal    = document.getElementById('enableSuppliersCheckbox').checked;
  const enableMessageBoxVal   = document.getElementById('enableMessageBoxCheckbox').checked;
  const enableOptionalAccVal  = document.getElementById('enableOptionalAccessoriesCheckbox').checked;

  chrome.storage.sync.set({
    subdomain:               subdomainVal,
    apiKey:                  apiKeyVal,
    enableShortages:         enableShortagesVal,
    enableSuppliers:         enableSuppliersVal,
    enableMessageBox:        enableMessageBoxVal,
    enableOptionalAccessories: enableOptionalAccVal
  }, () => {
    alert('Settings saved!');
  });
}

function restoreOptions() {
  chrome.storage.sync.get({
    subdomain:              '',
    apiKey:                 '',
    enableShortages:        true,
    enableSuppliers:        true,
    enableMessageBox:       true,
    enableOptionalAccessories: true
  }, items => {
    document.getElementById('subdomainInput').value                    = items.subdomain;
    document.getElementById('apiKeyInput').value                       = items.apiKey;
    document.getElementById('enableShortagesCheckbox').checked         = items.enableShortages;
    document.getElementById('enableSuppliersCheckbox').checked         = items.enableSuppliers;
    document.getElementById('enableMessageBoxCheckbox').checked        = items.enableMessageBox;
    document.getElementById('enableOptionalAccessoriesCheckbox').checked = items.enableOptionalAccessories;
  });
}