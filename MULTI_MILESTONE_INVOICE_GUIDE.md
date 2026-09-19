# Multi-Milestone Invoice Feature Guide

## Overview
You can now send multiple payment schedule milestones in a single invoice to customers. Instead of creating separate invoices for each milestone (deposit, mid-point, final, etc.), you can bundle them all together.

## Key Features
- ✅ Combine multiple payment milestones into one invoice
- ✅ Automatic line item creation for each milestone
- ✅ Tracks which milestones are included in consolidated invoices
- ✅ Works with your existing payment tracking system
- ✅ Full integration with invoice storage and payment links

## Backend Functions

### 1. `getProjectMilestonesForBundling(projectId, unpaidOnly)`
Retrieves payment milestones for a project, useful for UI selection before bundling.

**Parameters:**
- `projectId` (string): The project ID
- `unpaidOnly` (boolean): If true, returns only unpaid milestones

**Returns:**
```javascript
{
  success: true,
  milestones: [
    {
      id: "1",
      name: "Deposit",
      amount: 5000,
      dueDate: "2024-08-15",
      paid: false,
      paidAmount: 0,
      paidDate: null
    },
    // ... more milestones
  ],
  totalUnpaid: 15000,
  projectName: "Pool Installation",
  customerEmail: "customer@example.com",
  customerName: "John Doe"
}
```

**Usage from frontend:**
```javascript
google.script.run.withSuccessHandler(onMilestonesLoaded)
  .getProjectMilestonesForBundling(projectId, true);
```

---

### 2. `createMultiMilestoneInvoice(projectId, milestoneIds, invoiceTitle)`
Creates a single invoice containing multiple payment milestones as line items.

**Parameters:**
- `projectId` (string): The project ID
- `milestoneIds` (array): Array of milestone IDs to include, e.g., `["1", "2", "3"]`
- `invoiceTitle` (string, optional): Custom title for the bundled invoice

**Returns:**
```javascript
{
  success: true,
  invoiceId: "INV-2024-00156",
  totalAmount: 15000,
  milestonesIncluded: 3
}
```

**Error Example:**
```javascript
{
  success: false,
  error: "No valid milestones found for the provided milestone IDs"
}
```

**Usage from frontend:**
```javascript
const milestoneIds = ["1", "2", "3"];
const invoiceTitle = "Payment Schedule - All Milestones";

google.script.run.withSuccessHandler(onInvoiceCreated)
  .createMultiMilestoneInvoice(projectId, milestoneIds, invoiceTitle);

function onInvoiceCreated(result) {
  if (result.success) {
    alert('Invoice created: ' + result.invoiceId);
    alert('Total: $' + result.totalAmount.toFixed(2));
  } else {
    alert('Error: ' + result.error);
  }
}
```

---

## Invoice Structure

When you create a multi-milestone invoice, it includes:

**Invoice Details:**
- **Type:** Invoice
- **Customer:** From the project
- **Items:** Each milestone becomes a line item
  - Quantity: 1
  - Price: Milestone amount
  - Description: "Project: [ID] | Milestone: [Name]"

**Example Line Items:**
```
Deposit (Milestone 1)           $5,000.00
Mid-Point Payment (Milestone 2) $5,000.00
Final Payment (Milestone 3)     $5,000.00
                        TOTAL   $15,000.00
```

**Notes:**
The invoice includes a note indicating it's a consolidated milestone invoice for reference.

---

## Data Storage

The invoice is stored in the standard **Invoices/Estimates** sheet with these additional fields:
- `multiMilestone: true` - Flags this as a consolidated invoice
- `linkedMilestoneIds: ["1", "2", "3"]` - Tracks which milestones are included
- `projectId` - Links back to the original project

The project record is also updated with:
- `lastMultiMilestoneInvoiceId` - Most recent consolidated invoice ID
- `lastMultiMilestoneInvoiceDate` - When it was created
- `lastMultiMilestoneInvoiceMilestones` - Which milestones were bundled

---

## Payment Tracking Integration

Multi-milestone invoices work seamlessly with your existing payment tracking:

1. **Payment History** - All payments are recorded against the invoice
2. **Milestone Status** - Individual milestone payment status is tracked via the payment history system
3. **Tagged Payments** - Use `[milestone:Name]` tags in payment descriptions to allocate payments to specific milestones within the consolidated invoice

**Example Payment Descriptions:**
```
Payment for Project - [milestone:Deposit]
Payment for Project - [milestone:Final Payment]
```

---

## Frontend Implementation Example

Here's a complete example for your UI:

```html
<!-- Milestone Selection Checkboxes -->
<div id="milestoneCheckboxes"></div>
<button onclick="createBundledInvoice()">Create Invoice with Selected Milestones</button>

<script>
function loadMilestones() {
  google.script.run.withSuccessHandler(displayMilestones)
    .getProjectMilestonesForBundling(currentProjectId, true);
}

function displayMilestones(result) {
  if (!result.success) {
    alert('Error: ' + result.error);
    return;
  }

  const container = document.getElementById('milestoneCheckboxes');
  container.innerHTML = '';

  result.milestones.forEach(milestone => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = milestone.id;
    checkbox.className = 'milestone-checkbox';
    
    const label = document.createElement('label');
    label.innerHTML = `
      ${milestone.name} - $${milestone.amount.toFixed(2)}
      ${milestone.paid ? '<span style="color:green;">(Paid)</span>' : '<span style="color:red;">(Unpaid)</span>'}
    `;
    
    container.appendChild(checkbox);
    container.appendChild(label);
    container.appendChild(document.createElement('br'));
  });
}

function createBundledInvoice() {
  const checkboxes = document.querySelectorAll('.milestone-checkbox:checked');
  const milestoneIds = Array.from(checkboxes).map(cb => cb.value);

  if (milestoneIds.length === 0) {
    alert('Please select at least one milestone');
    return;
  }

  const invoiceTitle = 'Payment Schedule - ' + new Date().toLocaleDateString();

  google.script.run.withSuccessHandler(onInvoiceCreated)
    .createMultiMilestoneInvoice(currentProjectId, milestoneIds, invoiceTitle);
}

function onInvoiceCreated(result) {
  if (result.success) {
    alert(`✅ Invoice created successfully!\n\nID: ${result.invoiceId}\nTotal: $${result.totalAmount.toFixed(2)}\nMilestones included: ${result.milestonesIncluded}`);
    loadMilestones(); // Refresh list
  } else {
    alert('❌ Error: ' + result.error);
  }
}
</script>
```

---

## Common Use Cases

### 1. Upfront Multi-Phase Invoice
Send all payment milestones at project start for customer review and approval.

```javascript
// Get all unpaid milestones
google.script.run.getProjectMilestonesForBundling(projectId, true);

// Create invoice with all of them
google.script.run.createMultiMilestoneInvoice(
  projectId,
  ["1", "2", "3"],
  "Complete Project Payment Schedule"
);
```

### 2. End-of-Month Consolidated Billing
Bundle all milestones from multiple projects into a single consolidated invoice.

```javascript
// Create separate invoices for each project's milestones
projects.forEach(project => {
  google.script.run.getProjectMilestonesForBundling(project.id, true);
  // Then create invoice for that project
});
```

### 3. Partial Bundling
Include only specific milestones (e.g., combine deposit + first mid-point):

```javascript
google.script.run.createMultiMilestoneInvoice(
  projectId,
  ["1", "2"],  // Only deposit and first mid-point
  "Initial Payment Milestones"
);
```

---

## Technical Notes

- **Line Item Format:** Each milestone is converted to a standard line item with:
  - ID from milestone.id
  - Name from milestone.name
  - Quantity: 1 (always)
  - Price/Amount from milestone.amount

- **Total Calculation:** Automatically sums all milestone amounts

- **Email Integration:** The created invoice is fully compatible with your email sending system and includes all standard invoice details

- **Payment Processing:** Works with Stripe payment links and manual payment tracking

---

## Troubleshooting

### "No valid milestones found"
- Check that milestone IDs match exactly
- Verify the project has active milestones
- Ensure the project exists

### Invoice not appearing
- Check the Invoices/Estimates sheet
- Verify the project has a customer email
- Check browser console for error messages

### Payment not allocating correctly
- Use `[milestone:Name]` format in payment descriptions
- Verify milestone name matches exactly (case-sensitive)
- Check payment history in project details

---

## Future Enhancements
- Bulk operations for multiple projects
- Template-based milestone bundling
- Automatic scheduling of consolidated invoices
- Custom note templates for bundled invoices
