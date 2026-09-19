/**
 * Enhanced Email Functions for InvoiceEstimate.gs
 * Add these functions to your InvoiceEstimate.gs file
 */

/**
 * Generate enhanced email body with summary and professional messaging
 */
function generateEnhancedEmailBody(data, shareLink, approvalToken, paymentLink, customerPortalRegistered) {
  const isEstimate = data.type === 'Estimate';
  const type = isEstimate ? 'Estimate' : 'Invoice';
  
  // Calculate totals for summary
  const items = JSON.parse(data.items || '[]');
  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.price || 0)), 0);
  const taxRate = parseFloat(data.taxRate || 0);
  const taxAmount = subtotal * (taxRate / 100);
  const discount = parseFloat(data.discount || 0);
  const total = subtotal + taxAmount - discount;
  
  // Create summary of top items
  const topItems = items
    .sort((a, b) => (b.quantity * b.price) - (a.quantity * a.price))
    .slice(0, 5)
    .map(item => `• ${item.name} - $${(item.quantity * item.price).toFixed(2)}`)
    .join('<br>');
  
  // Professional greeting based on project status
  let greeting = '';
  let callToAction = '';
  
  if (isEstimate) {
    greeting = `
      <div style="background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <h2 style="margin: 0 0 12px 0; font-size: 24px;">🏊‍♂️ Your Pool Dreams Await!</h2>
        <p style="margin: 0; font-size: 16px; opacity: 0.9;">We're excited to help bring your vision to life</p>
      </div>
    `;
    
    callToAction = `
      <div style="background: #f0f9ff; border: 2px solid #0284c7; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
        <h3 style="color: #0369a1; margin-top: 0;">🚀 Ready to Get Started?</h3>
        <p style="font-size: 16px; color: #1e40af; margin-bottom: 20px;">
          Contact us today to begin your pool transformation journey! Our expert team is standing by to answer any questions and help you achieve the backyard oasis of your dreams.
        </p>
        <div style="margin: 20px 0;">
          <a href="tel:${COMPANY_PHONE}" style="display: inline-block; margin: 0 10px; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">📞 Call Us</a>
          <a href="mailto:${COMPANY_EMAIL}" style="display: inline-block; margin: 0 10px; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">✉️ Email Us</a>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin-bottom: 0;">
          <strong>Phone:</strong> ${COMPANY_PHONE} | <strong>Email:</strong> ${COMPANY_EMAIL}
        </p>
      </div>
    `;
  } else {
    greeting = `
      <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <h2 style="margin: 0 0 12px 0; font-size: 24px;">🎉 Your Project is Underway!</h2>
        <p style="margin: 0; font-size: 16px; opacity: 0.9;">We're thrilled to be part of your pool journey</p>
      </div>
    `;
    
    callToAction = `
      <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
        <h3 style="color: #059669; margin-top: 0;">🌟 Bringing Your Dreams to Life</h3>
        <p style="font-size: 16px; color: #065f46; margin-bottom: 20px;">
          Your project has already started, and we're excited to help you achieve this amazing transformation! Our dedicated team is committed to delivering exceptional results that exceed your expectations.
        </p>
        <div style="margin: 20px 0;">
          <a href="tel:${COMPANY_PHONE}" style="display: inline-block; margin: 0 10px; padding: 12px 24px; background: #0284c7; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">📞 Questions? Call Us</a>
          <a href="mailto:${COMPANY_EMAIL}" style="display: inline-block; margin: 0 10px; padding: 12px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">📧 Send Message</a>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin-bottom: 0;">
          We're here to support you every step of the way!
        </p>
      </div>
    `;
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .summary-card { background: white; border-radius: 12px; padding: 20px; margin: 20px 0; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .amount-highlight { font-size: 28px; font-weight: bold; color: #059669; }
      </style>
    </head>
    <body>
      <div class="container">
        ${greeting}
        
        <div class="summary-card">
          <h3 style="color: #1f2937; margin-top: 0;">📋 ${type} Summary</h3>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div>
              <p style="margin: 4px 0;"><strong>${type} #:</strong> ${data.quoteNumber || data.invoiceNumber || 'N/A'}</p>
              <p style="margin: 4px 0;"><strong>Date:</strong> ${data.date || new Date().toLocaleDateString()}</p>
              <p style="margin: 4px 0;"><strong>Customer:</strong> ${data.customerName || ''}</p>
            </div>
            <div style="text-align: right;">
              <div class="amount-highlight">$${total.toFixed(2)}</div>
              <p style="margin: 0; color: #6b7280; font-size: 14px;">Total Amount</p>
            </div>
          </div>
          
          ${items.length > 0 ? `
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <h4 style="margin: 0 0 12px 0; color: #374151;">Key Items:</h4>
            <div style="font-size: 14px; color: #4b5563;">
              ${topItems}
              ${items.length > 5 ? `<br><em>...and ${items.length - 5} more items</em>` : ''}
            </div>
          </div>
          ` : ''}
        </div>
        
        ${callToAction}
        
        <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
          <h3 style="color: #1f2937; margin-top: 0;">📎 Attached Documents</h3>
          <p style="margin-bottom: 16px;">Your ${type.toLowerCase()} is attached as a PDF for your records.</p>
          <a href="${shareLink}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 0 8px;">
            🔗 View Online
          </a>
          ${approvalToken ? `
          <a href="${shareLink}" style="display: inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 0 8px;">
            ✅ Approve Estimate
          </a>
          ` : ''}
        </div>
        
        ${paymentLink ? `
        <div style="background: #dcfce7; border: 2px solid #10b981; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
          <h3 style="color: #059669; margin-top: 0;">💳 Secure Online Payment</h3>
          <p style="font-size: 16px; margin-bottom: 20px;">Pay your invoice securely online with our encrypted payment system.</p>
          <a href="${paymentLink}" style="display: inline-block; padding: 16px 32px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
            💰 Pay $${total.toFixed(2)} Now
          </a>
          <p style="margin-top: 15px; font-size: 12px; color: #6b7280;">Powered by Stripe - Your payment information is secure</p>
        </div>
        ` : ''}
        
        ${!customerPortalRegistered ? `
        <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
          <h3 style="color: #92400e; margin-top: 0;">🌟 Exclusive Customer Portal Access</h3>
          <p style="font-size: 15px; color: #78350f; margin-bottom: 16px;">
            Get VIP access to track your projects, view all invoices, schedule services, and communicate directly with our team!
          </p>
          <a href="https://www.aqualitypoolcompanyusa.com/customer-portal" style="display: inline-block; padding: 14px 28px; background: #f59e0b; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            🚀 Activate Portal Access
          </a>
        </div>
        ` : ''}
        
        <div style="margin-top: 40px; padding: 24px; background: #1f2937; color: white; border-radius: 12px; text-align: center;">
          <h3 style="margin: 0 0 16px 0; color: #f3f4f6;">🏊‍♀️ ${COMPANY_NAME}</h3>
          <p style="margin: 8px 0; opacity: 0.9;">📧 ${COMPANY_EMAIL}</p>
          <p style="margin: 8px 0; opacity: 0.9;">📞 ${COMPANY_PHONE}</p>
          <p style="margin: 16px 0 0 0; font-size: 14px; opacity: 0.7;">
            Creating beautiful pools and lasting memories since day one
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate PDF blob for email attachment
 */
function generatePDFBlob(id, data) {
  try {
    // Create a temporary Google Doc to convert to PDF
    const doc = DocumentApp.create('Temp Invoice PDF - ' + id);
    const body = doc.getBody();
    
    // Clear default content
    body.clear();
    
    // Add content to document
    const type = data.type === 'Invoice' ? 'Invoice' : 'Estimate';
    
    // Header
    body.appendParagraph(COMPANY_NAME)
      .setHeading(DocumentApp.ParagraphHeading.TITLE)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    
    body.appendParagraph(`${type} #${data.quoteNumber || data.invoiceNumber || id}`)
      .setHeading(DocumentApp.ParagraphHeading.HEADING1)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    
    // Customer info
    body.appendParagraph('Customer Information')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    
    body.appendParagraph(`Name: ${data.customerName || 'N/A'}`);
    body.appendParagraph(`Email: ${data.customerEmail || 'N/A'}`);
    body.appendParagraph(`Phone: ${data.customerPhone || 'N/A'}`);
    body.appendParagraph(`Address: ${data.customerAddress || 'N/A'}`);
    body.appendParagraph(`Date: ${data.date || new Date().toLocaleDateString()}`);
    
    // Items table
    const items = JSON.parse(data.items || '[]');
    if (items.length > 0) {
      body.appendParagraph('Items')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      
      const table = body.appendTable();
      
      // Header row
      const headerRow = table.appendTableRow();
      headerRow.appendTableCell('Description');
      headerRow.appendTableCell('Qty');
      headerRow.appendTableCell('Price');
      headerRow.appendTableCell('Total');
      
      // Data rows
      items.forEach(item => {
        const row = table.appendTableRow();
        row.appendTableCell(item.name || '');
        row.appendTableCell(String(item.quantity || 0));
        row.appendTableCell('$' + (item.price || 0).toFixed(2));
        row.appendTableCell('$' + ((item.quantity || 0) * (item.price || 0)).toFixed(2));
      });
      
      // Totals
      const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.price || 0)), 0);
      const taxRate = parseFloat(data.taxRate || 0);
      const taxAmount = subtotal * (taxRate / 100);
      const discount = parseFloat(data.discount || 0);
      const total = subtotal + taxAmount - discount;
      
      body.appendParagraph(`Subtotal: $${subtotal.toFixed(2)}`);
      if (taxRate > 0) {
        body.appendParagraph(`Tax (${taxRate}%): $${taxAmount.toFixed(2)}`);
      }
      if (discount > 0) {
        body.appendParagraph(`Discount: -$${discount.toFixed(2)}`);
      }
      body.appendParagraph(`Total: $${total.toFixed(2)}`)
        .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    }
    
    // Notes and terms
    if (data.notes) {
      body.appendParagraph('Notes')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(data.notes);
    }
    
    if (data.terms) {
      body.appendParagraph('Terms')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(data.terms);
    }
    
    // Convert to PDF
    const pdfBlob = doc.getAs('application/pdf');
    pdfBlob.setName(`${type}_${data.quoteNumber || data.invoiceNumber || id}.pdf`);
    
    // Delete temporary document
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    
    return pdfBlob;
    
  } catch (error) {
    Logger.log('Error generating PDF blob: ' + error.toString());
    throw error;
  }
}
