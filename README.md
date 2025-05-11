# RMS-Navigator v1.7.4
_A little nudge for CurrentRMS_![Screenshot 2025-05-11 at 21 46 13](https://github.com/user-attachments/assets/43589784-c73a-4727-8a21-6e5ade4208f8)


## Current Modules  
- **Shortages**  
- **Suppliers**  
- **Message Box**  
- **Optional Accessories**
- **Total Volume** (new feature)
- **Hide “below-cost” Rows**  

## Future Modules  
- **Crew Hotels**
- **Show shortages on text items**
- **LOLER Inspection**  
- **Ladder Inspection**  
- **Sync opportunities up to Google calendar**  
- **Automated Activities**  
- **Warehouse Dashboard**  

---

## Installation

1. Download the plugin ZIP from releases and unzip.  
2. In Chrome, go to `chrome://extensions`.  
3. Enable **Developer mode**.  
4. Click **Load unpacked** and select the plugin folder.  

---

## Configuration

1. Click the extension icon (puzzle piece) and open RMS-Navigator.  
2. Click ⚙️ and enter your:  
   - **Subdomain** (`yourcompany.currentrms.com`)  
   - **API Key**  
3. Click **Save**.  

---

## Modules Overview

### Shortages Module
![Screenshot 2025-05-11 at 21 33 21](https://github.com/user-attachments/assets/04693c13-9a60-4d03-b25b-50e6b87aa1c0)


**Location**: Under **Actions** in the Opportunity sidebar, click the **Shortages List** button.  

> 🔧 **Important:**  
> - Set your system’s Availability Period to **Hour** in CurrentRMS System Settings.  
> - To save shortage results back into Discussions, create an Opportunity custom field named **SHORTAGES**

**What it does**  
- Finds items on this Opportunity with stock shortages (per‐job basis).  
- Ignores other jobs; shows gaps only for the current job.  
- Filters out accessories and unwanted names.  
- Calculates live availability vs. bookings (including quarantine).  
- Writes a summary into the Opportunity’s **Shortages** custom field.  

**How it works**  
1. Click **Shortages List**.  
2. Reads API key & subdomain from Chrome storage.  
3. GETs `/opportunities/:id/opportunity_items?q[has_shortage_eq]=true`.  
4. Filters by accessory_mode and name patterns.  
5. POSTs each item to `/availability/product` for availability + quarantine.  
6. Builds de-duplicated list:
7. Displays results in a popup modal** (with Copy-to-Clipboard).  
8. PUTs that list into `/opportunities/:id` custom field.  

**Trigger & UI**  
- Click **Shortages List** under Actions.  
- A popup modal appears showing shortages.  

**Benefits**  
- Instant, in-page view of stock gaps.  
- Combines availability, bookings, and quarantine in one popup.  
- Zero context-switch: runs in-browser and updates CurrentRMS.  

---

### Suppliers Module
<img width="292" alt="Screenshot 2025-04-26 at 12 16 10" src="https://github.com/user-attachments/assets/1374a5e7-9924-4389-97bf-58877ff4a35f" />![Screenshot 2025-05-11 at 21 36 23](https://github.com/user-attachments/assets/64112125-6d2f-4b56-9895-6961a32b45bc)


**Location**: On the right-hand side of an Opportunity page, under the **Suppliers** heading.  

**What it does**  
- Lists suppliers associated with the Opportunity when sub-rent allocations are present.- Omits internal/irrelevant names.  
- Shows PO status (PO # or **No PO**).  
- Colour codes:  
  **Red** = No PO  
  **Orange** = PO created  
  **Green** = PO sent  
- Right-click any PO to **Mark as sent**.  
- Automatically prompts to mark a PO as sent when it’s created via a discussion thread.
  
**How it works**  
1. Open **Suppliers** tab in RMS-Navigator.  
2. Loads API key & subdomain.  
3. Fetches costings view (`?view=c`), parses HTML table.  
4. Extracts supplier name, PO link, badge classes.  
5. Inserts Suppliers panel under **Scheduling** if missing.  
6. Renders colour-coded links: click to open PO or filter by supplier.  
7. Adds right-click menu on PO links to auto-trigger Rails `mark_as_sent` via hidden iframe.  
8. Auto-selects rows on costings pages when `view=c&supplier=Name`.  

**Trigger & UI**  
- Open RMS-Navigator → **Suppliers**.  
- Inline list appears with coloured PO links.  
- Right-click a link to **Mark as sent**.  

**Benefits**  
- Compare lead-times and PO status without leaving the page.  
- Colour cues highlight POs needing action.  
- One-click **Mark as sent**.  
- Speeds up ordering and PO management.  

---

### Message Box Module
![Screenshot 2025-05-11 at 21 26 56](https://github.com/user-attachments/assets/ed5546a7-0a46-4ca8-aa48-be8146f53246)


**Location**: Automatically pops up center-stage when an Opportunity description is present.

**What it does**  
- Detects and extracts text from the Opportunity description.  
- Plays a subtle click sound.  
- Displays the text in a centered modal popup.  

**How it works**  
1. On page load, checks for a new Opportunity description.  
2. Grabs text from `.expand-box-container p`.  
3. After 500 ms, plays a 300 Hz click and shows a modal with the text.  
4. Stores the Opportunity ID in sessionStorage to avoid repeats.
5. You can also re-open or update the Message Box at any time via the **Message Box** entry under **Actions** in the sidebar.  

**Benefits**  
- Ensures you never miss the Opportunity description or updates.  
- Audible + visual alert.  
- Notes also available in **Message Box** tab for manual sending.  

---

### Optional Accessories Module
<img width="591" alt="Screenshot 2025-04-26 at 12 14 38" src="https://github.com/user-attachments/assets/b16bba0b-e0de-4dcd-b5ad-24a15eae7e2c" />

**Location**: Works directly within the item picker on an Opportunity page.  

> 🔧 **Important:** Include the text **“Optional Accessories”** in the product description to enable.  

**What it does**  
- Detects items with optional accessories.  
- Highlights rows in yellow.  
- Automatically opens the accessories picker when you enter a quantity.  

**How it works**  
1. Observes `#quickpick_table tbody` for quantity inputs.  
2. Debounced `input` listener triggers on first non-zero value.  
3. Plays a click sound and shows a toast: “This item has optional accessories.”  
4. Clicks the hidden “Show Accessories” link.  
5. Disables the **Add** button for 2 s to prevent duplicates.  
6. Highlights accessory rows with a yellow background.  

**Trigger & UI**  
- Enter a quantity for an item with accessories.  
- A toast appears for 3 s; accessories panel opens.  
- Accessory rows are highlighted.  

**Benefits**  
- Never miss upsell opportunities.  
- Streamlines adding accessories.

---

# Total Volume Module
<img width="169" alt="Screenshot 2025-04-27 at 05 52 37" src="https://github.com/user-attachments/assets/aae298d3-0d80-418d-bdf2-aaa72b5d4d6b" />

**Location**: In the Opportunity sidebar under **Details**, next to **Total Weight**.

**What it does**
- Calculates the total equipment volume (m³) for all line items on the Opportunity.
- Displays a **Total Volume** value in the sidebar.

> 🔧 **Important:**  
> - Create a Product custom field named **Equipment Volume m2**.  
> - On first run, the module caches all product volumes, which may take 1–2 minutes.  
> - After caching, subsequent loads are fast.  
> - If you add new stock or update volumes, click **Reset item volume cache** in RMS-Navigator to rebuild the cache.

**How it works**
1. Reads the Opportunity ID from the URL.  
2. Ensures a **Total Volume** row exists in the details list.  
3. Loads or fetches `equipment_volume_m2` for each product via the API, caching results in `localStorage`.  
4. Fetches all `opportunity_items` (including nested item data).  
5. Computes each line’s volume = `quantity × equipment_volume_m2`.  
6. Sums line volumes and updates the **Total Volume** field (in m³).

**Trigger & UI**
- Runs automatically when loading an Opportunity page.  
- Sidebar shows **Total Volume: X.XX m³**.  
- Use **Reset item volume cache** to refresh cached data.

**Benefits**
- Immediate visibility of cubic volume for logistics and planning.  
- Caches volume data for faster subsequent loads.  
- Zero configuration beyond creating the custom field.
  
---

### Hide “below-cost” Rows
<img width="704" alt="Screenshot 2025-04-26 at 12 24 05" src="https://github.com/user-attachments/assets/93782fd0-1dfc-45fc-84fa-eb16bd2986c7" />

**What it does**  
- Removes the yellow highlight and hides items priced below cost.  

**Why it’s useful**  
- Keeps your screen clean and prevents under-charging.  

---

## Troubleshooting

- **Extension not visible?** Pin it in `chrome://extensions`.  
- **API error?** Re-enter credentials in Settings.  

---

## Uninstall

1. Go to `chrome://extensions`.  
2. Find **RMS-Navigator**.  
3. Click **Remove**.   
