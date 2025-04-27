document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
document.getElementById('clearVolumeCacheBtn').addEventListener('click', clearVolumeCache);

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('clearVolumeCacheBtn');
  if (btn) btn.addEventListener('click', clearVolumeCache);
});

function clearVolumeCache() {
  delete window.productVolumeMap;
  localStorage.removeItem('productVolumeMap');
  alert('Volume cache cleared!');
}

function saveOptions() {
  const subdomainVal = document.getElementById('subdomainInput').value.trim();
  const apiKeyVal = document.getElementById('apiKeyInput').value.trim();
  const enableShortagesVal = document.getElementById('enableShortagesCheckbox').checked;
  const enableSuppliersVal = document.getElementById('enableSuppliersCheckbox').checked;
  const enableVolumeVal = document.getElementById('enableVolumeCheckbox').checked;
  const enableMessageBoxVal = document.getElementById('enableMessageBoxCheckbox').checked;
  const enableOptionalAccVal = document.getElementById('enableOptionalAccessoriesCheckbox').checked;
  const enableHideOrangeLinesVal = document.getElementById('enableHideOrangeLinesCheckbox').checked;

  chrome.storage.sync.set({
    subdomain: subdomainVal,
    apiKey: apiKeyVal,
    enableShortages: enableShortagesVal,
    enableSuppliers: enableSuppliersVal,
    enableVolume: enableVolumeVal,
    enableMessageBox: enableMessageBoxVal,
    enableOptionalAccessories: enableOptionalAccVal,
    hideOrangeLines: enableHideOrangeLinesVal
  }, () => {
    alert('Settings saved!');
  });
}

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
