// content.js

console.log('Custom content script loaded.');





//
// ── Message Box Popup Module ─────────────────────────────────────────────────
//

// Play a subtle click sound
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

// Show the message-box popup
function showPopup(message) {
  console.log("Creating message box...");
  const modal = document.createElement('div');
  Object.assign(modal.style, {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#fff', border: '2px solid #333',
    padding: '25px', width: '400px',
    boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
    borderRadius: '8px', zIndex: '9999',
    fontFamily: 'Arial, sans-serif', textAlign: 'center'
  });

  const heading = document.createElement('h2');
  heading.textContent = 'Message Box';
  Object.assign(heading.style, {
    marginBottom: '15px', fontSize: '20px',
    color: '#333', borderBottom: '1px solid #ddd',
    paddingBottom: '10px'
  });
  modal.appendChild(heading);

  const content = document.createElement('p');
  content.innerHTML = message.replace(/\n/g, '<br>');
  Object.assign(content.style, {
    fontSize: '16px', color: '#555', lineHeight: '1.5'
  });
  modal.appendChild(content);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  Object.assign(closeBtn.style, {
    marginTop: '20px', backgroundColor: '#4CAF50',
    color: '#fff', border: 'none', padding: '10px 20px',
    fontSize: '16px', cursor: 'pointer', borderRadius: '4px'
  });
  closeBtn.onclick = () => modal.remove();
  modal.appendChild(closeBtn);

  document.body.appendChild(modal);
}

// Extract opportunity ID from URL
function extractOpportunityId(url) {
  const match = url.match(/\/opportunities\/(\d+)/);
  return match ? match[1] : null;
}

// Handle showing the message-box once per opportunity
function handleOpportunityPopup() {
  const id = extractOpportunityId(window.location.href);
  if (!id) return console.log("No opportunity ID found in URL.");

  const lastId = sessionStorage.getItem('lastOpportunityId');
  if (lastId === id) return console.log("Message box already shown for this opportunity.");

  const msgEl = document.querySelector('.expand-box-container p');
  if (!msgEl) return console.error("Message element not found.");

  const text = msgEl.textContent.trim();
  console.log("Extracted message:", text);

  setTimeout(() => {
    playSubtleClick();
    showPopup(text);
  }, 500);

  sessionStorage.setItem('lastOpportunityId', id);
}





//
// ── Shortages Module  ─────────────────────────────────────────────────
//

// Helper: Retrieve API settings from chrome.storage
function getAPISettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      apiKey: '',         // Stored API Key
      subdomain: 'clearsound'  // Stored subdomain (if you want a default, otherwise leave empty)
    }, function(items) {
      resolve(items);
    });
  });
}

// Function to fetch shortages data and display it in a popup
function fetchShortagesAndDisplay() {
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
        displayPopup("No shortages data found.");
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

          // Prepare the content with quarantine notice and correct quantity
          const shortagesContent = Object.values(uniqueItems).map(item => {
            const quarantineNotice = item.quarantineQuantity > 0 
              ? ` <span style="background-color: yellow; color: black;">**Quarantine x ${item.quarantineQuantity}**</span>` 
              : '';
            return `${item.name} x ${item.available}${quarantineNotice}`;
          }).join("<br>");

          displayPopup(shortagesContent);
          // Send the shortages back to the opportunity
          postShortagesToOpportunity(opportunityNumber, shortagesContent);
        });
      });
    })
    .catch(error => {
      console.error("Error fetching shortages:", error);
      displayPopup("Error fetching shortages data.");
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
        "shortages": shortages,
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
  
  const modalHeading = document.createElement('h2');
  modalHeading.textContent = 'Shortages List';
  modalHeading.style.marginBottom = '15px';
  modalHeading.style.fontSize = '20px';
  modalHeading.style.color = '#333';
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
      // Replace <br> with newline and remove HTML tags
      const plainText = content.replace(/<br>/g, '\n').replace(/<[^>]*>/g, '');
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
}



//
// ── Gate each module on its stored toggle ───────────────────────────────────
chrome.storage.sync.get({
  enableMessageBox:      true,
  enableShortages:       true,
  enableSuppliers:       true,
  enableHideOrangeLines: false
}, ({ enableMessageBox, enableShortages, enableSuppliers, enableHideOrangeLines }) => {

  if (enableMessageBox && !window.location.search.includes('view=c')) {
    handleOpportunityPopup();
  }

    // 4) Hide orange‐highlighted rows
    if (enableHideOrangeLines) {
      document.querySelectorAll('tr.item-price-below-cost').forEach(row => {
        row.style.backgroundColor = 'inherit';
      });
    }

  if (enableShortages) {
    // inject “Shortages List” button
    ;(function(){
      const actionsHeader = Array.from(document.querySelectorAll('.group-side-content h3'))
        .find(h3 => h3.textContent.trim() === 'Actions');
      if (!actionsHeader) return console.warn('Actions header not found');
      let ul = actionsHeader.nextElementSibling;
      while (ul && ul.tagName !== 'UL') ul = ul.nextElementSibling;
      if (!ul) return console.warn('Actions UL not found');

      const availabilityLi = Array.from(ul.children)
        .find(li => li.textContent.trim().startsWith('Availability'));
      if (!availabilityLi) return console.warn('Availability item not found');

      const newLi = availabilityLi.cloneNode(false);
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
    })();
  }

  if (enableSuppliers) {
    // inject Suppliers module

// SUPLLIERS TAB
(async () => {
  const isCostings = window.location.search.includes('view=c');
  const params     = new URLSearchParams(window.location.search);
  const supplierIn = params.get('supplier');
  const basePath   = window.location.pathname.split('?')[0];
  const baseUrl    = `${window.location.origin}${basePath}`;

  // ── Helper: click “Mark as sent” via hidden iframe, removing data-confirm ──
  function markPOAsSent(poId) {
    const search = window.location.search; // preserve ?rp=… etc
    const src    = `${window.location.origin}/purchase_orders/${poId}${search}`;

    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px';
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          const win = iframe.contentWindow;
          const doc = win.document;

          // strip out any data-confirm attributes so Rails UJS won't pop
          doc.querySelectorAll('[data-confirm]').forEach(el => el.removeAttribute('data-confirm'));

          // now find & click the “mark as sent” link
          const link = doc.querySelector('a[data-method="post"][href*="/mark_as_sent"]');
          if (!link) throw new Error('Link not found in PO page');
          link.click();

          console.log(`✅ PO #${poId} “Mark as sent” clicked.`);
          cleanup();
          resolve();
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      iframe.onerror = err => {
        cleanup();
        reject(err);
      };

      function cleanup() {
        setTimeout(() => iframe.remove(), 200);
      }

      iframe.src = src;
    });
  }

  if (!isCostings) {
    // 1) Fetch & parse view=c
    const resp = await fetch(`${baseUrl}?view=c`, { credentials: 'same-origin' });
    if (!resp.ok) { console.error(`Fetch failed: ${resp.status}`); return; }
    const html = await resp.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');

    // 2) Scrape suppliers → {poText, poHref, badgeClasses}
    const map = {};
    doc.querySelectorAll('table.table-hover tbody tr').forEach(tr => {
      const sup = tr.querySelector('td.optional-01.asset.asset-column')?.textContent.trim();
      if (!sup ||
         ['Bulk Stock','Non-Stock Booking','Group Booking','******CLEARSOUND STOCK******',
          'Dan Ridd','Liam Murphy','Rob Burton','Daniel Gibbs','CA24 BDV PEUGEOT BOXER 3.5T VAN']
           .includes(sup)
      ) return;

      const poCell = tr.querySelector('td.optional-04.purchase-order-column');
      let poText = '', poHref = '', badgeClasses = [];
      if (poCell) {
        const badge = poCell.firstElementChild;
        if (badge) {
          const a = badge.tagName.toLowerCase() === 'a' ? badge : badge.querySelector('a');
          if (a) { poText = a.textContent.trim(); poHref = a.href; }
          badgeClasses = Array.from(badge.classList);
        }
      }
      if (!map[sup]) map[sup] = { poText, poHref, badgeClasses };
    });

    const suppliers = Object.entries(map);
    if (!suppliers.length) { console.log('ℹ️ No suppliers to show.'); return; }

    // 3) Ensure “Suppliers” panel exists (after Scheduling)
    let supDiv = [...document.querySelectorAll('.group-side-content')].find(d =>
      d.querySelector('h3')?.textContent.trim() === 'Suppliers'
    );
    if (!supDiv) {
      const sched = [...document.querySelectorAll('.group-side-content')].find(d =>
        d.querySelector('h3')?.textContent.trim() === 'Scheduling'
      );
      if (!sched) { console.error('Cannot find Scheduling section'); return; }
      supDiv = document.createElement('div');
      supDiv.className = 'group-side-content';
      supDiv.innerHTML = '<h3>Suppliers</h3>';
      sched.parentNode.insertBefore(supDiv, sched.nextSibling);
    }

    // 4) Render list with your colour logic
    supDiv.querySelector('ul.subhire-list')?.remove();
    const ul = document.createElement('ul');
    ul.className = 'subhire-list';
    ul.style.paddingLeft = '1em';

    suppliers.forEach(([sup, {poText, poHref, badgeClasses}]) => {
      const li = document.createElement('li');
      li.textContent = sup + ' — ';

      const a = document.createElement('a');
      Object.assign(a.style, {
        padding:        '2px 6px',
        borderRadius:   '4px',
        fontSize:       '0.9em',
        fontWeight:     'bold',
        marginLeft:     '4px',
        display:        'inline-block',
        color:          'white',
        textDecoration: 'none',
        cursor:         poText ? 'pointer' : 'default'
      });
      a.target = '_blank';

      if (poText) {
        a.textContent = `PO #${poText}`;
        a.href        = poHref;
        // original green → orange; else (blue/black) → green
        const origIsGreen = badgeClasses.some(c => /success|green/i.test(c));
        a.style.backgroundColor = origIsGreen ? 'orange' : 'green';
      } else {
        a.textContent = 'No PO';
        a.href        = `${baseUrl}?sort=stock_category&view=c&supplier=${encodeURIComponent(sup)}`;
        a.style.backgroundColor = 'red';
      }

      li.appendChild(a);
      ul.appendChild(li);
    });

    supDiv.appendChild(ul);
    console.log(`✅ Injected ${suppliers.length} suppliers with updated PO colours.`);

    // ── Right‐click handler to show “Mark as sent” popup ────────────────────
    document.body.addEventListener('contextmenu', ev => {
      const link = ev.target.closest('.subhire-list a[href*="/purchase_orders/"]');
      if (!link || link.textContent.startsWith('No PO')) return;
      ev.preventDefault();

      // remove old popups
      document.querySelectorAll('.__po-sent-popup').forEach(x => x.remove());

      // create popup over mouse
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

      // cleanup on next click/scroll
      const cleanup = () => box.remove();
      setTimeout(() => {
        document.addEventListener('click', cleanup, { once: true });
        window.addEventListener('scroll', cleanup, { once: true });
      }, 10);

      // when clicked, fire the iframe helper
      box.addEventListener('click', () => {
        cleanup();
        const m = link.href.match(/\/purchase_orders\/(\d+)/);
        if (!m) return console.error('❌ Could not parse PO ID');
        const poId = m[1];
        link.style.opacity = '0.6';
        markPOAsSent(poId)
          .then(() => link.style.backgroundColor = 'green')
          .catch(err => console.error(`❌ PO #${poId} failed:`, err))
          .finally(() => link.style.opacity = '');
      });
    });

  } else {
    // Auto‐select on costings page
    let count = 0;
    document.querySelectorAll('table.table-hover tbody tr').forEach(tr => {
      const name = tr.querySelector('td.optional-01.asset.asset-column')?.textContent.trim();
      if (name === supplierIn) {
        const cb = tr.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) { cb.click(); count++; }
      }
    });
    console.log(`✔️ Auto‐selected ${count} row${count===1?'':'s'} for “${supplierIn}.”`);
  }
})();





//Mark PO as Sent
(async () => {
  // ── 0) globally disable Rails’ data-confirm on the real “Mark as sent” link ──
  const realLink = document.querySelector('a[data-method="post"][href*="/mark_as_sent"]');
  if (realLink) {
    realLink.removeAttribute('data-confirm');
    if (window.Rails && typeof window.Rails.confirm === 'function') {
      window.Rails.confirm = () => true;
    }
    window.confirm = () => true;
  }

  // ── 1) Helper: fully-automate “Mark as sent” by loading the PO in a hidden iframe ──
  function markPOAsSent(poId) {
    const search = window.location.search; // preserve any ?rp=…
    const src    = `${window.location.origin}/purchase_orders/${poId}${search}`;
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:1px;height:1px';
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          const win  = iframe.contentWindow;
          // inside iframe also strip any data-confirm before clicking
          win.document.querySelectorAll('a[data-confirm]').forEach(el => el.removeAttribute('data-confirm'));
          win.confirm = () => true;
          const link = win.document.querySelector('a[data-method="post"][href*="/mark_as_sent"]');
          if (!link) throw new Error('Link not found in iframe');
          link.click();
          console.log(`✅ PO #${poId} “Mark as sent” clicked.`);
          cleanup();
          resolve();
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      iframe.onerror = err => {
        cleanup();
        reject(err);
      };

      function cleanup() {
        setTimeout(() => iframe.remove(), 200);
      }

      iframe.src = src;
    });
  }

  // ── 2) Opportunity page: inject Suppliers list (unchanged colour logic) ──
  const isCostings = window.location.search.includes('view=c');
  if (!isCostings) {
    const basePath = window.location.pathname.split('?')[0];
    const baseUrl  = `${window.location.origin}${basePath}`;
    const resp = await fetch(`${baseUrl}?view=c`, { credentials: 'same-origin' });
    if (resp.ok) {
      const html = await resp.text();
      const doc  = new DOMParser().parseFromString(html,'text/html');
      const map = {};
      doc.querySelectorAll('table.table-hover tbody tr').forEach(tr => {
        const sup = tr.querySelector('td.optional-01.asset.asset-column')?.textContent.trim();
        if (!sup || ['Bulk Stock','Non-Stock Booking','Group Booking','******CLEARSOUND STOCK******',
                     'Dan Ridd','Liam Murphy','Rob Burton','Daniel Gibbs'].includes(sup)) return;
        const poCell = tr.querySelector('td.optional-04.purchase-order-column');
        let poText='', poHref='', badgeClasses=[];
        if (poCell) {
          const badge = poCell.firstElementChild;
          if (badge) {
            const a = badge.tagName.toLowerCase()==='a'? badge : badge.querySelector('a');
            if (a) { poText = a.textContent.trim(); poHref = a.href; }
            badgeClasses = Array.from(badge.classList);
          }
        }
        if (!map[sup]) map[sup] = { poText, poHref, badgeClasses };
      });

      const suppliers = Object.entries(map);
      if (suppliers.length) {
        let supDiv = [...document.querySelectorAll('.group-side-content')]
                     .find(d=>d.querySelector('h3')?.textContent.trim()==='Suppliers');
        if (!supDiv) {
          const sched = [...document.querySelectorAll('.group-side-content')]
                        .find(d=>d.querySelector('h3')?.textContent.trim()==='Scheduling');
          if (sched) {
            supDiv = document.createElement('div');
            supDiv.className='group-side-content';
            supDiv.innerHTML='<h3>Suppliers</h3>';
            sched.parentNode.insertBefore(supDiv,sched.nextSibling);
          }
        }
        if (supDiv) {
          supDiv.querySelector('ul.subhire-list')?.remove();
          const ul = document.createElement('ul');
          ul.className='subhire-list'; ul.style.paddingLeft='1em';
          suppliers.forEach(([sup,{poText,poHref,badgeClasses}])=>{
            const li=document.createElement('li');
            li.textContent = sup+' — ';
            const a=document.createElement('a');
            Object.assign(a.style,{padding:'2px 6px',borderRadius:'4px',fontSize:'0.9em',
              fontWeight:'bold',marginLeft:'4px',display:'inline-block',color:'white',
              textDecoration:'none',cursor: poText ? 'pointer' : 'default'});
            a.target='_blank';
            if (poText) {
              a.textContent=`PO #${poText}`; a.href=poHref;
              const origIsGreen = badgeClasses.some(c=>/success|green/i.test(c));
              a.style.backgroundColor = origIsGreen ? 'orange' : 'green';
            } else {
              a.textContent='No PO';
              a.href=`${baseUrl}?sort=stock_category&view=c&supplier=${encodeURIComponent(sup)}`;
              a.style.backgroundColor='red';
            }
            li.appendChild(a);
            ul.appendChild(li);
          });
          supDiv.appendChild(ul);
          console.log(`✅ Injected ${suppliers.length} suppliers.`);
        }
      }
    }
  }

  // ── 3) PO detail page: if there are discussions, show centered modal ──
  const m = window.location.pathname.match(/\/purchase_orders\/(\d+)/);
  if (!m) return;
  const poId = m[1];

  // only if the “Mark as sent” action really exists
  if (!document.querySelector('a[data-method="post"][href*="/mark_as_sent"]')) return;

  // only if there is at least one discussion row
  if (document.querySelectorAll('.table-responsive.discussions tbody tr').length === 0) return;

  // build full-page overlay
  const overlay = document.createElement('div');
  Object.assign(overlay.style,{
    position:'fixed',top:0,left:0,right:0,bottom:0,
    backgroundColor:'rgba(0,0,0,0.4)',
    display:'flex',alignItems:'center',justifyContent:'center',
    zIndex:10000
  });

  // modal container
  const modal = document.createElement('div');
  Object.assign(modal.style,{
    background:'#fff',borderRadius:'8px',boxShadow:'0 4px 16px rgba(0,0,0,0.2)',
    width:'320px',maxWidth:'90%',fontFamily:'"Open Sans",Arial,sans-serif',
    color:'#333',overflow:'hidden'
  });

  // header
  const header = document.createElement('div');
  header.textContent='Discussion Detected';
  Object.assign(header.style,{
    backgroundColor:'#f5f5f5',padding:'12px 16px',fontSize:'1.1em',
    fontWeight:'bold',borderBottom:'1px solid #ddd',textAlign:'center'
  });

  // body
  const body = document.createElement('div');
  body.innerHTML=`<p style="margin:16px;line-height:1.4;text-align:center;">
                    Mark purchase order as sent?
                  </p>`;

  // footer with buttons
  const footer = document.createElement('div');
  Object.assign(footer.style,{
    display:'flex',justifyContent:'space-around',
    padding:'12px',background:'#fafafa',borderTop:'1px solid #ddd'
  });
  function makeBtn(txt,bg){
    const b=document.createElement('button');
    b.textContent=txt;
    Object.assign(b.style,{
      padding:'8px 16px',border:'none',borderRadius:'4px',
      cursor:'pointer',fontSize:'0.95em',fontWeight:'bold',
      backgroundColor:bg,color:'#fff'
    });
    return b;
  }
  const btnYes=makeBtn('Yes, mark sent','#28a745');
  const btnNo =makeBtn('Cancel','#6c757d');
  footer.append(btnNo,btnYes);

  modal.append(header,body,footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function closeModal(){ overlay.remove(); }

  btnNo.addEventListener('click',()=>{ closeModal(); });
  btnYes.addEventListener('click', async () => {
    closeModal();
    try {
      await markPOAsSent(poId);
      // flash the “Number” field green
      const dt = [...document.querySelectorAll('.group-side-content dt')]
                    .find(d => d.textContent.trim() === 'Number');
      if (dt && dt.nextElementSibling) {
        Object.assign(dt.nextElementSibling.style, {
          backgroundColor: '#28a745',
          color:           '#fff',
          padding:         '2px 6px',
          borderRadius:    '4px'
        });
      }
      // delay the refresh slightly
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error('❌ Failed to mark as sent:', err);
      alert('Failed: ' + err.message);
    }
  });
})();
  }

});



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






// Volume Plug in 

(async function listVolumesWithCache() {
  const API_TOKEN     = 'V3y7QZ87EA9K8BGEzCxG';
  const API_SUBDOMAIN = 'clearsound';
  const PER_PAGE      = 100;

  // ── 1) Get Opportunity ID from URL ──
  const m = location.pathname.match(/opportunities\/(\d+)/);
  if (!m) return console.error('Couldn’t parse opportunity ID');
  const oppId = m[1];

  // ── 2) Ensure the “Total Volume” row exists and is aligned ──
  const weightLi = document.getElementById('weight_total')?.closest('li');
  if (weightLi && !document.getElementById('volume_total')) {
    const labelW = getComputedStyle(weightLi.querySelector('span:not([id])')).width;
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="detail-label" style="display:inline-block;width:${labelW};">
        Total Volume:
      </span>
      <span id="volume_total">… m³</span>
    `;
    weightLi.after(li);
  }

  // ── 3) Build or load productVolumeMap (productId → equipment_volume_m3) ──
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

  // ── 4) Fetch opportunity_items (with nested item) ──
  const API = `https://api.current-rms.com/api/v1/opportunities/${oppId}/opportunity_items?include=%5Bitem%5D`;
  let records;
  try {
    const res = await fetch(API, {
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

  // ── 5) Build table and sum using the map ──
  const tableData = records.map(r => {
    const pid = r.item_id;
    const vol = productVolumeMap[pid] || 0;
    return {
      name:                r.item?.name || '–',
      quantity:            r.quantity || 1,
      equipment_volume_m3: vol,
      line_volume_m3:      (vol * (r.quantity||1)).toFixed(2)
    };
  });
  console.table(tableData);

  const total = tableData.reduce((sum, row) => sum + parseFloat(row.line_volume_m3), 0);
  document.getElementById('volume_total').textContent = total.toFixed(2) + ' m³';
  console.log(`🔢 Total Volume summed = ${total.toFixed(2)} m³`);
})();







//reset

delete window.productVolumeMap;
localStorage.removeItem('productVolumeMap');

