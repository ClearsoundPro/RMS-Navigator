// API call to fetch shortages list for an opportunity
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchShortages") {
    fetch(`https://api.current-rms.com/api/v1/opportunities/${request.opportunityNumber}/opportunity_items?q[has_shortage_eq]=true&filtermode=all`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-TOKEN": "",
        "X-SUBDOMAIN": ""
      }
    })
    .then(response => response.json())
    .then(data => sendResponse({ shortages: data.opportunity_items }))
    .catch(error => console.error("Error fetching shortages:", error));
    return true;
  }

  if (request.action === "fetchAvailability") {
    fetch("https://api.current-rms.com/api/v1/availability/product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-TOKEN": "",
        "X-SUBDOMAIN": ""
      },
      body: JSON.stringify({
        "booking_availability_view_options": {
          "product_id": request.product_id,
          "store_ids": [1],
          "days_period": 21,
          "starts_at": request.startDate,
          "ends_at": request.endDate
        }
      })
    })
    .then(response => response.json())
    .then(data => {
      const quantityAvailable = data.product_bookings 
        ? Math.min(...data.product_bookings.quantity_available.map(Number)) 
        : "No data";
      sendResponse({ availability: quantityAvailable });
    })
    .catch(error => console.error("Error fetching availability:", error));
    return true;
  }
});