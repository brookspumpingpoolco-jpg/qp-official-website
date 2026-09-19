# Price Book Setup Guide - Fixing Empty Dropdowns

## Problem
The Invoice Chemicals and Invoice Labor dropdowns are showing "No chemical items found in Price book" and "No labor items found in Price book".

## Root Causes
1. **Items not categorized**: Items in the Price Book sheet don't have "Chemical" or "Labor/Service" in the Category column (Column D)
2. **No items exist**: The Price Book sheet may be empty or have no active items
3. **Items marked inactive**: Items exist but are marked as inactive in Column I

## Solution Implemented

### Automatic Fallback (ACTIVE NOW)
The system now uses a **fallback mechanism**:
1. First, tries to find items with "Chemical" category
2. If none found → shows ALL active Price Book items
3. Same for Labor items: tries "Labor/Service" category, then falls back to ALL items

**This means**: Dropdowns will NOW populate with your existing Price Book items, regardless of how they're categorized.

## How to Properly Set Up Price Book Items

### Column Structure
The Price Book sheet (rows starting from row 7) has these columns:

| Column | Field | Example |
|--------|-------|---------|
| A | Brand | POOLKLEEN |
| B | Code | CHEM-001 |
| C | Name | Chlorine Tablets |
| D | Category | **Chemical** or **Labor** or any text |
| E | Unit | lb, gal, hr, service, etc. |
| F | Price | 25.99 |
| G | Description | 50lb bucket of chlorine |
| H | Image URL | (optional image link) |
| I | Active | true/false (blank = true) |

### Setting Up Chemical Items

Add items to Price Book with these guidelines:
1. **Name** (Column C): Required - e.g., "Chlorine Tablets", "Acid Wash", "Stabilizer"
2. **Category** (Column D): Set to "Chemical" (or will default to "Other")
3. **Code** (Column B): Optional but recommended - e.g., "CHEM-001"
4. **Price** (Column F): Required - the unit price
5. **Unit** (Column E): e.g., "lb", "gal", "bottle"
6. **Active** (Column I): Leave blank or set to "true"

**Example Row:**
```
POOLKLEEN | CHEM-001 | Chlorine Tablets | Chemical | lb | 25.99 | 50lb bucket | [image-url] | true
```

### Setting Up Labor Items

Add items with:
1. **Name** (Column C): Required - e.g., "Pool Cleaning (2hr)", "Chemical Service", "Equipment Installation"
2. **Category** (Column D): Set to "Labor", "Service", or "Labor/Service"
3. **Price** (Column F): Required - hourly rate or service price
4. **Unit** (Column E): e.g., "hr" (hours), "service", "visit"

**Example Row:**
```
[blank] | LAB-001 | Weekly Pool Cleaning | Labor | service | 49.99 | Standard weekly maintenance | [image-url] | true
```

## Accessing the Item List Manager

To add/edit items in the Price Book:
1. Go to Dashboard
2. Look for "Item List Manager" or "Manage Price Book" link
3. Or navigate directly to the ItemListUI webapp

## Testing the Fix

After adding items to the Price Book:
1. Refresh the Service Checklist page
2. The "Invoice Chemical" dropdown should populate
3. The "Invoice Labor" dropdown should populate
4. Select items and they'll appear in the selected items list below

## Troubleshooting

### Dropdowns still empty?
1. **Check Price Book exists**: Verify a sheet named "Price book" exists (note the lowercase 'b')
2. **Check row format**: Items should start from row 7 or later
3. **Check Active column**: Ensure items have Column I = "true" or blank
4. **Check Name column**: Column C must have a value (item name)

### Items showing in wrong dropdown?
- Chemical items appearing in Labor: This is the fallback behavior - edit the item's Category field (Column D) to specify "Chemical" or "Labor"
- Labor items appearing in Chemicals: Same solution - ensure Category = "Labor" or "Service"

### Price not showing?
- Column F (Price) must have a numeric value
- Non-numeric values will be treated as 0

## Current Implementation

**File**: `/Users/joellmatteson/Desktop/The Official Website/invoice-netlify/SchedulingScript.gs`

**Functions**:
- `getPriceBookChemicalItems()` - Gets chemical items (with fallback to all items)
- `getPriceBookLaborItems()` - Gets labor items (with fallback to all items)  
- `getAllPriceBookItems()` - Gets all items regardless of category
- `getPriceBookItemsByCategory_(pattern)` - Generic category filter
- `debugPriceBook()` - Debug function to see what's in the sheet

## Next Steps

1. **Add items to Price Book**: Use ItemList Manager to add chemicals and labor items
2. **Set categories**: Ensure items have "Chemical" or "Labor" in the Category column for proper filtering
3. **Test**: Refresh Service Checklist and verify dropdowns populate
4. **Create invoices**: Select items and create service completion invoices

---
*Last Updated: May 5, 2026*
