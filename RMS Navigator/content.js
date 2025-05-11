// content.js

console.log('Custom content script loaded.');


// ── SUPPLIERS MODULE (Resilient Injection via MutationObserver) ─────────────────
(async function() {
  const isCostings = window.location.search.includes('view=c');
  const params     = new URLSearchParams(window.location.search);
  const supplierIn = params.get('supplier');
  const basePath   = window.location.pathname.split('?')[0];
  const baseUrl    = `${window.location.origin}${basePath}`;

  // Helper: click “Mark as sent” via hidden iframe, strip data-confirm
  function markPOAsSent(poId) {
    const src = `${window.location.origin}/purchase_orders/${poId}${window.location.search}`;
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px';
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          const doc = iframe.contentWindow.document;
          doc.querySelectorAll('[data-confirm]').forEach(el => el.removeAttribute('data-confirm'));
          const link = doc.querySelector('a[data-method="post"][href*="/mark_as_sent"]');
          if (!link) throw new Error('Link not found');
          link.click();
          cleanup();
          resolve();
        } catch (err) {
          cleanup();
          reject(err);
        }
      };
      iframe.onerror = err => { cleanup(); reject(err); };
      function cleanup() { setTimeout(() => iframe.remove(), 200); }
      iframe.src = src;
    });
  }

  if (!isCostings) {
    // 1) Fetch & parse view=c
    const resp = await fetch(`${baseUrl}?view=c`, { credentials: 'same-origin' });
    if (!resp.ok) { console.error(`Fetch failed: ${resp.status}`); return; }
    const html = await resp.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');

    // 2) Scrape suppliers
    const map = {};
    doc.querySelectorAll('table.table-hover tbody tr').forEach(tr => {
      const cell = tr.querySelector('td.optional-01.asset.asset-column');
      if (!cell) return;
      const sup = cell.textContent.trim();
      if (!sup) return;
      const blacklist = ['Bulk Stock','Non-Stock Booking','Group Booking','******CLEARSOUND STOCK******',
        'Dan Ridd','Liam Murphy','Rob Burton','Daniel Gibbs','HOTEL','CA24 BDV PEUGEOT BOXER 3.5T VAN'];
      if (blacklist.some(b => sup.includes(b))) return;
      const poCell = tr.querySelector('td.optional-04.purchase-order-column');
      let poText = '', poHref = '', badgeClasses = [];
      if (poCell) {
        const badge = poCell.firstElementChild;
        const aTag  = badge?.tagName.toLowerCase() === 'a' ? badge : badge?.querySelector('a');
        if (aTag) { poText = aTag.textContent.trim(); poHref = aTag.href; }
        badgeClasses = badge?.classList ? Array.from(badge.classList) : [];
      }
      if (!map[sup]) map[sup] = { poText, poHref, badgeClasses };
    });
    const suppliers = Object.entries(map);
    if (!suppliers.length) { console.log('ℹ️ No suppliers to show.'); return; }

    // 3) Inject/Update Suppliers panel
    function injectSuppliersPanel() {
      let supDiv = [...document.querySelectorAll('.group-side-content')]
        .find(d => d.querySelector('h3')?.textContent.trim() === 'Suppliers');
      if (!supDiv) {
        const sched = [...document.querySelectorAll('.group-side-content')]
          .find(d => d.querySelector('h3')?.textContent.trim() === 'Scheduling');
        if (!sched) return;
        supDiv = document.createElement('div');
        supDiv.className = 'group-side-content';
        supDiv.innerHTML = '<h3>Suppliers</h3>';
        sched.parentNode.insertBefore(supDiv, sched.nextSibling);
      }
      const existing = supDiv.querySelector('ul.subhire-list');
      if (existing && existing.children.length === suppliers.length) return;
      existing?.remove();

      const ul = document.createElement('ul');
      ul.className = 'subhire-list';
      ul.style.paddingLeft = '1em';

      suppliers.forEach(([sup, {poText, poHref, badgeClasses}]) => {
        const li = document.createElement('li');
        li.textContent = sup + ' — ';

        const a = document.createElement('a');
        Object.assign(a.style, {
          padding:      '2px 6px',
          borderRadius: '4px',
          fontSize:     '0.9em',
          fontWeight:   'bold',
          marginLeft:   '4px',
          display:      'inline-block',
          color:        'white',
          textDecoration:'none',
          cursor:       'pointer'
        });
        a.target = '_blank';

        if (poText) {
          a.textContent = `PO #${poText}`;
          a.href        = poHref;
          const isGreen = badgeClasses.some(c => /success|green/i.test(c));
          a.style.backgroundColor = isGreen ? 'orange' : 'green';
        } else {
          a.textContent = 'No PO';
          a.href        = `${baseUrl}?sort=stock_category&view=c&supplier=${encodeURIComponent(sup)}`;
          a.style.backgroundColor = 'red';
        }

        a.addEventListener('mouseover', () => a.style.opacity = '0.8');
        a.addEventListener('mouseout',  () => a.style.opacity = '1');

        li.appendChild(a);
        ul.appendChild(li);
      });

      supDiv.appendChild(ul);
      console.log(`✅ Injected ${suppliers.length} suppliers.`);
    }

    // Initial injection
    injectSuppliersPanel();

    // Observe panel container for removal of panels
    const schedPanel = [...document.querySelectorAll('.group-side-content')]
      .find(d => d.querySelector('h3')?.textContent.trim() === 'Scheduling');
    if (schedPanel && schedPanel.parentNode) {
      const container = schedPanel.parentNode;
      const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          if ([...m.removedNodes].some(n => n.classList && n.classList.contains('group-side-content'))) {
            injectSuppliersPanel();
            break;
          }
        }
      });
      observer.observe(container, { childList: true });
    }

    // 4) Context-menu handler for “Mark as sent”
    document.body.addEventListener('contextmenu', ev => {
      const link = ev.target.closest('.subhire-list a[href*="/purchase_orders/"]');
      if (!link || link.textContent.startsWith('No PO')) return;
      ev.preventDefault();
      document.querySelectorAll('.__po-sent-popup').forEach(x => x.remove());
      const box = document.createElement('div');
      box.className = '__po-sent-popup';
      box.textContent = 'Mark as sent';
      Object.assign(box.style, {
        position:     'absolute',
        top:          `${ev.pageY}px`,
        left:         `${ev.pageX}px`,
        padding:      '6px 12px',
        background:   '#333',
        color:        'white',
        borderRadius: '4px',
        cursor:       'pointer',
        zIndex:       9999,
        fontSize:     '0.9em'
      });
      document.body.appendChild(box);
      const cleanup = () => box.remove();
      setTimeout(() => {
        document.addEventListener('click', cleanup, { once: true });
        window.addEventListener('scroll', cleanup, { once: true });
      }, 10);
      box.addEventListener('click', () => {
        cleanup();
        const m = link.href.match(/\/purchase_orders\/(\d+)/);
        if (!m) return;
        const poId = m[1];
        link.style.opacity = '0.6';
        markPOAsSent(poId)
          .then(() => link.style.backgroundColor = 'green')
          .catch(() => {})
          .finally(() => link.style.opacity = '');
      });
    });

  } else {
    // Auto-select on costings page
    let count = 0;
    document.querySelectorAll('table.table-hover tbody tr').forEach(tr => {
      const name = tr.querySelector('td.optional-01.asset.asset-column')?.textContent.trim();
      if (name === supplierIn) {
        const cb = tr.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) { cb.click(); count++; }
      }
    });
    console.log(`✔️ Auto-selected ${count} row${count===1?'':'s'} for “${supplierIn}.”`);
  }
})();



//
// ── Shortages Module  ─────────────────────────────────────────────────
//

chrome.storage.sync.get({ enableShortages: true }, ({ enableShortages }) => {
  if (!enableShortages) return;

// ---- Resilient “Shortages List” injection ----
function injectShortagesListButton() {
  const actionsHeader = Array.from(document.querySelectorAll('.group-side-content h3'))
    .find(h3 => h3.textContent.trim() === 'Actions');
  if (!actionsHeader) return;

  let ul = actionsHeader.nextElementSibling;
  while (ul && ul.tagName !== 'UL') ul = ul.nextElementSibling;
  if (!ul) return;

  // prevent duplicate
  if (ul.querySelector('.shortages-injected')) return;

  const availabilityLi = Array.from(ul.children)
    .find(li => li.textContent.trim().startsWith('Availability'));
  if (!availabilityLi) return;

  const newLi = availabilityLi.cloneNode(false);
  newLi.classList.add('shortages-injected');

  const origIcon = availabilityLi.querySelector('i');
  if (origIcon) newLi.appendChild(origIcon.cloneNode(false));
  newLi.appendChild(document.createTextNode(' Shortages List'));

  newLi.style.cursor = 'pointer';
  newLi.title = 'Click to check shortages';
  newLi.addEventListener('click', fetchShortagesAndDisplay);
  newLi.addEventListener('mouseover', () => newLi.style.backgroundColor = '#f0f0f0');
  newLi.addEventListener('mouseout',  () => newLi.style.backgroundColor = '');

  ul.insertBefore(newLi, availabilityLi);
  console.log('✅ “Shortages List” button injected successfully.');
}

// initial inject
injectShortagesListButton();

// re-inject on any DOM changes
new MutationObserver(injectShortagesListButton)
  .observe(document.body, { childList: true, subtree: true });
  


// Helper: Retrieve API settings from chrome.storage
function getAPISettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      apiKey: '',         // Stored API Key
      subdomain: ''  // Stored subdomain
    }, function(items) {
      resolve(items);
    });
  });
}

// Function to fetch shortages data and display it in a popup
function fetchShortagesAndDisplay() {
  const popupContentEl = displayPopup("Please wait while I work out your shortages...");
  const opportunityNumber = window.location.href.split("/opportunities/")[1]?.split("?")[0];
  console.log("Opportunity Number:", opportunityNumber);

  if (!opportunityNumber) {
    console.error("Opportunity number not found in URL.");
    return;
  }
  
  // Get stored API settings before making the first fetch
  getAPISettings().then(settings => {
    fetch(`https://api.current-rms.com/api/v1/opportunities/${opportunityNumber}/opportunity_items?q[has_shortage_eq]=true&filtermode=all`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-TOKEN": settings.apiKey,
        "X-SUBDOMAIN": settings.subdomain
      }
    })
    .then(response => response.json())
    .then(data => {
      console.log("Received shortages data:", data);

      if (!data.opportunity_items) {
        console.error("No 'opportunity_items' found in response data.");
        popupContentEl.innerHTML = "No shortages data found.";
        return;
      }

      // Filter out accessories with accessory_mode 0, 1, 2, or 3
      const nonAccessoryItems = data.opportunity_items.filter(item => 
        item.accessory_mode === undefined || ![0, 1, 2, 3].includes(item.accessory_mode)
      );

      // Filter out unwanted item names
      const unwantedNames = /(SET PANEL|CUSTOM|TECHNICIAN|MANAGER|LOCAL CREW|SET BUILDER|COURIER|STAGE CARPET|DIRECTOR|OPERATOR|LICENCE|TRANSPORT)/i;
      const filteredItems = nonAccessoryItems.filter(item => !unwantedNames.test(item.name));

      // Process each non-accessory item and fetch availability
      const shortagePromises = filteredItems.map(item =>
        fetchAvailabilityWithDateRange(item.item_id, parseInt(opportunityNumber)).then(availabilityData => {
          const availableQuantity = Math.abs(availabilityData.lowestQuantityAvailable);
          const highestBookingQuantity = availabilityData.highestBookingQuantity;

          // Determine which quantity to display based on the comparison
          const quantityToShow = availableQuantity < highestBookingQuantity ? availableQuantity : highestBookingQuantity;

          return { 
            name: item.name, 
            available: quantityToShow, // Use the determined quantity
            itemId: item.item_id // Store item ID for quarantine check
          };
        })
      );

      Promise.all(shortagePromises).then(shortagesList => {
        // Check for quarantine for each item
        const quarantinePromises = shortagesList.map(shortage => 
          checkForQuarantine(shortage.itemId, opportunityNumber).then(quarantineQuantity => {
            return {
              name: shortage.name,
              available: shortage.available,
              quarantineQuantity: quarantineQuantity
            };
          })
        );

        Promise.all(quarantinePromises).then(finalShortagesList => {
          // Use a map to eliminate duplicates based on item name
          const uniqueItems = {};
          finalShortagesList.forEach(item => {
            const key = item.name;
            if (!uniqueItems[key]) {
              uniqueItems[key] = item;
            }
          });

          // Prepare the content with quarantine notice and correct quantity (updated to new markup)
          const shortagesContent = Object.values(uniqueItems).map(item => {
            const quarantineNotice = item.quarantineQuantity > 0 
              ? `<span class="quarantine-badge">Quarantine x ${item.quarantineQuantity}</span>` 
              : '';
            const rowStyle = item.quarantineQuantity > 0 ? 'class="shortage-row quarantine-row"' : 'class="shortage-row"';
            return `<div ${rowStyle}><strong>${item.name}</strong> x ${item.available} ${quarantineNotice}</div>`;
          }).join("");

          popupContentEl.innerHTML = shortagesContent.replace(/\n/g, '<br>');
          // Send the shortages back to the opportunity
          postShortagesToOpportunity(opportunityNumber, shortagesContent);
        });
      });
    })
    .catch(error => {
      console.error("Error fetching shortages:", error);
      popupContentEl.innerHTML = "Error fetching shortages data.";
    });
  });
}
  
// Function to check if an item has quantities in quarantine and return the highest quantity
function checkForQuarantine(productId, opportunityId) {
  const dateRange = extractDateRange(); // Extract the date range from the page

  if (!dateRange) {
    console.error("Date range could not be extracted for quarantine check.");
    return Promise.resolve(0); // Return 0 if date range extraction fails
  }
  
  const { startDate, endDate } = dateRange;

  return getAPISettings().then(settings => {
    return fetch("https://api.current-rms.com/api/v1/availability/product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-TOKEN": settings.apiKey,
        "X-SUBDOMAIN": settings.subdomain
      },
      body: JSON.stringify({
        "booking_availability_view_options": {
          "product_id": productId,
          "store_ids": [1],
          "days_period": 1,
          "starts_at": startDate.toISOString(), // Convert to ISO string for the API call
          "ends_at": endDate.toISOString() // Convert to ISO string for the API call
        }
      })
    })
    .then(response => response.json())
    .then(data => {
      console.log("Full API response for quarantine check:", JSON.stringify(data, null, 2));

      if (data.product_bookings) {
        let quantitiesUnavailable = data.product_bookings.quantity_unavailable.map(q => parseFloat(q));

        // Adjust the array if start time is 12:00: remove the first 12 hourly values
        if (startDate.getHours() === 12) {
          quantitiesUnavailable = quantitiesUnavailable.slice(12);
        }
        // Adjust the array if end time is 12:00: remove the last 12 hourly values
        if (endDate.getHours() === 12) {
          quantitiesUnavailable = quantitiesUnavailable.slice(0, quantitiesUnavailable.length - 12);
        }

        // Get the highest value from the adjusted "quantity_unavailable" array
        const highestQuantityInQuarantine = quantitiesUnavailable.length > 0 
          ? Math.max(...quantitiesUnavailable) 
          : 0;

        return highestQuantityInQuarantine;
      } else {
        console.error("product_bookings data not found.");
        return 0;
      }
    })
    .catch(error => {
      console.error("Error fetching availability data:", error);
      return 0;
    });
  });
}
  
// Function to send shortages back to the opportunity
function postShortagesToOpportunity(opportunityNumber, shortages) {
  const now = new Date().toISOString(); // Current timestamp
  const requestBody = {
    "opportunity": {
      "custom_fields": {
        "shortages": shortages
          .replace(/<\/div>/gi, '\n')
          .replace(/<[^>]*>/g, '')
          .replace(/\s+\n/g, '\n')
          .trim(),
        "last_shortages_check": now
      }
    }
  };

  return getAPISettings().then(settings => {
    return fetch(`https://api.current-rms.com/api/v1/opportunities/${opportunityNumber}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-TOKEN": settings.apiKey,
        "X-SUBDOMAIN": settings.subdomain
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then(data => {
      console.log("Successfully updated opportunity with shortages data:", data);
    })
    .catch(error => {
      console.error("Error posting shortages to opportunity:", error);
    });
  });
}
  
// Function to fetch and log availability data with dynamic date range
function fetchAvailabilityWithDateRange(productId, opportunityId) {
  return new Promise(resolve => {
    const dateRange = extractDateRange();
  
    if (!dateRange) {
      console.error("Date range could not be extracted.");
      resolve({ lowestQuantityAvailable: "Unavailable", highestBookingQuantity: "N/A" });
      return;
    }
  
    const { startDate, endDate } = dateRange;
  
    console.log("Using Date Range - Start Date:", startDate, "End Date:", endDate);
  
    // Retrieve stored API details first
    getAPISettings().then(settings => {
      fetch("https://api.current-rms.com/api/v1/availability/product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AUTH-TOKEN": settings.apiKey,
          "X-SUBDOMAIN": settings.subdomain
        },
        body: JSON.stringify({
          "booking_availability_view_options": {
            "product_id": productId,
            "store_ids": [1],
            "days_period": 1,
            "starts_at": startDate,
            "ends_at": endDate
          }
        })
      })
      .then(response => response.json())
      .then(data => {
        console.log("Full API response for availability:", JSON.stringify(data, null, 2));
  
        if (data.product_bookings) {
          let quantityAvailableArray = data.product_bookings.quantity_available.map(Number);
          // Adjust if start time is 12:00 (drop first 12 hourly values)
          if (startDate.getHours() === 12) {
            quantityAvailableArray = quantityAvailableArray.slice(12);
          }
          // Adjust if end time is 12:00 (drop last 12 hourly values)
          if (endDate.getHours() === 12) {
            quantityAvailableArray = quantityAvailableArray.slice(0, quantityAvailableArray.length - 12);
          }
  
          const quantityAvailable = Math.min(...quantityAvailableArray);
          console.log("Lowest quantity available:", quantityAvailable);
  
          const booking = data.product_bookings.product_bookings.find(
            booking => booking.opportunity_id === opportunityId
          );
  
          if (booking) {
            console.log("Booking found for opportunity:", JSON.stringify(booking, null, 2));
  
            if (booking.booking_quantities && booking.booking_quantities.length > 0) {
              let bookingQuantitiesArray = booking.booking_quantities.map(q => parseFloat(q.store_quantity));
              if (startDate.getHours() === 12) {
                bookingQuantitiesArray = bookingQuantitiesArray.slice(12);
              }
              if (endDate.getHours() === 12) {
                bookingQuantitiesArray = bookingQuantitiesArray.slice(0, bookingQuantitiesArray.length - 12);
              }
              const highestBookingQuantity = Math.max(...bookingQuantitiesArray);
              console.log("Highest booking quantity for opportunity:", highestBookingQuantity);
              resolve({ lowestQuantityAvailable: quantityAvailable, highestBookingQuantity });
            } else {
              console.warn("No booking quantities found for the specified opportunity ID.");
              resolve({ lowestQuantityAvailable: quantityAvailable, highestBookingQuantity: "N/A" });
            }
          } else {
            console.warn("No booking entry found for the specified opportunity ID.");
            resolve({ lowestQuantityAvailable: quantityAvailable, highestBookingQuantity: "N/A" });
          }
        } else {
          console.error("product_bookings data not found.");
          resolve({ lowestQuantityAvailable: "Unavailable", highestBookingQuantity: "N/A" });
        }
      })
      .catch(error => {
        console.error("Error fetching availability data:", error);
        resolve({ lowestQuantityAvailable: "Unavailable", highestBookingQuantity: "N/A" });
      });
    });
  });
}
  
// Function to extract the date range from the page
function extractDateRange() {
  try {
      const startDateElement = document.evaluate("//span[text()='Start Date:']/following-sibling::span", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      const endDateElement = document.evaluate("//span[text()='End Date:']/following-sibling::span", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  
      if (startDateElement && endDateElement) {
          const startDateText = startDateElement.textContent.trim();
          const endDateText = endDateElement.textContent.trim();
  
          console.log("Found Start Date Text:", startDateText);
          console.log("Found End Date Text:", endDateText);
  
          const parseDate = (dateStr) => {
              const [datePart, timePart] = dateStr.split(' ');
              const [day, month, year] = datePart.split('/').map(Number);
              const [hours, minutes] = timePart.split(':').map(Number);
              return new Date(year, month - 1, day, hours, minutes);
          };
  
          const startDate = parseDate(startDateText);
          const endDate = parseDate(endDateText);
  
          if (!isNaN(startDate) && !isNaN(endDate)) {
              console.log("Parsed Start Date:", startDate);
              console.log("Parsed End Date:", endDate);
              return { startDate, endDate };
          } else {
              console.error("Failed to parse dates.");
          }
      } else {
          console.error("Start Date or End Date text not found on the page.");
      }
  } catch (error) {
      console.error("Error extracting date range:", error);
  }
  return null;
}
  
// Function to display data in a popup
function displayPopup(content) {
  const modal = document.createElement('div');
  modal.id = 'shortages-popup';
  modal.style.position = 'fixed';
  modal.style.top = '50%';
  modal.style.left = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
  modal.style.backgroundColor = '#fff';
  modal.style.border = '2px solid #333';
  modal.style.padding = '25px';
  modal.style.width = '550px';
  modal.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.2)';
  modal.style.borderRadius = '8px';
  modal.style.zIndex = '9999';
  modal.style.fontFamily = 'Arial, sans-serif';
  modal.style.textAlign = 'center';

  // --- Insert shortages styling (NEW) ---
  const style = document.createElement('style');
  style.textContent = `
    .shortage-row {
      margin-bottom: 6px;
    }
    .quarantine-row {
      background-color: #fff8dc;
      padding: 4px;
      border-radius: 4px;
    }
    .quarantine-badge {
      display: inline-block;
      padding: 2px 6px;
      background-color: #ffeb3b;
      color: #000;
      border-radius: 4px;
      font-weight: bold;
      font-size: 11px;
      margin-left: 6px;
    }
  `;
  document.head.appendChild(style);

  const modalHeading = document.createElement('h2');
  modalHeading.textContent = 'Shortages List';
  modalHeading.style.marginBottom = '15px';
  modalHeading.style.fontSize = '22px';
  modalHeading.style.fontWeight = '700';
  modalHeading.style.color = '#000';
  modalHeading.style.borderBottom = '1px solid #ddd';
  modalHeading.style.paddingBottom = '10px';
  modal.appendChild(modalHeading);

  // Scrollable content with shortages list
  const modalContent = document.createElement('div');
  modalContent.style.maxHeight = '300px';
  modalContent.style.overflowY = 'auto';
  modalContent.style.fontSize = '12px';
  modalContent.style.color = '#555';
  modalContent.style.lineHeight = '1.5';
  modalContent.style.textAlign = 'left';

  const contentText = document.createElement('p');
  contentText.innerHTML = content.replace(/\n/g, '<br>');

  // Add spinner and animation CSS if content includes "Please wait"
  if (content.includes('Please wait')) {
    contentText.style.textAlign = 'center';

    const spinner = document.createElement('div');
    spinner.className = 'shortage-spinner';
    spinner.style.margin = '15px auto 10px';
    spinner.style.display = 'block';
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.border = '6px solid #f3f3f3';
    spinner.style.borderTop = '6px solid #555';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'spin 1s linear infinite';
    contentText.appendChild(spinner);

    const styleSpin = document.createElement('style');
    styleSpin.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleSpin);
  }

  modalContent.appendChild(contentText);
  modal.appendChild(modalContent);

  // Close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.marginTop = '20px';
  closeButton.style.backgroundColor = '#4CAF50';
  closeButton.style.color = '#fff';
  closeButton.style.border = 'none';
  closeButton.style.padding = '10px 20px';
  closeButton.style.fontSize = '16px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.borderRadius = '4px';
  closeButton.onclick = () => modal.remove();
  modal.appendChild(closeButton);

  // Copy button
  const copyButton = document.createElement('button');
  copyButton.textContent = 'Copy';
  copyButton.style.marginTop = '20px'; // Adjust margin for space
  copyButton.style.marginLeft = '10px'; // Space between buttons
  copyButton.style.backgroundColor = '#007BFF';
  copyButton.style.color = '#fff';
  copyButton.style.border = 'none';
  copyButton.style.padding = '10px 20px';
  copyButton.style.fontSize = '16px';
  copyButton.style.cursor = 'pointer';
  copyButton.style.borderRadius = '4px';

  // Implement the copy functionality here
  copyButton.onclick = () => {
      // Extract text from each shortage row, join with newlines
      const lines = Array.from(contentText.querySelectorAll('.shortage-row')).map(div => div.textContent.trim());
      const plainText = lines.join('\n');
      const textarea = document.createElement('textarea');
      textarea.value = plainText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('Copied to clipboard!');
  };

  modal.appendChild(copyButton);
  document.body.appendChild(modal);
  console.log("Shortages popup displayed.");
  return contentText;
}

});







//
// ── Gate each module on its stored toggle ───────────────────────────────────
chrome.storage.sync.get({
  enableMessageBox:      true,
  enableShortages:       true,
  enableSuppliers:       true,
  enableHideOrangeLines: false
}, ({ enableMessageBox, enableShortages, enableSuppliers, enableHideOrangeLines }) => {



    // 4) Hide orange‐highlighted rows
    if (enableHideOrangeLines) {
      document.querySelectorAll('tr.item-price-below-cost').forEach(row => {
        row.style.backgroundColor = 'inherit';
      });
    }











// ------------------------------------------------------------------------------------------------
// Mark PO as Sent (unified detail + print view, skip if already sent, poll for discussions/print-tab)
// ------------------------------------------------------------------------------------------------
(async () => {
  // ── helper to fetch the detail page and detect real “Mark as sent” link ─────────────────────────
  async function hasMarkAsSentLink(poId) {
    const resp = await fetch(`${window.location.origin}/purchase_orders/${poId}`, { credentials: 'include' });
    if (!resp.ok) throw new Error(`Failed to fetch detail page: ${resp.status}`);
    const html = await resp.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    return !!doc.querySelector('a[data-method="post"][href*="/mark_as_sent"]');
  }

  // ── helper to click “mark as sent” inside a hidden iframe ───────────────────────────────────────
  function markPOAsSent(poId) {
    const src = `${window.location.origin}/purchase_orders/${poId}${window.location.search}`;
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, {
        position: 'absolute', top: '-9999px', left: '-9999px',
        width: '1px', height: '1px'
      });
      document.documentElement.appendChild(iframe);

      iframe.onload = () => {
        try {
          const win = iframe.contentWindow;
          win.document.querySelectorAll('[data-confirm]').forEach(e => e.removeAttribute('data-confirm'));
          win.confirm = () => true;
          const link = win.document.querySelector('a[data-method="post"][href*="/mark_as_sent"]');
          if (!link) throw new Error('Link not found in iframe');
          link.click();
          setTimeout(() => iframe.remove(), 200);
          resolve();
        } catch (err) {
          iframe.remove();
          reject(err);
        }
      };
      iframe.onerror = e => { iframe.remove(); reject(e); };
      iframe.src = src;
    });
  }

  // ── build & show the modal ──────────────────────────────────────────────────────────────────────
  function showModal(poId) {
    if (document.getElementById('__po_sent_overlay')) return; // already shown

    const overlay = document.createElement('div');
    overlay.id = '__po_sent_overlay';
    Object.assign(overlay.style, {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
      background: '#fff', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      width: '320px', maxWidth: '90%', fontFamily: '"Open Sans",Arial,sans-serif',
      color: '#333', overflow: 'hidden'
    });

    const header = document.createElement('div');
    header.textContent = 'Discussion Detected';
    Object.assign(header.style, {
      backgroundColor: '#f5f5f5', padding: '12px 16px',
      fontSize: '1.1em', fontWeight: 'bold', borderBottom: '1px solid #ddd',
      textAlign: 'center'
    });

    const body = document.createElement('div');
    body.innerHTML = '<p style="margin:16px;line-height:1.4;text-align:center;">Mark purchase order as sent?</p>';

    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display: 'flex', justifyContent: 'space-around',
      padding: '12px', background: '#fafafa', borderTop: '1px solid #ddd'
    });

    function makeBtn(txt, bg) {
      const b = document.createElement('button');
      b.textContent = txt;
      Object.assign(b.style, {
        padding: '8px 16px', border: 'none', borderRadius: '4px',
        cursor: 'pointer', fontSize: '0.95em', fontWeight: 'bold',
        backgroundColor: bg, color: '#fff'
      });
      return b;
    }

    const btnCancel = makeBtn('Cancel', '#6c757d');
    const btnYes    = makeBtn('Yes, mark sent', '#28a745');

    btnCancel.addEventListener('click', () => overlay.remove());
    btnYes.addEventListener('click', async () => {
      overlay.remove();
      try {
        await markPOAsSent(poId);
        // flash the “Number” field green
        const dt = Array.from(document.querySelectorAll('.group-side-content dt'))
                        .find(d => d.textContent.trim() === 'Number');
        if (dt && dt.nextElementSibling) {
          Object.assign(dt.nextElementSibling.style, {
            backgroundColor: '#28a745', color: '#fff',
            padding: '2px 6px', borderRadius: '4px'
          });
        }
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        console.error('❌ mark as sent failed:', err);
        alert('Failed: ' + err.message);
      }
    });

    footer.append(btnCancel, btnYes);
    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);
  }

  // ── main polling logic ─────────────────────────────────────────────────────────────────────
  const m = window.location.pathname.match(/\/purchase_orders\/(\d+)/);
  if (!m) return;
  const poId = m[1];

  // bail early if there is absolutely no “Mark as sent” link on detail page
  try {
    const hasLink = await hasMarkAsSentLink(poId);
    if (!hasLink) {
      console.log('ℹ️ PO already sent (no mark_as_sent link) — skipping modal.');
      return;
    }
  } catch (err) {
    console.warn('⚠️ could not verify mark_as_sent link:', err);
    // proceed anyway
  }

  let tries = 0;
  const poll = setInterval(() => {
    tries++;

    // detail-view: any discussion rows?
    const hasDetailRows = document.querySelectorAll('.table-responsive.discussions tbody tr').length > 0;

    // print-view: that blue toggle only appears when there's a discussion tab
    const hasPrintTab =
      !!document
        .querySelector('#discussion_buttons')
        ?.querySelector('.btn.btn-primary.dropdown-toggle');

    if (hasDetailRows || hasPrintTab) {
      clearInterval(poll);
      console.log('✅ Discussion detected — showing modal');
      showModal(poId);
    }
    else if (tries > 20) {
      clearInterval(poll);
      console.warn('⚠️ gave up after 20 tries — no discussions/tab found');
    }
  }, 500);
})();

  }

);






//
// ── Optional Accessories Module  ─────────────────────────────────────────────────
//

chrome.storage.sync.get({
  enableOptionalAccessories: true
}, ({ enableOptionalAccessories }) => {
  if (!enableOptionalAccessories) return;




// Function to create and play a subtle, low-pitched click sound
function playSubtleClick() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
  gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.03);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.03);
}

// Function to show a custom popup and open accessories at the same time
function showOptionalAccessoriesPopup(itemRow) {
  let toast = document.createElement('div');
  toast.innerText = "This item has optional accessories.";
  toast.style.position = 'fixed';
  toast.style.top = '50%';
  toast.style.left = '50%';
  toast.style.transform = 'translate(-50%, -50%)';
  toast.style.backgroundColor = '#333';
  toast.style.color = '#fff';
  toast.style.padding = '30px 50px';
  toast.style.borderRadius = '10px';
  toast.style.zIndex = '9999';
  toast.style.fontSize = '18px';
  toast.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.3)';
  document.body.appendChild(toast);

  playSubtleClick();

  setTimeout(() => {
      toast.remove();
  }, 3000);

  let showAccessoriesLink = itemRow.querySelector('a.picker-show-accessories');
  if (showAccessoriesLink) {
      console.log("Clicking Show Accessories link");
      showAccessoriesLink.click();
  } else {
      console.log("Show Accessories link not found");
  }

  // Disable the "Add" button for 2 seconds
  const addButton = document.querySelector('input.btn.btn-success.pull-right');  // Targeting the "Add" button by class
  if (addButton) {
    console.log("Add button found and will be disabled");  // Debugging to verify button selection
    addButton.disabled = true;
    setTimeout(() => {
      addButton.disabled = false;
      console.log("Add button re-enabled");  // Debugging to confirm re-enable
    }, 2000);
  } else {
    console.log("Add button not found");  // If selector is incorrect, this will help debug
  }
}

// The rest of the code remains unchanged...

// Function to change background colors based on accessory type
function changeAccessoryBackgroundColor() {
  let accessoryRows = document.querySelectorAll('.quickpick-accessory-row');

  accessoryRows.forEach(row => {
      if (row.innerText.includes("Optional")) {
          row.style.backgroundColor = '#ffeb3b';
      } else {
          row.style.backgroundColor = '';
      }
  });

  console.log("Accessory row background colors updated based on type.");
}

// Function to attach event listeners to visible quantity input fields
function attachListeners() {
  document.querySelectorAll('input[type="number"]:not([hidden])').forEach(input => {
      if (!input.dataset.listenerAttached && input.offsetParent !== null) {
          input.dataset.listenerAttached = true;

          if (typeof input.dataset.popupShown === 'undefined') {
              input.dataset.popupShown = "false";
          }

          input.addEventListener('input', debounce(function() {
              if (input.dataset.popupShown === "true") {
                  console.log("Popup already shown for this item. Skipping.");
                  return;
              }

              if (input.value !== "" && input.value !== "0") {
                  console.log("Quantity input changed!");

                  let itemRow = input.closest('tr');
                  console.log("Item row found:", itemRow);

                  if (itemRow) {
                      let optionalCell = Array.from(itemRow.querySelectorAll('td')).find(td => td.innerText.toLowerCase().includes("optional accessories"));
                      if (optionalCell) {
                          console.log("Optional accessory found: true");
                          showOptionalAccessoriesPopup(itemRow);

                          input.dataset.popupShown = "true";
                      } else {
                          console.log("Optional accessory found: false");
                      }
                  }
              }
          }, 100));
      }
  });
}

// Debounce function to delay the popup until the user finishes typing
function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Function to reset the popup shown flag only for new products
function resetPopupFlags() {
  document.querySelectorAll('input[type="number"]:not([hidden])').forEach(input => {
      if (typeof input.dataset.popupShown === 'undefined') {
          input.dataset.popupShown = "false";
          console.log("Popup flag reset for new input:", input);
      }
  });
}

// Function to observe DOM changes and handle new inputs or products being added
function observeDOMChanges() {
  const targetNode = document.querySelector('#quickpick_table tbody');
  
  if (targetNode) {
      console.log("Found target node for MutationObserver.");

      const observer = new MutationObserver(mutations => {
          mutations.forEach(mutation => {
              if (mutation.addedNodes.length) {
                  resetPopupFlags();
                  attachListeners();
                  changeAccessoryBackgroundColor();
                  console.log("Listeners reattached and accessory colors updated after DOM mutation.");
              }
          });
      });
      
      observer.observe(targetNode, { childList: true, subtree: true });
      attachListeners();
      changeAccessoryBackgroundColor();
  } else {
      console.log("Target node not found, retrying...");
      setTimeout(observeDOMChanges, 1000);
  }
}

// Polling function to continuously check and re-attach MutationObserver
function pollingFallback() {
  setInterval(() => {
      const targetNode = document.querySelector('#quickpick_table tbody');
      if (targetNode && !targetNode.dataset.observerAttached) {
          console.log("Polling detected target node, re-attaching observer.");
          targetNode.dataset.observerAttached = true;
          observeDOMChanges();
      }
  }, 2000);
}

// Start observing and polling as a fallback
observeDOMChanges();
pollingFallback();


});








// ── Volume Module ──────────────────────────────────────────────────────────────
function runVolumeModule(settings) {
  (async function listVolumesWithCache() {
    const API_TOKEN     = settings.apiKey;
    const API_SUBDOMAIN = settings.subdomain;
    const PER_PAGE      = 100;

    // 1) Get Opportunity ID from URL
    const m = location.pathname.match(/opportunities\/(\d+)/);
    if (!m) return console.error('Couldn’t parse opportunity ID');
    const oppId = m[1];
    const storageKey = `volume_total_${oppId}`;

    // ---- Inject "Total Volume" Row (with cached value if available) ----
    function injectTotalVolumeRow() {
      const weightLi = document.getElementById('weight_total')?.closest('li');
      if (!weightLi) return;

      if (document.getElementById('volume_total')) return; // Already exists

      const labelSpan = weightLi.querySelector('span:not([id])');
      const labelW = getComputedStyle(labelSpan).width;

      const li = document.createElement('li');
      li.classList.add('volume-injected');
      li.innerHTML = `
        <span class="detail-label" style="display:inline-block;width:${labelW};">
          Total Volume:
        </span>
        <span id="volume_total">${sessionStorage.getItem(storageKey) || '…'} m³</span>
      `;
      weightLi.after(li);
      console.log('✅ “Total Volume” row injected');
    }

    // Initial inject
    injectTotalVolumeRow();

    // Observer to re-inject only if missing
    const observer = new MutationObserver(() => {
      if (!document.getElementById('volume_total')) {
        injectTotalVolumeRow();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 2) Build or load productVolumeMap
    let productVolumeMap = window.productVolumeMap;
    if (!productVolumeMap) {
      const saved = localStorage.getItem('productVolumeMap');
      if (saved) {
        productVolumeMap = JSON.parse(saved);
        console.log('♻️ Loaded productVolumeMap from localStorage');
      }
    }
    if (!productVolumeMap) {
      productVolumeMap = {};
      let page = 1;
      while (true) {
        const url = `https://api.current-rms.com/api/v1/products?page=${page}&per_page=${PER_PAGE}&filtermode=all`;
        const res = await fetch(url, {
          headers: {
            'Content-Type':  'application/json',
            'X-AUTH-TOKEN':  API_TOKEN,
            'X-SUBDOMAIN':   API_SUBDOMAIN
          }
        });
        if (!res.ok) break;
        const body = await res.json();
        const prods = body.data || body.products || [];
        if (!prods.length) break;
        prods.forEach(p => {
          productVolumeMap[p.id] = p.custom_fields?.equipment_volume_m3 || 0;
        });
        page++;
      }
      window.productVolumeMap = productVolumeMap;
      localStorage.setItem('productVolumeMap', JSON.stringify(productVolumeMap));
      console.log('✅ Built and cached productVolumeMap for', Object.keys(productVolumeMap).length, 'products');
    }

    // 3) Fetch opportunity_items (with nested item)
    const itemsUrl = `https://api.current-rms.com/api/v1/opportunities/${oppId}/opportunity_items?include%5B%5D=item`;
    let records;
    try {
      const res = await fetch(itemsUrl, {
        headers: {
          'Content-Type':  'application/json',
          'X-AUTH-TOKEN':  API_TOKEN,
          'X-SUBDOMAIN':   API_SUBDOMAIN
        }
      });
      if (!res.ok) throw new Error(res.statusText);
      const body = await res.json();
      records = body.data || body.opportunity_items || [];
    } catch (err) {
      return console.error('Fetch failed:', err);
    }

    // 4) Calculate volume
    const tableData = records.map(r => {
      const pid = r.item_id;
      const vol = productVolumeMap[pid] || 0;
      return {
        name:             r.item?.name || '–',
        quantity:         r.quantity || 1,
        equipment_volume: vol,
        line_volume:      (vol * (r.quantity||1)).toFixed(2)
      };
    });
    console.table(tableData);

    const total = tableData.reduce((sum, row) => sum + parseFloat(row.line_volume), 0);
    const volumeSpan = document.getElementById('volume_total');
    if (volumeSpan) volumeSpan.textContent = total.toFixed(2) + ' m³';
    sessionStorage.setItem(storageKey, total.toFixed(2));
    console.log(`🔢 Total Volume = ${total.toFixed(2)} m³`);

  })();
}

// Gate on your stored toggle & settings
chrome.storage.sync.get({
  enableVolume: false,
  apiKey:       '',
  subdomain:    ''
}, ({ enableVolume, apiKey, subdomain }) => {
  if (!enableVolume) return;
  if (!apiKey || !subdomain) {
    console.warn('⏸ Volume module disabled: missing API key or subdomain.');
    return;
  }
  runVolumeModule({ apiKey, subdomain });
});










/* === Custom Message Box Plugin (Manual Button + Auto-Popup + Auto-Resizing) === */

chrome.storage.sync.get({ enableMessageBox: true }, ({ enableMessageBox }) => {
  if (!enableMessageBox) return;

/* === Custom Message Box Plugin (Manual Button + Auto-Popup + Auto-Resizing + Dynamic Button + Silent Close) === */

(async function initMessageBox() {
  // ---- Configuration & Utilities ----
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playSubtleClick() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.03);
  }

  function extractOpportunityId(url) {
    const m = url.match(/\/opportunities\/([^\/\?#]+)/);
    return m ? m[1] : null;
  }

  async function fetchDescription(id) {
    const res = await fetch(`/opportunities/${id}/edit`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Fetch edit failed: ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.querySelector('textarea#opportunity_description')?.value || '';
  }

  async function patchDescription(id, desc) {
    const csrf = document.querySelector('meta[name="csrf-token"]').content;
    await fetch(`/opportunities/${id}.json`, {
      method: 'PATCH', credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
        'Accept': 'application/json'
      },
      body: JSON.stringify({ opportunity: { description: desc } })
    });
  }

  // ---- Popup Delay Logic ----
  function shouldShowPopup(opId) {
    const lastId = localStorage.getItem('lastOpportunityId');
    const lastTime = parseInt(localStorage.getItem('lastPopupTime'), 10);
    const now = Date.now();
    if (lastId !== opId || !lastTime || now - lastTime > 3600000) {
      localStorage.setItem('lastOpportunityId', opId);
      localStorage.setItem('lastPopupTime', now);
      return true;
    }
    return false;
  }

  // ---- Auto-Popup on Load (only if non-empty) ----
  async function handleOpportunityPopup() {
    const id = extractOpportunityId(location.href);
    if (!id || !shouldShowPopup(id)) return;
    try {
      const messageText = (await fetchDescription(id)).trim();
      if (!messageText) return;
      setTimeout(() => {
        playSubtleClick();
        showPopup(messageText, id);
      }, 500);
    } catch (e) {
      console.error('[MB] could not fetch initial description:', e);
    }
  }

  // ---- Modal & Styles ----
  function injectStyles() {
    if (document.getElementById('mb-plugin-styles')) return;
    const css = `
      .mb-overlay { position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.3); z-index:9998; }
      .mb-modal { position: fixed; top:50%; left:50%; transform: translate(-50%,-50%); background: #fff; border:2px solid #333; padding:20px; width:90%; max-width:600px; box-shadow:0 4px 10px rgba(0,0,0,0.2); border-radius:6px; font-family:Arial,sans-serif; display:flex; flex-direction:column; z-index:9999; text-align:center; }
      .mb-modal h2 { margin:0 0 10px; }
      .mb-modal textarea {
        width:100%;
        height:auto;
        min-height: 300px;
        max-height: 800px;
        font-size:14px;
        padding:8px;
        box-sizing:border-box;
        border:1px solid #ccc;
        border-radius:6px;
        resize:none;
        overflow:auto;
        margin-bottom:10px;
        text-align: left;
        box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
      }
      .mb-modal textarea::placeholder { color:#888; }
      .mb-btn { padding:6px 20px; border:none; border-radius:6px; cursor:pointer; background:#4CAF50; color:#fff; font-size:14px; align-self:center; }
      .mb-btn:hover {
        background-color: #45a049;
      }
    `;
    const style = document.createElement('style');
    style.id = 'mb-plugin-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function showPopup(text, id) {
    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'mb-overlay';

    const modal = document.createElement('div');
    modal.className = 'mb-modal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','mb-title');

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    const h2 = document.createElement('h2');
    h2.id = 'mb-title';
    h2.textContent = 'Message Box';
    modal.appendChild(h2);

    // Add horizontal rule after heading
    const hr = document.createElement('hr');
    hr.style.margin = '10px 0';
    hr.style.border = 'none';
    hr.style.borderTop = '1px solid #ccc';
    modal.appendChild(hr);

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.placeholder = 'Enter your message reminders here…';
    modal.appendChild(ta);
    autoResize(ta);

    const btn = document.createElement('button');
    btn.className = 'mb-btn';
    let original = text;
    btn.textContent = 'Done';
    btn.title = 'Save changes and close';
    modal.appendChild(btn);

    ta.addEventListener('input', () => {
      autoResize(ta);
      btn.textContent = (ta.value.trim() === original.trim()) ? 'Done' : 'Save';
    });

    ta.focus();
    function handleKey(e) {
      if (e.key === 'Escape') cleanup();
      if (e.key === 'Tab') { e.preventDefault(); btn.focus(); }
    }
    document.addEventListener('keydown', handleKey);

    function cleanup() {
      document.removeEventListener('keydown', handleKey);
      overlay.remove();
      modal.remove();
    }

    btn.onclick = async () => {
      if (btn.textContent === 'Save') {
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
          await patchDescription(id, ta.value);
        } catch (e) {
          console.warn('[MB] patch error', e);
        }
        cleanup();
        location.reload();
      } else {
        cleanup();
      }
    };
  }

// ---- Resilient Message Box injection ----
function injectMessageBoxButton() {
  const hdr = Array.from(document.querySelectorAll('.group-side-content h3'))
    .find(h3 => h3.textContent.trim() === 'Actions');
  if (!hdr) return;

  let ul = hdr.nextElementSibling;
  while (ul && ul.tagName !== 'UL') ul = ul.nextElementSibling;
  if (!ul) return;

  // avoid double-inject
  if (ul.querySelector('.mb-injected')) return;

  // find the anchor item
  let orig = Array.from(ul.children)
    .find(li => li.textContent.trim().startsWith('Shortages List'));
  if (!orig) {
    orig = Array.from(ul.children)
      .find(li => li.textContent.trim().startsWith('Availability'));
  }
  if (!orig) return;

  // clone and insert
  const li = orig.cloneNode(false);
  li.classList.add('mb-injected');
  const ic = orig.querySelector('i');
  if (ic) li.appendChild(ic.cloneNode(false));
  li.appendChild(document.createTextNode(' Message Box'));
  li.style.cursor = 'pointer';
  li.title = 'Open Message Box';

  // **Actual** popup logic:
  li.addEventListener('click', async () => {
    try {
      playSubtleClick();  // your subtle click sound
      const id = extractOpportunityId(window.location.href);
      if (!id) throw new Error('No opportunity ID in URL');
      const text = await fetchDescription(id);
      showPopup(text, id);
    } catch (err) {
      console.error('[MB] popup error:', err);
    }
  });

  ul.insertBefore(li, orig);
}

// initial injection
injectMessageBoxButton();

// watch for DOM changes and re-inject if needed
new MutationObserver(injectMessageBoxButton)
  .observe(document.body, { childList: true, subtree: true });



  // ---- Auto-Popup on Load ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(handleOpportunityPopup, 300));
  } else {
    setTimeout(handleOpportunityPopup, 300);
  }
})();

});