// Login Web App - Google Apps Script
// Serves the Login HTML interface

function doGet() {
  // Load the HTML file (you'll need to upload Login_Embed.html to this Apps Script project)
  return HtmlService.createHtmlOutputFromFile('Login_Embed')
    .setTitle('Login - Team Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // Allow embedding in iframe
}

