/**
 * Email Template System for A Quality Pool Company
 * 
 * This file contains reusable email templates with consistent branding
 * that matches the website's color scheme and design.
 * 
 * USAGE:
 *   const emailHtml = EmailTemplate.getContactFormEmail(data);
 *   const emailText = EmailTemplate.getContactFormEmailText(data);
 * 
 * BRAND COLORS (matching homepage):
 *   Primary Blue: #3b82f6
 *   Hover Blue: #2563eb
 *   Light Blue/Accent: #60a5fa (pool water theme)
 *   Dark Gray: #1f2937
 *   Medium Gray: #374151
 *   Light Gray: #64748b
 *   Border Gray: #e5e7eb
 *   Background: #f9fafb
 */

const EmailTemplate = {
  
  // Brand Colors
  COLORS: {
    primaryBlue: '#3b82f6',
    hoverBlue: '#2563eb',
    lightBlue: '#60a5fa',
    darkGray: '#1f2937',
    mediumGray: '#374151',
    lightGray: '#64748b',
    borderGray: '#e5e7eb',
    background: '#f9fafb',
    white: '#ffffff',
    successGreen: '#10b981',
    errorRed: '#ef4444'
  },
  
  // Company Information
  COMPANY: {
    name: 'A Quality Pool Company',
    email: 'brookspumpingpoolco@gmail.com',
    phone: '502-706-9172',
    website: 'https://elitepoolsnc.com' // Update with your actual website
  },
  
  /**
   * Get the base email HTML template
   * @param {Object} options - Email options
   * @param {String} options.title - Email title/subject
   * @param {String} options.content - Main content HTML
   * @param {String} options.footerText - Optional footer text
   * @returns {String} Complete HTML email
   */
  getBaseTemplate: function(options) {
    const title = options.title || 'A Quality Pool Company';
    const content = options.content || '';
    const footerText = options.footerText || '';
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${this.COLORS.background};">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${this.COLORS.background};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: ${this.COLORS.white}; border-radius: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
          
          <!-- Header with Pool Water Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, ${this.COLORS.primaryBlue} 0%, ${this.COLORS.lightBlue} 100%); padding: 40px 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: ${this.COLORS.white}; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                ${this.COMPANY.name}
              </h1>
              <div style="margin-top: 8px; height: 3px; width: 60px; background-color: ${this.COLORS.white}; margin-left: auto; margin-right: auto; border-radius: 2px;"></div>
            </td>
          </tr>
          
          <!-- Content Area -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: ${this.COLORS.background}; padding: 30px 40px; border-top: 1px solid ${this.COLORS.borderGray};">
              ${this.getFooter(footerText)}
            </td>
          </tr>
          
        </table>
        
        <!-- Bottom Spacing -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px;">
          <tr>
            <td style="padding: 20px 0; text-align: center; color: ${this.COLORS.lightGray}; font-size: 12px;">
              <p style="margin: 0;">© ${new Date().getFullYear()} ${this.COMPANY.name}. All rights reserved.</p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  },
  
  /**
   * Get footer HTML
   * @param {String} customText - Optional custom footer text
   * @returns {String} Footer HTML
   */
  getFooter: function(customText) {
    return `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding-bottom: 20px;">
            ${customText ? `<p style="margin: 0 0 16px 0; color: ${this.COLORS.mediumGray}; font-size: 14px; line-height: 1.6;">${customText}</p>` : ''}
            <p style="margin: 0 0 8px 0; color: ${this.COLORS.mediumGray}; font-size: 14px; font-weight: 600;">Contact Us:</p>
            <p style="margin: 0 0 4px 0; color: ${this.COLORS.lightGray}; font-size: 13px;">
              📧 <a href="mailto:${this.COMPANY.email}" style="color: ${this.COLORS.primaryBlue}; text-decoration: none;">${this.COMPANY.email}</a>
            </p>
            <p style="margin: 0; color: ${this.COLORS.lightGray}; font-size: 13px;">
              📞 <a href="tel:${this.COMPANY.phone}" style="color: ${this.COLORS.primaryBlue}; text-decoration: none;">${this.COMPANY.phone}</a>
            </p>
          </td>
        </tr>
      </table>
    `.trim();
  },
  
  /**
   * Get contact form submission email (HTML)
   * @param {Object} data - Form data
   * @returns {String} HTML email
   */
  getContactFormEmail: function(data) {
    const service = data.service || 'General Inquiry';
    const timestamp = new Date().toLocaleString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    const content = `
      <h2 style="margin: 0 0 24px 0; color: ${this.COLORS.darkGray}; font-size: 24px; font-weight: 700;">
        New Contact Form Submission
      </h2>
      
      <div style="background-color: ${this.COLORS.background}; border-left: 4px solid ${this.COLORS.primaryBlue}; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
        <p style="margin: 0 0 12px 0; color: ${this.COLORS.mediumGray}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          ${service}
        </p>
      </div>
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid ${this.COLORS.borderGray};">
            <p style="margin: 0; color: ${this.COLORS.mediumGray}; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Name</p>
            <p style="margin: 4px 0 0 0; color: ${this.COLORS.darkGray}; font-size: 16px;">${this.escapeHtml(data.name || 'N/A')}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid ${this.COLORS.borderGray};">
            <p style="margin: 0; color: ${this.COLORS.mediumGray}; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Email</p>
            <p style="margin: 4px 0 0 0; color: ${this.COLORS.darkGray}; font-size: 16px;">
              <a href="mailto:${data.email || ''}" style="color: ${this.COLORS.primaryBlue}; text-decoration: none;">${this.escapeHtml(data.email || 'N/A')}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid ${this.COLORS.borderGray};">
            <p style="margin: 0; color: ${this.COLORS.mediumGray}; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Phone</p>
            <p style="margin: 4px 0 0 0; color: ${this.COLORS.darkGray}; font-size: 16px;">
              ${data.phone ? `<a href="tel:${data.phone}" style="color: ${this.COLORS.primaryBlue}; text-decoration: none;">${this.escapeHtml(data.phone)}</a>` : 'N/A'}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0;">
            <p style="margin: 0; color: ${this.COLORS.mediumGray}; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Message</p>
            <p style="margin: 8px 0 0 0; color: ${this.COLORS.darkGray}; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${this.escapeHtml(data.message || 'No message provided')}</p>
          </td>
        </tr>
      </table>
      
      <div style="background-color: ${this.COLORS.background}; padding: 16px; border-radius: 8px; margin-top: 24px;">
        <p style="margin: 0; color: ${this.COLORS.lightGray}; font-size: 12px;">
          <strong>Submitted:</strong> ${timestamp}
        </p>
      </div>
      
      <div style="margin-top: 32px; text-align: center;">
        <a href="mailto:${data.email || this.COMPANY.email}?subject=Re: ${service}" 
           style="display: inline-block; padding: 14px 32px; background-color: ${this.COLORS.primaryBlue}; color: ${this.COLORS.white}; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Reply to Customer
        </a>
      </div>
    `;
    
    return this.getBaseTemplate({
      title: `New Contact: ${service}`,
      content: content,
      footerText: 'We\'ll respond to this inquiry as soon as possible.'
    });
  },
  
  /**
   * Get contact form submission email (Plain Text)
   * @param {Object} data - Form data
   * @returns {String} Plain text email
   */
  getContactFormEmailText: function(data) {
    const service = data.service || 'General Inquiry';
    const timestamp = new Date().toLocaleString();
    
    return `
NEW CONTACT FORM SUBMISSION
${'='.repeat(50)}

Service Interest: ${service}

Name: ${data.name || 'N/A'}
Email: ${data.email || 'N/A'}
Phone: ${data.phone || 'N/A'}

Message:
${data.message || 'No message provided'}

Submitted: ${timestamp}

${'='.repeat(50)}

Contact Information:
Email: ${this.COMPANY.email}
Phone: ${this.COMPANY.phone}

© ${new Date().getFullYear()} ${this.COMPANY.name}
    `.trim();
  },
  
  /**
   * Get quote/invoice email template
   * @param {Object} data - Quote data
   * @returns {String} HTML email
   */
  getQuoteEmail: function(data) {
    const content = `
      <h2 style="margin: 0 0 24px 0; color: ${this.COLORS.darkGray}; font-size: 24px; font-weight: 700;">
        Your Pool Project Quote
      </h2>
      
      <p style="margin: 0 0 24px 0; color: ${this.COLORS.mediumGray}; font-size: 16px; line-height: 1.6;">
        Thank you for your interest in ${this.COMPANY.name}! We're excited to help bring your pool vision to life.
      </p>
      
      ${data.quoteDetails || ''}
      
      <div style="margin-top: 32px; padding: 24px; background-color: ${this.COLORS.background}; border-radius: 8px;">
        <p style="margin: 0 0 12px 0; color: ${this.COLORS.darkGray}; font-size: 16px; font-weight: 600;">
          Next Steps:
        </p>
        <ul style="margin: 0; padding-left: 20px; color: ${this.COLORS.mediumGray}; font-size: 15px; line-height: 1.8;">
          <li>Review your quote details</li>
          <li>Schedule a consultation call</li>
          <li>Discuss timeline and project specifics</li>
        </ul>
      </div>
      
      <div style="margin-top: 32px; text-align: center;">
        <a href="tel:${this.COMPANY.phone}" 
           style="display: inline-block; padding: 14px 32px; background-color: ${this.COLORS.primaryBlue}; color: ${this.COLORS.white}; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin-right: 12px;">
          Call Us: ${this.COMPANY.phone}
        </a>
        <a href="mailto:${this.COMPANY.email}" 
           style="display: inline-block; padding: 14px 32px; background-color: ${this.COLORS.white}; color: ${this.COLORS.primaryBlue}; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; border: 2px solid ${this.COLORS.primaryBlue};">
          Email Us
        </a>
      </div>
    `;
    
    return this.getBaseTemplate({
      title: 'Your Pool Project Quote',
      content: content
    });
  },
  
  /**
   * Get appointment confirmation email
   * @param {Object} data - Appointment data
   * @returns {String} HTML email
   */
  getAppointmentEmail: function(data) {
    const content = `
      <h2 style="margin: 0 0 24px 0; color: ${this.COLORS.darkGray}; font-size: 24px; font-weight: 700;">
        Appointment Confirmed
      </h2>
      
      <p style="margin: 0 0 24px 0; color: ${this.COLORS.mediumGray}; font-size: 16px; line-height: 1.6;">
        Hi ${data.name || 'there'},
      </p>
      
      <p style="margin: 0 0 24px 0; color: ${this.COLORS.mediumGray}; font-size: 16px; line-height: 1.6;">
        Your appointment has been confirmed! We're looking forward to discussing your pool project.
      </p>
      
      <div style="background-color: ${this.COLORS.background}; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
        <p style="margin: 0 0 12px 0; color: ${this.COLORS.darkGray}; font-size: 16px; font-weight: 600;">
          Appointment Details:
        </p>
        <p style="margin: 4px 0; color: ${this.COLORS.mediumGray}; font-size: 15px;">
          <strong>Date:</strong> ${data.date || 'TBD'}
        </p>
        <p style="margin: 4px 0; color: ${this.COLORS.mediumGray}; font-size: 15px;">
          <strong>Time:</strong> ${data.time || 'TBD'}
        </p>
        <p style="margin: 4px 0; color: ${this.COLORS.mediumGray}; font-size: 15px;">
          <strong>Type:</strong> ${data.type || 'Consultation'}
        </p>
      </div>
      
      <div style="margin-top: 32px; text-align: center;">
        <a href="tel:${this.COMPANY.phone}" 
           style="display: inline-block; padding: 14px 32px; background-color: ${this.COLORS.primaryBlue}; color: ${this.COLORS.white}; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Need to Reschedule? Call Us
        </a>
      </div>
    `;
    
    return this.getBaseTemplate({
      title: 'Appointment Confirmed',
      content: content
    });
  },
  
  /**
   * Escape HTML to prevent XSS
   * @param {String} text - Text to escape
   * @returns {String} Escaped text
   */
  escapeHtml: function(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
  }
};

// Make it available globally
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmailTemplate;
}

