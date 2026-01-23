/**
 * QBO Email & Send Flow (Modular Version) - FIXED
 * -----------------------------------------
 * Automatically sends invoices to customers via QuickBooks Online
 * Excludes Siemens and Honeywell customers
 */

/*
To get a refresh token again go here

https://appcenter.intuit.com/connect/oauth2
  ?client_id=ABFEj4xs3FW9f1oCAEXrH0Ww04eFdJAbQSQwbq03imSVrkXLY4
  &response_type=code
  &scope=com.intuit.quickbooks.accounting
  &redirect_uri=https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl
  &state=xyz123
*/
import { runFulcrumProcessor } from './fulcrumProcessor.js';
// Add these imports at the top of your main file
import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-west-1' });
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-west-1' });

// ===========================
// Configuration Module
// ===========================
const config = {
  // SANDBOX Credentials (hardcoded for now)
  sandbox: {
    CLIENT_ID: "ABXwL9InXkQm2O8wAGHygNnKyb91FsWRcNuFDNoAAutFVVNgu7",
    CLIENT_SECRET: "DvfQ3Xtak9ETP2ElSiVl7LRlDsetGU9xaaWynPKA",
    REFRESH_TOKEN: "RT1-122-H0-17659241134a484oqup2plo8ptb5fc",
    ACCESS_TOKEN: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..sxA-sWtvbC4KV377uS_MFw.RGqvmGpHNCaHpTZMTueCGu1QfJknd0FlW8oHFjKhd8gBEbDDF97uRQQ_L6M5gIvPp-FFdXYgJ9uJ4vtL0elJOhmScnPobIqvsKV0gSiXeyDbyZrr6_kg7CBW_3iPlQEDTeoGrNRXRXB943-xoA5eNACAuqGjgkbmkfAmR8H7RJaJx7kyFtYcwsaGtp7rru_mQJ6_W6Actr-wAzeROpfzB-c90mUAhZyTreqj5pBejqPC-cn6GDjOdimmIRoKKWBTC0lBNQYJ9fhOvBiRIuEYk3PD6HdXU8f99VxqPNF_lOy6Dn2ZSxQWVIDkFvI9nrS9DlyDd-fZPGUvaU57hW8NLBirmh8ZPr3HRiO-aO73eLnU0ZgF3yuAo7zvlToc4cYE_IpoF6_oZm_kkniJHCMWSpbwEoxpm6qn5QsoeNjquBrW5L-KIdg1bhliNMyBWAnSJBBlJ3CCrUBVnv3yPC-r_Sz9YR591i6vQO89nSFxbd6QN5FZ9xnjGpNREBbSdsTwE7PNo5JCBkpWfQp43PjEVOipasT4F_aT4E9chz4cbr3maF2CuXaQDZ6BNa12-h5zCMRfVS5133sDTO-92DxM9bsn1FcIkJTYX9TlL5rlwcDU0qbXxl_WpKrumFF_ZAAn.18X9z7GHpVQdjQQZh80qTw",
    ID_TOKEN: "eyJraWQiOiJPUElDUFJEMDUxMDIwMjMiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOlsiQUJYd0w5SW5Ya1FtMk84d0FHSHlnTm5LeWI5MUZzV1JjTnVGRE5vQUF1dEZWVk5ndTciXSwic3ViIjoiZTRlYjIxYTgtYzRjZS0zZjBhLWJhNmEtYWFhYTAyZGI1YTgxIiwicmVhbG1pZCI6IjkzNDE0NTUyNzQwMzExNjMiLCJhdXRoX3RpbWUiOjE3NTcxOTc3MDQsImlzcyI6Imh0dHBzOi8vb2F1dGgucGxhdGZvcm0uaW50dWl0LmNvbS9vcC92MSIsImV4cCI6MTc1NzIwMTMxMywiaWF0IjoxNzU3MTk3NzEzfQ.C8HPxTuyv_ox7IVV5dH2jnEABnhF8NOqRWSQ5rXeY9B1ygPhsHMX27ES6ShXL3Eqw4tn9jjTsufkOhxBoxD4cR9Q_SiWJwwELtemluSYpTvCXz3ucvBdEyY3wQGbCPUG4kS9ltD35Eqn_0ICMFrE58aODRGa01VvhNM4gfVyuM62-rFdDmSYPqeSkeDtxFzgWff5rfyegAkfaFQAmOGhABE-hZBG1oZe5OSBmYtyYtZNYxww1co5U2_8aLxfxUL2AM8X-treMk5rt3qcelmNzX7Gse9TYSq9DcBebJ30SIBzcxwnGW2EwYB_31BjNOy743h_6HWUQxr8crCh4n7NNw",
    HOST: "https://sandbox-quickbooks.api.intuit.com/v3/company",
    REALM_ID: "9341455274031163",
    fulcrum_api_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJOYW1lIjoiaW52b2ljZV9zZW5kZXIiLCJSZXZvY2F0aW9uSWQiOiJjMTU0YTIzOC0yOTc4LTQ2MDUtOTc2YS1jYjYyMzZhNDhiN2UiLCJleHAiOjE4OTMzOTg0MDAsImlzcyI6InJzZ3NlY3VyaXR5LmZ1bGNydW1wcm8uY29tIiwiYXVkIjoicnNnc2VjdXJpdHkifQ.dL8xpD7ddikaSvI6vBKOJVHiaZgAJQt3HrBZyWHClqM"
  },
  
  // PRODUCTION Credentials
  production: {
    CLIENT_ID: "ABFEj4xs3FW9f1oCAEXrH0Ww04eFdJAbQSQwbq03imSVrkXLY4",
    CLIENT_SECRET: "5sYuOuGpVmHWErATqsUk4jmIrDfIu2GtnHy5sWfc",
    REFRESH_TOKEN: "RT1-130-H0-1774055940wv9v4sjzw6d75pvomba6",
    ACCESS_TOKEN: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..uzkKkgTR5wNRDgyy1GP2Zg.qyUWS_USgJz1-i-eKuVPNI9piBTrmpU5xioSNTH-Yg83aOVZ52nn2ZsZHTVCH7dXe_E1R1xKE81k5cSLeLZiwJo7xBn3Sy1VNwOn2saLNX1vxxdbE--9Fe9zRURLuLh3nEmVXroDIJwUXvO7uU-7EV1axA2av8ke2HmVu0Wx1TYhDBOLXyjPny1AYih-b4KmrEPfqoaweA7r1aGlFzOfdMRTOGRsUouhD62gS0504AFdiw1NbrnHfHkXWRqwbCxg0qOI2b0JZXjpVk0BWBDk2ZGfUXkqTY56hZfXl6GJmMecy9rdf-i8Sv59R3p3q1YvcK3Iz5RBgwsunHiYWS-ag8wiUBj368lbOxgiB4M14Z6Xa2q1aoXgRUg7OWI_dueia_FxPDwf-Zz-js_nTMfkfxWR9eNcfzGUYpN3_A6iLZW05q7Z1x0MRAgahC8JIBDuDj5PkvwvS-AWEDA85zNk6A6FBlGaT3RgWmgR6jciGiFYVLb0Qpf9E1Ih11La6eFmO9nPNaY6GbYj956Emu3IQjIIiq6xHOVNkpt80yiBi-v7jptd_lnG6da31ADevDPhEqbD_xbo5iwyc3APsAgAOnth3bOwMkfyydEI-Gd-qmN79MgPhhRoCo7E9A9iPAA1.3gSHSpuljCbWyI0X4cSTZA",
    HOST: "https://quickbooks.api.intuit.com/v3/company",
    REALM_ID: "9341453397929901",
    fulcrum_api_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJOYW1lIjoiaW52b2ljZV9zZW5kZXIiLCJSZXZvY2F0aW9uSWQiOiJjMTU0YTIzOC0yOTc4LTQ2MDUtOTc2YS1jYjYyMzZhNDhiN2UiLCJleHAiOjE4OTMzOTg0MDAsImlzcyI6InJzZ3NlY3VyaXR5LmZ1bGNydW1wcm8uY29tIiwiYXVkIjoicnNnc2VjdXJpdHkifQ.dL8xpD7ddikaSvI6vBKOJVHiaZgAJQt3HrBZyWHClqM"
  },
  
  // Common configuration
  TOKEN_URL: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  MINOR_VERSION: 75,
  
  // Business rules
  EXCLUDED_CUSTOMERS: ['siemens', 'honeywell'], // case-insensitive
  INCLUDED_CUSTOMERS: ['Hochiki', 'Johnson Controls Fire Protection LP', 'Anixter'
    , 'Tyco Fire & Security GmbH', 'Potter', 'Hager', 'HC Integrated Systems', 'Mass Merchandising'
    , 'MIRCOM TECHNOLOGIES, LTD', 'Prudential Lighting', 'SYSTEMS DEPOT', 'Commonwealth Lock Co.',
    'CONVERGINT TECHNOLOGIES LLC', 'Tyco Safety Products Canada Ltd', 'SECURITY DOOR CONTROL',
    'Doorking', 'Alarmax', 'ASSOCIATED FIRE PROTECTION', 'VES FIRE DETECTION SYSTEMS', '3S INCORPORATED'
    , 'ADI/TEXAS', 'Fire Device Company', 'Dortronics', 'MAMMOTH FIRE', 'Main Fire & Security'
    , 'DOORTEK SYSTEMS', 'BROOKS EQUIPMENT CO.', 'Killark', 'EZ Fire Inc', 'MONACO ENTERPRISES'
    , 'HIGH RISE PROTECTION', 'US ALARM & DETECTION SUPPLY, LLC', 'FIKE CORPORATION'
    , 'HUBBELL CARIBE LIMITED', 'Life Safety Consultants', 'FIRE ALARM.COM', 'UNICOM INC.'
    , 'OMLID & SWINNEY', 'MADISON SERVICE CORP.', 'SECURE DOOR & HARDWARE'
    , 'TOMCO SYSTEMS', 'RAVEL ELECTRONICS PVT LTD', 'TOTAL DOOR, AN OPENINGS COMPANY'
    , 'SECURITY DATA SUPPLY, LLC', 'MIRCOM INC.', 'Casey Fire Systems, Inc'
    , 'TSS INTEGRATED SYSTEMS', 'Interlog Corporation', 'DOOR SYSTEMS INC.'
    , 'ACCESS HARDWARE', 'GENERAL MONITORS SYSTEMS', 'SYSTEM DISTRIBUTORS'
    , 'CB Doors and Hardware, Inc.', 'Kidde Edwards', 'CHUBB-EDWARDS CANADA'
    , 'SECURITY WHOLESALERS INC.', 'TOMAR ELECTRONICS, INC', 'AUTOMATIC BUILDING CONTROLS'
    , 'KIDDE FENWAL INC', 'APS Fire Co', 'SAFETY STORAGE INC.', 'JM ELECTRONIC ENGINEERING INC.'
    , 'JIMS MACHINE', 'SIGNAL SOURCE', 'CONTINENTAL ALARM & DET. /NE'
    , 'IRL SYSTEMS', 'R.B. ALLEN CO', 'Best System Sales'
    , 'HLI Solutions, Inc.', 'BRONCO FIRE ALARM SYS.', 'Servo Dynamics Engineering Co., LTD'
  ]
};

// Email notification module
const emailModule = {
  fromEmail: process.env.FROM_EMAIL || 'dreuven@rsgsecurity.com',
  toEmails: (process.env.TO_EMAILS || 'ar@rsgsecurity.com').split(',').map(e => e.trim()),
  
  async sendSummaryEmail(results, fulcrumResults = null) {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; 
    const subject = `QBO Invoice Processing Summary on ${dateStr} - ${results.sent} sent, ${results.skipped} skipped, ${results.errors} errors`;
    
    var body = "";
    if(fulcrumResults){
      body = `
        Fulcrum Sending Results
        ========================
        ${fulcrumResults.processedInvoices.length} invoices processed
        ${fulcrumResults.errors.length} errors
        The errors are: ${fulcrumResults.errors}
        
      `
      if (fulcrumResults.processedInvoices.length > 0) {
        body += 'Processed Invoices:\n';
        fulcrumResults.processedInvoices.forEach(inv => {
          body += `- SO ${inv.soNumber}: ${inv.action} (Balance: $${inv.balance}, Total: $${inv.total})\n`;
        });
        body += '\n';
      }

      if (fulcrumResults.errors.length > 0) {
        body += '\n⚠️ FULCRUM ERRORS:\n';
        fulcrumResults.errors.forEach(err => {
          body += `- ${err}\n`;
        });
        body += '\n';
      }
    }
    body += `
      QBO Invoice Processing Summary
      ==============================
      Date: ${new Date().toISOString()}
      Environment: ${activeConfig === config.sandbox ? 'SANDBOX' : 'PRODUCTION'}

      Results:
      --------
      Total processed: ${results.processed}
      Successfully sent: ${results.sent}
      Skipped (excluded): ${results.skipped}
      Errors: ${results.errors}

    `;

    if (results.sent > 0) {
      body += '\nSuccessfully Sent:\n';
      results.details
        .filter(d => d.status === 'sent')
        .forEach(d => {
          body += `- Invoice ${d.invoiceNumber}: sent to ${d.email}\n`;
        });
    }

    if (results.skipped > 0) {
      body += '\n\n\nSkipped:\n\n';
      results.details
        .filter(d => d.status === 'skipped')
        .forEach(d => {
          if(!(d.customer.toLowerCase().includes('honeywell') || d.customer.toLowerCase().includes('siemens'))){
            body += `- Skipped invoice: ${d.invoiceId} for customer: ${d.customer} and was skipped because reason: ${d.reason}\n`;
          }
        });
    }

    if (results.errors > 0) {
        body += '\n\n\n ERROR DETAILS:\n\n';
        results.details
          .filter(d => d.status === 'error')
          .forEach(d => {
            body += `- Error with invoice: ${d.invoiceId} with error: ${d.error}\n`;
          });
    }

    const params = {
      Source: this.fromEmail,
      Destination: {
        ToAddresses: this.toEmails
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Text: {
            Data: body,
            Charset: 'UTF-8'
          }
        }
      }
    };

    try {
      await sesClient.send(new SendEmailCommand(params));
      console.log('[Email] Summary email sent successfully');
    } catch (error) {
      console.error('[Email] Failed to send summary email:', error);
    }
  }
};

// Use sandbox by default - change this to config.production for production
const activeConfig = config.production;
let currentRefreshToken = activeConfig.REFRESH_TOKEN;

// ===========================
// OAuth Module (REPLACEMENT)
// ===========================
const oauth = {
  accessToken: null,
  parameterName: `/qbo-invoice-sender/${activeConfig === config.production ? 'prod' : 'sandbox'}/refresh-token`,
  
  async loadRefreshToken() {
    try {
      const command = new GetParameterCommand({
        Name: this.parameterName,
        WithDecryption: true // for SecureString parameters
      });
      const response = await ssmClient.send(command);
      console.log("[OAuth] Loaded refresh token from Parameter Store");
      return response.Parameter.Value.trim();
    } catch (error) {
      console.log("[OAuth] No token in Parameter Store, using token from config");
      return activeConfig.REFRESH_TOKEN;
    }
  },
  
  async saveRefreshToken(token) {
    try {
      const command = new PutParameterCommand({
        Name: this.parameterName,
        Value: token,
        Type: 'SecureString',
        Overwrite: true
      });
      await ssmClient.send(command);
      console.log(`[OAuth] Saved refresh token to Parameter Store: ${this.parameterName}`);
    } catch (error) {
      console.error("[OAuth] Failed to save refresh token to Parameter Store:", error.message);
    }
  },
  
  async initialize() {
    console.log("[OAuth] Starting token refresh process...");
    
    // Load refresh token from file or fallback to config
    currentRefreshToken = await this.loadRefreshToken();
    
    const auth = Buffer.from(`${activeConfig.CLIENT_ID}:${activeConfig.CLIENT_SECRET}`).toString("base64");
    
    console.log("[OAuth] Making refresh token request...");
    
    try {
      const res = await fetch(config.TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: currentRefreshToken,
        }),
      });

      const responseText = await res.text();
      
      if (!res.ok) {
        console.error("[OAuth] Token refresh failed!");
        console.error(`[OAuth] Status: ${res.status}`);
        console.error(`[OAuth] Response: ${responseText}`);
        throw new Error(`Token refresh failed: ${res.status} - ${responseText}`);
      }

      const json = JSON.parse(responseText);
      
      // Update refresh token for this session
      currentRefreshToken = json.refresh_token;
      this.accessToken = json.access_token;
      
      // Save the new refresh token to file
      await this.saveRefreshToken(json.refresh_token);
      
      console.log("[OAuth] ✅ Token refresh successful!");
      console.log("[OAuth] New refresh token saved to file");
      console.log("[OAuth] Access token expires in:", json.expires_in, "seconds");
      
      return json.access_token;
      
    } catch (error) {
      console.error("[OAuth] Fatal error during token refresh:", error.message);
      throw error;
    }
  },
  
  getAccessToken() {
    if (!this.accessToken) {
      throw new Error("[OAuth] Access token not initialized. Call oauth.initialize() first.");
    }
    return this.accessToken;
  }
};

// ===========================
// QBO API Module
// ===========================
const qboAPI = {
  async get(pathAndQuery) {
    const url = `${activeConfig.HOST}/${activeConfig.REALM_ID}${pathAndQuery}`;
    
    // console.log(`[QBO API] GET ${pathAndQuery}`);
    
    try {
      const response = await fetch(url, {
        headers: { 
          Authorization: `Bearer ${oauth.accessToken}`, 
          Accept: "application/json" 
        },
      });
      
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error(`[QBO API] GET request failed!`);
        console.error(`[QBO API] URL: ${url}`);
        console.error(`[QBO API] Status: ${response.status}`);
        console.error(`[QBO API] Response: ${responseText}`);
        throw new Error(`GET ${pathAndQuery} failed: ${response.status} - ${responseText}`);
      }
      
      const data = JSON.parse(responseText);
    //   console.log(`[QBO API] ✅ GET successful`);
      
      return data;
      
    } catch (error) {
      console.error(`[QBO API] Error during GET request:`, error.message);
      throw error;
    }
  },

  async post(pathAndQuery, body) {
    const url = `${activeConfig.HOST}/${activeConfig.REALM_ID}${pathAndQuery}`;
    
    // console.log(`[QBO API] POST ${pathAndQuery}`);
    if (body) {
    //   console.log(`[QBO API] Request body:`, JSON.stringify(body, null, 2));
    }
    
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${oauth.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error(`[QBO API] POST request failed!`);
        console.error(`[QBO API] URL: ${url}`);
        console.error(`[QBO API] Status: ${response.status}`);
        console.error(`[QBO API] Response: ${responseText}`);
        throw new Error(`POST ${pathAndQuery} failed: ${response.status} - ${responseText}`);
      }
      
      const data = responseText ? JSON.parse(responseText) : {};
    //   console.log(`[QBO API] ✅ POST successful`);
      
      return data;
      
    } catch (error) {
      console.error(`[QBO API] Error during POST request:`, error.message);
      throw error;
    }
  },

  async postEmpty(pathAndQuery) {
    const url = `${activeConfig.HOST}/${activeConfig.REALM_ID}${pathAndQuery}`;
    
    console.log(`[QBO API] POST (empty) ${pathAndQuery}`);
    
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${oauth.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/octet-stream",
          "Content-Length": "0"
        }
      });

      const responseText = await response.text();
      
      if (!response.ok) {
        console.error(`[QBO API] POST (empty) request failed!`);
        console.error(`[QBO API] URL: ${url}`);
        console.error(`[QBO API] Status: ${response.status}`);
        console.error(`[QBO API] Response: ${responseText}`);
        throw new Error(`POST (empty) ${pathAndQuery} failed: ${response.status} - ${responseText}`);
      }
      
      return responseText ? JSON.parse(responseText) : {};
      
    } catch (error) {
      console.error(`[QBO API] Error during POST (empty) request:`, error.message);
      throw error;
    }
  },

  async query(queryString) {
    console.log(`[QBO API] Executing query:`, queryString.trim());
    const response = await this.get(`/query?minorversion=${config.MINOR_VERSION}&query=${encodeURIComponent(queryString)}`);
    return response.QueryResponse || {};
  },
  
  async queryPage(baseQuery, { start = 1, pageSize = 1000 } = {}) {
    const q = `${baseQuery} STARTPOSITION ${start} MAXRESULTS ${pageSize}`;
    return this.query(q);   // call the explicit reference
  },
  async queryAllInvoices (baseQuery, { pageSize = 1000, maxPages = 10 } = {}) {
    let start = 1;
    const all = [];

    for (let page = 0; page < maxPages; page++) {
        const { Invoice = [] } = await this.queryPage(baseQuery, { start, pageSize });
        all.push(...Invoice);

        if (Invoice.length < pageSize) break; // last page
        start += pageSize;
    }

    return all;
  },
  async queryAllInvoicesSince (baseQuery, { pageSize = 1000, sinceDate, maxPages = 200 } = {}) {
    let start = 1;
    const all = [];
    const sinceKey = sinceDate ? dateKeyFromDate(sinceDate) : null;

    for (let page = 0; page < maxPages; page++) {
        const q = `${baseQuery} STARTPOSITION ${start} MAXRESULTS ${pageSize}`;
        const { Invoice = [] } = await qboAPI.query(q);

        if (!Invoice.length) break;

        // Keep items in the window (if sinceDate provided)
        if (sinceKey) {
        for (const inv of Invoice) {
            const k = dateKeyFromQbo(inv.TxnDate);
            if (k !== null && k >= sinceKey) all.push(inv);
        }
        } else {
        all.push(...Invoice);
        }

        // Early stop: if the *last* row in this page is already older than 'since', no need to fetch more
        if (sinceKey) {
        const last = Invoice[Invoice.length - 1];
        const lastKey = dateKeyFromQbo(last?.TxnDate);
        if (lastKey !== null && lastKey < sinceKey) break;
        }

        // More pages
        if (Invoice.length < pageSize) break;
        start += pageSize;
    }

    return all;
  }
};

// ===========================
// Invoice Module
// ===========================
const invoiceModule = {
  async getUnsentUnpaidInvoices({ windowDays = 30 } = {}) {
    console.log("[Invoice] Fetching invoices (paged, limited by recent window, then filtering in JS)...");

    const base = `
    SELECT Id, DocNumber, Balance, EmailStatus, CustomerRef, BillEmail, TxnDate
    FROM Invoice
    ORDER BY TxnDate DESC
  `;

    const since = daysAgo(windowDays);
    const recentInvoices = await qboAPI.queryAllInvoicesSince(base, { pageSize: 1000, sinceDate: since });

    const unsentUnpaid = recentInvoices.filter(inv =>
        Number(inv.Balance) > 0 && (inv.EmailStatus === 'NeedToSend' || inv.EmailStatus === 'NotSet')
    );

    console.log(`[Invoice] Considered last ${windowDays} day(s): ${recentInvoices.length} invoices; ` +
                `${unsentUnpaid.length} are unsent with balance > 0`);
    return unsentUnpaid;
  },
  async getJCIFireProtectionInvoices({ windowDays = 720 } = {}) {
    console.log("[Invoice] Fetching invoices (paged, limited by recent window, then filtering in JS)...");

    const base = `
    SELECT Id, DocNumber, Balance, EmailStatus, CustomerRef, BillEmail, TxnDate
    FROM Invoice
    ORDER BY TxnDate DESC
  `;

    const since = daysAgo(windowDays);
    const recentInvoices = await qboAPI.queryAllInvoicesSince(base, { pageSize: 1000, sinceDate: since });

    const unsentUnpaid = recentInvoices.filter(inv => {
      if(inv.CustomerRef.name == 'Johnson Controls Fire Protection LP'){
        try{
            // return Number(inv.Balance) > 0 && inv.BillEmail.Address.includes('americas.invoice') && !inv.BillEmail.Address.toLowerCase().includes("PTP-Scanning-SG-US-535@jci.com".toLowerCase())
            return Number(inv.Balance) > 0;
        } catch (err){
            console.log('error is: ', err);
            return false;
        }
        
      } else{
            return false;
      }
    });

    console.log(`[Invoice] Considered last ${windowDays} day(s): ${recentInvoices.length} invoices; ` +
                `${unsentUnpaid.length} are unsent with balance > 0`);
    return unsentUnpaid;
  },
  async getFullInvoice(id) {
    // console.log(`[Invoice] Fetching full details for invoice ID: ${id}`);
    const { Invoice } = await qboAPI.get(`/invoice/${id}?minorversion=${config.MINOR_VERSION}`);
    // console.log(`[Invoice] Retrieved invoice #${Invoice.DocNumber}`);
    return Invoice;
  },
  
  async updateInvoice(fullInvoice, fieldsToUpdate) {
    // console.log(`[Invoice] Updating invoice ID: ${fullInvoice.Id}`);

    const body = {
        Id: fullInvoice.Id,
        SyncToken: fullInvoice.SyncToken,
        sparse: true,                 // <-- REQUIRED in the BODY
        ...fieldsToUpdate
    };

    const result = await qboAPI.post(
        `/invoice?minorversion=${config.MINOR_VERSION}`, // <-- no &sparse=true here
        body
    );

    const invoice = result.Invoice || result;
    // console.log(`[Invoice] Successfully updated invoice #${invoice.DocNumber}`);
    return invoice;
  },

  async sendInvoice(invoiceId, sendTo = null) {
    // console.log(`[Invoice] Sending invoice ID: ${invoiceId}`);
    const qp = new URLSearchParams({ minorversion: String(config.MINOR_VERSION) });
    if (sendTo) qp.append("sendTo", sendTo);
    
    await qboAPI.postEmpty(`/invoice/${invoiceId}/send?${qp.toString()}`);
    
    // console.log(`[Invoice] ✅ Successfully sent invoice`);
    return true;
  }
};

// ===========================
// Customer Module
// ===========================
const customerModule = {
  async getCustomersMap(invoices) {
    console.log("[Customer] Building customer map...");
    
    const customerIds = [...new Set(invoices.map(i => i.CustomerRef?.value).filter(Boolean))];
    if (!customerIds.length) {
      console.log("[Customer] No customer IDs found in invoices");
      return {};
    }
    
    console.log(`[Customer] Fetching details for ${customerIds.length} unique customer(s)`);
    
    const query = `SELECT Id, DisplayName, PrimaryEmailAddr FROM Customer WHERE Id IN (${customerIds.map(id => `'${id}'`).join(',')})`;
    const { Customer = [] } = await qboAPI.query(query);
    
    const customerMap = {};
    for (const customer of Customer) {
      customerMap[customer.Id] = { 
        DisplayName: customer.DisplayName, 
        PrimaryEmail: customer.PrimaryEmailAddr?.Address || null
      };
      console.log(`[Customer] Loaded: ${customer.DisplayName} (${customer.PrimaryEmailAddr?.Address || 'no email'})`);
    }
    
    return customerMap;
  },

  isExcludedCustomer(customerName) {
    if (!customerName) return false;
    
    const lowerName = customerName.toLowerCase();
    const isExcluded = config.EXCLUDED_CUSTOMERS.some(excluded => 
      lowerName.includes(excluded.toLowerCase())
    );

    const isIncluded = config.INCLUDED_CUSTOMERS.some(cust_name => 
      lowerName.includes(cust_name.toLowerCase())
    );
    
    if (isExcluded) {
      console.log(`[Customer] Customer "${customerName}" matches exclusion list`);
    }
    
    return isExcluded || !isIncluded;
  }
};

// ===========================
// Shipping Module (no create; discover-only + per-run cache)
// ===========================
const shippingModule = {
  _cacheByName: new Map(), // nameLower -> { value, name }

  async resolveShipMethodByName(name) {
    if (!name) {
      console.log("[Shipping] No shipping method name provided");
      return null;
    }
    const key = name.trim().toLowerCase();
    if (this._cacheByName.has(key)) return this._cacheByName.get(key);

    console.log(`[Shipping] Resolving ShipMethod by scanning transactions: "${name}"`);
    // Try normal window first, then widen
    const found = await this.findShipMethodRefOnTransactions(key) ||
                  await this.findShipMethodRefOnTransactions(key, /*widen*/ true);

    if (found) {
      this._cacheByName.set(key, found);
      console.log(`[Shipping] Using ShipMethod from transactions: ${found.name} (ID: ${found.value})`);
      return found;
    }

    console.warn(`[Shipping] ShipMethod "${name}" not found in recent transactions. Will not set ShipMethodRef.`);
    return null;
  },

  /**
   * Search across recent transactions to discover an existing ShipMethodRef.
   * We cannot query ShipMethod directly and cannot create it via API.
   */
  async findShipMethodRefOnTransactions(targetLower, widen = false) {
    const tryEntities = [
      { entity: 'Invoice',        order: 'TxnDate DESC' },
      { entity: 'SalesReceipt',   order: 'TxnDate DESC' },
      { entity: 'Estimate',       order: 'TxnDate DESC' },
      { entity: 'PurchaseOrder',  order: 'TxnDate DESC' }
    ];
    const MAXRESULTS = widen ? 500 : 200;

    for (const { entity, order } of tryEntities) {
      try {
        const q = `
          SELECT Id, ShipMethodRef
          FROM ${entity}
          WHERE ShipMethodRef != ''
          ORDER BY ${order}
          STARTPOSITION 1
          MAXRESULTS ${MAXRESULTS}
        `;
        const resp = await qboAPI.query(q);
        const rows = resp[entity] || [];
        const hit = rows.find(r => r?.ShipMethodRef?.name && r.ShipMethodRef.name.toLowerCase() === targetLower);
        if (hit?.ShipMethodRef?.value) {
          return { value: hit.ShipMethodRef.value, name: hit.ShipMethodRef.name };
        }
      } catch (e) {
        console.log(`[Shipping] Skipped scanning ${entity}: ${e.message}`);
      }
    }
    return null;
  }
};


// ===========================
// Utilities Module
// ===========================
const utils = {
  normalizeEmails(input) {
    if (!input) return '';
    
    const raw = Array.isArray(input) ? input.join(',') : String(input);
    const tokens = raw.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
    const isValidEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    
    return [...new Set(tokens.filter(isValidEmail).map(s => s.toLowerCase()))].join(', ');
  }
};

// ===========================
// External Data Module - Fulcrum Integration (v3 shipments)
// ===========================
const externalDataModule = {
  fulcrumBaseUrl: 'https://api.fulcrumpro.com/api',
  
  // ---- Add these cache containers inside externalDataModule ----
    _pagedCache: {
        '/invoices/list': { data: null, promise: null },   // single cache for all invoices
        '/shipments/list': new Map(),                      // key: salesOrderId -> { data, promise }
        '/shipment-line-items/list': new Map(),            // key: shipmentId   -> { data, promise }
        '/shipments/lines/list': new Map()                 // fallback path, key: shipmentId -> { data, promise }
    },
    _clearPagedCache() {
        this._pagedCache['/invoices/list'] = { data: null, promise: null };
        this._pagedCache['/shipments/list'].clear();
        this._pagedCache['/shipment-line-items/list'].clear();
        this._pagedCache['/shipments/lines/list'].clear();
        console.log('[Fulcrum] pagedList cache cleared');
    },

    async prewarmInvoicesCache({ forceRefresh = false, max = 50000000 } = {}) {
    // console.log(`[Fulcrum] Prewarming invoice cache (forceRefresh=${!!forceRefresh})`);
    const res = await this.getAllInvoices(max, { useCache: true, forceRefresh });
    // console.log(`[Fulcrum] Invoice cache size: ${res.length}`);
    return res;
    },

  // ---------- PUBLIC ENTRY ----------

  async fetchExternalDataForInvoice({ invoice }) {
    console.log(`[Fulcrum] Starting data fetch for invoice #${invoice.DocNumber}`);

    try {
      // 1) Find the corresponding Fulcrum invoice
      const fulcrumInvoice =
        await this.findFulcrumInvoiceByQbo(invoice)
        //  || await this.findFulcrumInvoiceByPO(this.extractCustomerPO(invoice)) ||
        // await this.findFulcrumInvoiceByDocNumber(invoice.DocNumber);

      if (!fulcrumInvoice) {
        console.log(`[Fulcrum] No matching Fulcrum invoice found for QBO ${invoice.Id}/${invoice.DocNumber}`);
        throw({message: `[Fulcrum] No matching Fulcrum invoice found for QBO ${invoice.Id}/${invoice.DocNumber}`})
      }
    //   console.log(`[Fulcrum] Matched Fulcrum invoice ${fulcrumInvoice.id} (number ${fulcrumInvoice.number})`);

      // 2) Pull shipments for the sales order
      const salesOrderId = fulcrumInvoice.salesOrderId;
      if (!salesOrderId) {
        console.log('[Fulcrum] Invoice has no salesOrderId; cannot trace shipments.');
        throw({message: `[Fulcrum] Invoice has no salesOrderId; cannot trace shipments. ${invoice.Id}/${invoice.DocNumber}`})
      }

      const shipments = await this.listShipmentsForSalesOrder(salesOrderId);
      if (!shipments.length) {
        console.log('[Fulcrum] No shipments found for SO:', salesOrderId);
        throw({message: `[Fulcrum] No shipments found for SO: ${invoice.Id}/${invoice.DocNumber}/Sales OrderId in Fulcrum:${salesOrderId}`});
      }

      // 3) Choose the most relevant shipment
      const bestShipment = await this.chooseShipment({
        shipments,
        qbInvoice: invoice,
        fulcrumInvoice
      });

      if (!bestShipment) {
        console.log('[Fulcrum] Could not determine a relevant shipment.');
        throw({message: `[Fulcrum] Could not determine a relevant shipment: ${invoice.Id}/${invoice.DocNumber}/Sales OrderId in Fulcrum:${salesOrderId}`});
      }

    //   console.log(`[Fulcrum] Chosen shipment ${bestShipment.number} (${bestShipment.id}), shipDate=${bestShipment.shipDate}`);

      // 4) Build return payload for QBO update
      const trackingNumber =
        bestShipment.trackingNumber ||
        (Array.isArray(bestShipment.trackingNumbers) ? bestShipment.trackingNumbers.find(Boolean) : null) ||
        null;

      if(!trackingNumber){
        console.log(`[Fulcrum] Could not determine a trackingNumber: QBO Invoice Id: ${invoice.Id} /QBO Invoice: ${invoice.DocNumber} /Sales OrderId in Fulcrum:${salesOrderId}}`);
        throw({message: `[Fulcrum] Could not determine a trackingNumber: QBO Invoice Id: ${invoice.Id} /QBO Invoice: ${invoice.DocNumber} /Sales OrderId in Fulcrum:${salesOrderId}}`});
      }

      const shipDate = bestShipment.shippedDate || null;
      const shipMethodName = bestShipment.shippingMethod?.name || bestShipment.shippingMethodName || null;

      const customerPONumber = fulcrumInvoice?.customerPONumber || null;
      
      if(!customerPONumber){
        console.log(`[Fulcrum] No Customer PO number configured in Fulcrum: QBO Invoice Id: ${invoice.Id} /QBO Invoice: ${invoice.DocNumber} /Sales OrderId in Fulcrum:${salesOrderId}}`);
        throw({message: `[Fulcrum] Could find a configured PO number in Fulcrum: QBO Invoice Id: ${invoice.Id} /QBO Invoice: ${invoice.DocNumber} /Sales OrderId in Fulcrum:${salesOrderId}}`});
      }

      return {
        trackingNumber,
        shipDate,
        shipMethodName: shipMethodName || await this.resolveShippingMethodName(bestShipment.shippingMethodId),
        customerPONumber
      };

    } catch (err) {
      console.error('[Fulcrum] Error in fetchExternalDataForInvoice:', err.message);
      throw({message: JSON.stringify(err)});
    }
  },

  // ---------- MATCHING HELPERS ----------

  extractCustomerPO(qbInvoice) {
    // QBO “P.O. Number” is often a CustomField named exactly that
    const poField = qbInvoice.CustomField?.find(f => f.Name === 'P.O. Number' && f.StringValue);
    return poField?.StringValue || null;
  },

  async findFulcrumInvoiceByQbo(qbInvoice) {
    // Match by externalReferences (e.g., qbo-invoice / quickbooks / qboInvoiceId / qbo)
    const all = await this.getAllInvoices();
    const idStr = String(qbInvoice.Id);
    const docStr = String(qbInvoice.DocNumber);

    return all.find(inv => {
      const refs = inv.externalReferences || {};
      const keys = ['qbo-invoice', 'quickbooks', 'qboInvoiceId', 'qbo'];
      return keys.some(k => {
        const v = refs[k];
        if (!v) return false;
        const s = typeof v === 'object' ? (v.externalId || v.id || v.value) : String(v);
        return s === idStr || s === docStr;
      });
    }) || null;
  },

  async findFulcrumInvoiceByPO(customerPO) {
    if (!customerPO) return null;
    const all = await this.getAllInvoices();
    return all.find(inv => inv.customerPONumber === customerPO) || null;
  },

  async findFulcrumInvoiceByDocNumber(qbDocNumber) {
    if (!qbDocNumber) return null;
    const n = parseInt(String(qbDocNumber).replace(/\D/g, ''), 10);
    if (Number.isNaN(n)) return null;
    const all = await this.getAllInvoices();
    return all.find(inv => inv.number === n) || null;
  },

  // ---------- FULCRUM LIST HELPERS (robust pagination) ----------

  // ---- Replace your pagedList with this version ----
  //NOTE: PAY ATTENTION TO THE MAX NUMBER OF SHIPMENTS CONFIGURED. IF SURPASSED, IT WILL NOT RETRIEVE ALL ITEMS
  //AND THEREFORE WILL BE MISSING FROM THE RETURN.
  async pagedList(endpoint, baseBody = {}, { pageSize = 50, max = 5000000, forceRefresh = false } = {}) {
    // Decide which cache bucket + key to use based on endpoint
    let store = this._pagedCache[endpoint];
    let key = 'ALL'; // default key for single-bucket endpoints

    if (endpoint === '/shipments/list') {
        // Cache per Sales Order
        store = this._pagedCache['/shipments/list'];
        key = baseBody.salesOrderId || 'ALL';
    } else if (endpoint === '/shipment-line-items/list' || endpoint === '/shipments/lines/list') {
        // Cache per Shipment
        store = this._pagedCache[endpoint];
        const firstId =
        Array.isArray(baseBody.shipmentIds) && baseBody.shipmentIds.length
            ? baseBody.shipmentIds[0]
            : 'ALL';
        key = firstId;
    } else if (endpoint === '/invoices/list') {
        // single cache entry already set above
    } else {
        // Unknown endpoint: skip caching (use a one-off fetch)
        store = null;
    }

    // Read cached entry (supports both object {data,promise} and Map key -> {data,promise})
    const getEntry = () => {
        if (!store) return null;
        if (store instanceof Map) return store.get(key) || null;
        return store; // object bucket
    };
    const setEntry = (entry) => {
        if (!store) return;
        if (store instanceof Map) store.set(key, entry);
        else this._pagedCache[endpoint] = entry;
    };

    if (!forceRefresh) {
        const entry = getEntry();
        if (entry?.data) return entry.data;
        if (entry?.promise) return entry.promise;
    }

    const TAKE = Math.min(pageSize, 50); // many tenants cap at 50
    const seenFirstKeys = new Set();

    const promise = (async () => {
        const all = [];
        let skip = 0;

        while (skip < max) {
        // Put Skip/Take on the query string (body often ignored)
        const qs = new URLSearchParams({ Skip: String(skip), Take: String(TAKE) }).toString();
        const endpointWithQuery = `${endpoint}?${qs}`;

        const resp = await this.fulcrumRequest('POST', endpointWithQuery, { ...baseBody });

        const page = Array.isArray(resp) ? resp : (resp?.data || []);
        const count = page.length;
        if (!count) break;

        // Guard against repeated first page
        const firstKey = page[0]?.id || page[0]?.number || JSON.stringify(page[0]);
        if (firstKey && seenFirstKeys.has(firstKey) && skip > 0) {
            console.warn('[Fulcrum] Pagination repeating same page; stopping to avoid loop.');
            break;
        }
        if (firstKey) seenFirstKeys.add(firstKey);

        all.push(...page);
        skip += count;
        if (count < TAKE) break; // last page
        }

        setEntry({ data: all, promise: null });
        return all;
    })();

    // Latch the in-flight request so concurrent callers share it
    setEntry({ data: null, promise });

    try {
        const data = await promise;
        return data;
    } finally {
        // After resolution, clear the promise latch (data already stored)
        const entry = getEntry();
        if (entry && entry.promise) setEntry({ data: entry.data, promise: null });
    }
  },


    // Fetch all invoices once per run (memoized in-memory)
    // Prewarm just uses pagedList-backed getAllInvoices
    async prewarmInvoicesCache({ forceRefresh = false, max = 5000 } = {}) {
    console.log(`[Fulcrum] Prewarming invoice cache (forceRefresh=${!!forceRefresh})`);
    const res = await this.getAllInvoices(max, { forceRefresh });
    console.log(`[Fulcrum] Invoice cache size: ${res.length}`);
    return res;
    },

    // Clear only the pagedList cache bucket for invoices
    clearInvoicesCache() {
    this._pagedCache['/invoices/list'] = { data: null, promise: null };
    console.log('[Fulcrum] Invoice cache cleared');
    },

    // Fetch all invoices once per run (memoized via pagedList’s internal cache)
    async getAllInvoices(max = 50000000, { forceRefresh = false } = {}) {
        const invoices = await this.pagedList(
            '/invoices/list',
            { 'Sort.Field': 'issueDate', 'Sort.Dir': 'descending' },
            { pageSize: 50, max, forceRefresh }
        );
        console.log(`[Fulcrum] Invoices fetched (cached per run): ${invoices.length}`);
        return invoices;
    },

    async listShipmentsForSalesOrder(salesOrderId) {
        const shipments = await this.pagedList('/shipments/list', {
        salesOrderId,
        shipmentStatus: 'shipped',
        'Sort.Field': 'shipDate',
        'Sort.Dir': 'descending'
        }, { pageSize: 50, max: 2000 });
        return shipments;
    },

    async getShipmentById(id) {
        return this.fulcrumRequest('GET', `/shipments/${id}`);
    },

    async listShipmentLineItems(shipmentId) {
        // Prefer the v3 "shipment-line-items" list endpoint
        try {
        const items = await this.pagedList('/shipment-line-items/list', {
            shipmentIds: [shipmentId]
        }, { pageSize: 50, max: 1000 });
        return items;
        } catch (e) {
        // Fallback for tenants with older/alternate path
        try {
            const items2 = await this.pagedList('/shipments/lines/list', {
            shipmentIds: [shipmentId]
            }, { pageSize: 50, max: 1000 });
            return items2;
        } catch {
            console.warn('[Fulcrum] Shipment line items list endpoint not available; continuing without item match.');
            return [];
        }
        }
    },

    async resolveShippingMethodName(id) {
        if (!id) return null;
        try {
        const sm = await this.fulcrumRequest('GET', `/shipping-methods/${id}`);
        return sm?.name || null;
        } catch {
        return null;
        }
    },

  // ---------- SHIPMENT SELECTION ----------

    async chooseShipment({ shipments, qbInvoice, fulcrumInvoice }) {
        if (!shipments.length) return null;

        // Check for duplicate ship dates on the last two shipments
        if (shipments.length >= 2) {
            // Sort by shipment number to get the most recent ones
            const sortedByNumber = [...shipments].sort((a, b) => {
                const getShipmentNumber = (shipment) => {
                    const match = (shipment.name || '').match(/-(\d+)$/);
                    return match ? parseInt(match[1]) : 0;
                };
                return getShipmentNumber(b) - getShipmentNumber(a);
            });

            // Get the last two shipments
            const lastTwo = sortedByNumber.slice(0, 2);
            
            // Compare their shipped dates
            const date1 = lastTwo[0].shippedDate;
            const date2 = lastTwo[1].shippedDate;
            
            if (date1 && date2) {
                // Convert to date strings for comparison (ignoring time)
                const dateStr1 = new Date(date1).toISOString().split('T')[0];
                const dateStr2 = new Date(date2).toISOString().split('T')[0];
                
                if (dateStr1 === dateStr2) {
                    const errorMsg = `[Fulcrum] Multiple shipments with same date detected. ` +
                        `Shipments ${lastTwo[0].name} and ${lastTwo[1].name} both shipped on ${dateStr1}. ` +
                        `QBO Invoice: ${qbInvoice.DocNumber}, Fulcrum Invoice: ${fulcrumInvoice.number}`;
                    console.error(errorMsg);
                    throw({message: errorMsg});
                }
            }
        }
        // 0) Prefer shipments that explicitly reference this invoice
        const linked = [];
        for (const s of shipments) {
        const full = await this.getShipmentById(s.id).catch(() => null);
        if (!full) continue;

        const refs = full.externalReferences || {};
        const refVals = Object.values(refs).map(v =>
            typeof v === 'object' ? (v.externalId || v.id || v.value) : v
        );

        const hasInvoiceLink =
            (Array.isArray(full.invoiceIds) && full.invoiceIds.includes(fulcrumInvoice.id)) ||
            refVals.includes(fulcrumInvoice.id) ||
            refVals.includes(String(fulcrumInvoice.number));

        if (hasInvoiceLink) linked.push(full);

        // Preload line items for scoring later
        full._lineItems = await this.listShipmentLineItems(full.id);
        }

        if (linked.length) {
          linked.sort((a, b) => new Date(b.shipDate || b.createdAt) - new Date(a.shipDate || a.createdAt));
          return linked[0];
        }

        // 1) Score by line-item overlap, then by proximity to invoice date
        const qbTokens = this.tokensFromQboInvoice(qbInvoice);
        const scored = [];

        for (const s of shipments) {
          const full = await this.getShipmentById(s.id).catch(() => null);
          if (!full) continue;
          const lineItems = full._lineItems || await this.listShipmentLineItems(full.id);
          const shipTokens = this.tokensFromShipmentLines(lineItems);

          const overlap = this.jaccard(qbTokens, shipTokens);
          const dateScore = this.dateProximityScore(new Date(full.shipDate || full.createdAt), qbInvoice.TxnDate);

          scored.push({ full, overlap, dateScore });
        }

        if (scored.length) {
          scored.sort((a, b) => (b.overlap - a.overlap) || (b.dateScore - a.dateScore));
          return scored[0].full;
        }

        // 2) Fallback: most recent shipped
        // Most recent shipped, with robust fallback
        const pickDate = s => s.shippedDate ?? s.shipByDate ?? s.createdAt ?? null;

        const ts = s => {
            const t = Date.parse(pickDate(s));
            return Number.isNaN(t) ? -Infinity : t; // put undated items at the end
        };

        const sorted = [...shipments].sort((a, b) => ts(b) - ts(a));
        return sorted[0];
    },

    tokensFromQboInvoice(qbInvoice) {
        const set = new Set();
        for (const ln of qbInvoice.Line || []) {
        const name = ln.SalesItemLineDetail?.ItemRef?.name || '';
        const desc = (ln.Description || '').toString();
        this.addSkuLikeTokens(set, name);
        this.addSkuLikeTokens(set, desc);
        }
        return set;
    },

    tokensFromShipmentLines(lines) {
        const set = new Set();
        for (const li of lines || []) {
        // common fields on line items
        this.addSkuLikeTokens(set, li.itemCode || li.partNumber || li.itemName || '');
        this.addSkuLikeTokens(set, li.description || '');
        }
        return set;
    },

    addSkuLikeTokens(set, text) {
        if (!text) return;
        for (const t of String(text).split(/[^A-Za-z0-9\-_.]+/)) {
        const tok = t.trim();
        if (tok.length >= 2) set.add(tok.toLowerCase());
        }
    },

    jaccard(aSet, bSet) {
        if (!aSet.size || !bSet.size) return 0;
        let inter = 0;
        for (const t of aSet) if (bSet.has(t)) inter++;
        return inter / (aSet.size + bSet.size - inter);
    },

    dateProximityScore(shipDate, qbTxnDateStr) {
        if (!shipDate || !qbTxnDateStr) return 0;
        const qb = new Date(qbTxnDateStr);
        const diffDays = Math.abs(shipDate - qb) / (24*3600*1000);
        // score 0..1, declining over ~10 days
        return Math.max(0, 1 - (diffDays / 10));
    },

  // ---------- LOW-LEVEL FETCH ----------

async fulcrumRequest(method, endpoint, body = null) {
    const url = `${this.fulcrumBaseUrl}${endpoint}`;
    const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${activeConfig.fulcrum_api_key}`
    };

    const options = { method, headers };
    if (body && method !== 'GET') options.body = JSON.stringify(body);

    console.log(`[Fulcrum] ${method} ${endpoint}`);
    if (body) console.log(`[Fulcrum] Request body:`, JSON.stringify(body, null, 2));

    const res = await fetch(url, options);
    const txt = await res.text();
    if (!res.ok) throw new Error(`Fulcrum API error: ${res.status} - ${txt}`);
    return txt ? JSON.parse(txt) : {};
}
};

// ===========================
// Invoice Processing Module
// ===========================
const invoiceProcessor = {
  async processInvoice(invoice, customersMap) {
    await sleep(50); // small pacing
    // console.log(`\n[Processor] === Processing Invoice ID: ${invoice.Id} ===`);
    if (invoice.DocNumber == 'F7045'){
      console.log('Issue over here. Break break dance dance.');
    }
    try {
      // Get full invoice details
      const fullInvoice = await invoiceModule.getFullInvoice(invoice.Id);

        if(fullInvoice?.CustomField?.[0].Name !== 'P.O. Number'){
            //TODO: I want to log this issue and not break the program but note which invoice the value with the F in front has the issue
            throw({message: 'WARNING PO FIELD HAS CHANGED, ordering'})
        }

      const customer = customersMap[fullInvoice.CustomerRef?.value] || {};
      if (!customer.PrimaryEmail){
        console.log('No customer primary email defined. Erroring.')
        throw({message: `Customer ${customer.DisplayName} has no primary email defined`});
      }

      // Exclusions
      if (customerModule.isExcludedCustomer(customer.DisplayName)) {
        console.log(`[Processor] ⚠️  Skipping invoice #${fullInvoice.DocNumber} - excluded customer`);
        return { 
            skipped: true, reason: `excluded_customer. The customer is: ${customer.DisplayName}`
          , customer: customer.DisplayName, invoiceNumber: fullInvoice.DocNumber 
        };
      }
      
      // External data (Fulcrum)
    //   console.log(`[Processor] Fetching external data for tracking/shipping...`);
      const externalData = await externalDataModule.fetchExternalDataForInvoice({
        invoice: fullInvoice
      });

      // Recipients
      const recipients = customer.PrimaryEmail ? utils.normalizeEmails(customer.PrimaryEmail) : '';
      if (!recipients) {
        console.log(`[Processor] ⚠️  Warning: No email addresses configured for customer ${customer.DisplayName}`);
        throw({message: `No recipients to send email to for QBO. After normalizeEmail call for customer ${customer.DisplayName}`})
      }
      // Tracking. We specifically check for this in the fetchExternalDataForInvoice function and error if it is not present.
      const tracking = externalData.trackingNumber;

    //   let shipMethodRef = fullInvoice.ShipMethodRef || null;
    //   let shipMethodText = null; // <-- declare this
    //   if (externalData?.shipMethodName) {
    //     console.log(`[Processor] Looking up shipping method from external data...`);
    //     const resolved = await shippingModule.resolveShipMethodByName(externalData.shipMethodName);
    //     if (resolved) shipMethodRef = resolved;
    //     else shipMethodText = externalData.shipMethodName; // fallback text
    //   }

      if (customer.DisplayName == "Potter"){
        console.log("Hello harry. You are a powerful enough wizard now after all these years. Well played ol boy.")
      }

      const qboShipDate = toQboDate(externalData?.shipDate); // YYYY-MM-DD

      // Build sparse update
      const fieldsToUpdate = {};
      if (recipients)              fieldsToUpdate.BillEmail = { Address: recipients };
      if (tracking)                fieldsToUpdate.TrackingNum = tracking;
      if (qboShipDate)             fieldsToUpdate.ShipDate = qboShipDate;
    //   if (shipMethodRef?.value)    fieldsToUpdate.ShipMethodRef = shipMethodRef;
      // Note: We specifically check for this in the fetchExternalDataForInvoice function and error if it is not present.
      const staged = setPoCustomFieldIfBlank(fullInvoice, externalData.customerPONumber, fieldsToUpdate);
      
      fieldsToUpdate.CustomerMemo = {value: `Ship Method: ${externalData.shipMethodName}`};

      // Update invoice if needed
      let updatedInvoice = fullInvoice;
      if (Object.keys(fieldsToUpdate).length) {
        updatedInvoice = await invoiceModule.updateInvoice(fullInvoice, fieldsToUpdate);
        if(updatedInvoice?.CustomField?.[0].Name !== 'P.O. Number'){
            //note I want to log this issue and not break the program but note which invoice the value with the F in front has the issue
            throw({message: `Either the custom field name "P.O. Number" has been changed in Fulcrum or the ordering has changed. Please see ${fullInvoice.DocNumber}`})
        }
        else if(!updatedInvoice?.CustomField?.[0]?.StringValue){
            throw({message: `We need to process the following invoice manually. No PO value: ${fullInvoice.DocNumber} and the customer PO Number is: ${externalData.customerPONumber.toString()}`})
        } else if(!updatedInvoice?.TrackingNum){
          throw({message: `We need to process the following invoice manually. No Tracking number: ${fullInvoice.DocNumber} and the customer PO Number is: ${externalData.customerPONumber.toString()}`})
        }
      }

      // Send
      console.log(`[Processor] Sending invoice #${updatedInvoice.DocNumber}...`);
      await invoiceModule.sendInvoice(updatedInvoice.Id);

      console.log(`[Processor] ✅ Successfully sent invoice #${updatedInvoice.DocNumber}`);
      console.log(`[Processor] Recipients: ${updatedInvoice.BillEmail?.Address || 'None'}`);

      return {
        success: true,
        invoiceNumber: updatedInvoice.DocNumber,
        email: updatedInvoice.BillEmail?.Address
      };

    } catch (error) {
      console.error(`[Processor] ❌ Error processing invoice:`, error.message);
      throw error;
    }
  }
};


// ===========================
// Main Application Module
// ===========================
const app = {
  async run() {
    console.log('=====================================');
    console.log('QBO Invoice Send Process');
    console.log('=====================================');
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log(`Environment: ${activeConfig === config.sandbox ? 'SANDBOX' : 'PRODUCTION'}`);
    console.log('=====================================\n');
    
    try {
      // Step 0: Initialize OAuth (refresh token once at startup)
      console.log('🔐 Initializing authentication...');
      try {
        await oauth.initialize();
        console.log('✅ Authentication successful!\n');
      } catch (error) {
        console.error('❌ Authentication failed!');
        console.error('Please check your credentials and refresh token.');
        throw error;
      }
      
      // Step 1: Get unsent invoices
      console.log('📋 Fetching unsent invoices...');
      const invoices = await invoiceModule.getUnsentUnpaidInvoices();
      if (!invoices.length) {
        //TODO: Send an email saying there is nothing to process
        console.log('No invoices to process.');
        console.log('\n=====================================');
        console.log('Process completed with no work to do.');
        console.log('=====================================');
        return { processed: 0, sent: 0, skipped: 0, errors: 0 };
      }
      
      console.log(`Found ${invoices.length} invoice(s) to process.\n`);
      
      // Step 2: Get customer information
      console.log('👥 Loading customer information...');
      const customersMap = await customerModule.getCustomersMap(invoices);
      console.log(`Loaded ${Object.keys(customersMap).length} unique customer(s).\n`);
      
      // Step 3: Process each invoice
      console.log('📨 Processing invoices...');
      console.log('=====================================');
      
      const results = {
        processed: 0,
        sent: 0,
        skipped: 0,
        errors: 0,
        details: []
      };
    
      for (const invoice of invoices) {
        results.processed++;
        
        try {
          const result = await invoiceProcessor.processInvoice(invoice, customersMap);          
          if (result.skipped) {
            results.skipped++;
            results.details.push({
              invoiceId: invoice.Id,
              status: 'skipped',
              reason: result.reason,
              customer: result.customer
            });
          } else if (result.success) {
            results.sent++;
            results.details.push({
              invoiceId: invoice.Id,
              invoiceNumber: result.invoiceNumber,
              status: 'sent',
              email: result.email
            });
          }
        } catch (error) {
          results.errors++;
          results.details.push({
            invoiceId: invoice.DocNumber,
            status: 'error',
            error: error.message,
            rawErrorObj: JSON.stringify(error)
          });
          console.error(`\n❌ Failed to process invoice ID=${invoice.DocNumber}`);
          console.error(`Error: ${error.message}\n`);
        }
      }
      
      // Step 4: Summary
      console.log('\n=====================================');
      console.log('PROCESS SUMMARY');
      console.log('=====================================');
      console.log(`Total processed: ${results.processed}`);
      console.log(`✅ Successfully sent: ${results.sent}`);
      console.log(`⚠️  Skipped (excluded): ${results.skipped}`);
      console.log(`❌ Errors: ${results.errors}`);
      console.log(`Completed at: ${new Date().toISOString()}`);
      
      // Log any errors for review
      if (results.errors > 0) {
        console.log('\nERROR DETAILS:');
        results.details
          .filter(d => d.status === 'error')
          .forEach(d => {
            console.log(`- Invoice ${d.invoiceId}: ${d.error}`);
          });
      }
      
      console.log('=====================================\n');
      
      return results;
      
    } catch (error) {
        //TODO: Try sending an email here and if it fails then just log. It's ok to crash here
      console.error('\n=====================================');
      console.error('FATAL ERROR');
      console.error('=====================================');
      console.error('The process failed with a fatal error:');
      console.error(error.message);
      console.error('\nStack trace:');
      console.error(error.stack);
      console.error('=====================================\n');
      throw error;
    }
  }
};

// ============================================
// LOCAL EXECUTION (for testing)
// ============================================
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    console.log('[Local] Running in local mode...\n');
    
    let fulcrumResults = null;
    
    try {
      const fulcrumUsername = process.env.FULCRUM_USERNAME || 'dreuven@rsgsecurity.com';
      const fulcrumPassword = process.env.FULCRUM_PASSWORD || 'Levered76!';
      
      if (fulcrumUsername && fulcrumPassword) {
        console.log('🤖 Running Fulcrum processor (visible browser)...\n');
        fulcrumResults = await runFulcrumProcessor(
          fulcrumUsername,
          fulcrumPassword,
          false // headless=false for local (visible browser)
        );
      }
      
      console.log('\n📧 Running QBO processor...\n');
      const qboResults = await app.run();
      
      await emailModule.sendSummaryEmail(qboResults, fulcrumResults);
      
      console.log('\n✓ Local execution completed\n');
      
      process.exit(qboResults.errors > 0 || (fulcrumResults && fulcrumResults.errors.length > 0) ? 1 : 0);
      
    } catch (err) {
      console.error('\n✗ Local execution failed:', err);

      // Try to send error notification email
      try {
        await emailModule.sendSummaryEmail(
          { processed: 0, sent: 0, skipped: 0, errors: 1, details: [
            { status: 'error', invoiceId: 'SYSTEM', error: `Fatal system error: ${err.message}\n\nStack trace:\n${err.stack}` }
          ]},
          fulcrumResults
        );
        console.log('[Email] Error notification sent');
      } catch (emailError) {
        console.error('[Email] Failed to send error notification:', emailError.message);
      }

      process.exit(1);
    }
  })();
}

// Export modules for testing or external use
export {
  app,
  oauth,
  qboAPI,
  invoiceModule,
  customerModule,
  shippingModule,
  utils,
  externalDataModule,
  invoiceProcessor
};

// ---- utils: dates (add once) ----
function dateKeyFromDate(d) {
  // yyyymmdd as number
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return y * 10000 + m * 100 + day;
}

function dateKeyFromQbo(txnDateStr) {
  // Accepts 'YYYY-MM-DD' or 'YYYY/MM/DD'
  if (!txnDateStr) return null;
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(txnDateStr);
  if (!m) return null;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

function daysAgo(n) {
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - n);
  return d;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toQboDate(dateish) {
  if (!dateish) return null;
  const s = String(dateish);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already date-only
  const d = new Date(s);                        // handles ISO with Z/offsets
  if (Number.isNaN(d.getTime())) return null;
  // Use UTC to avoid off-by-one issues
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function setPoCustomField(fullInvoice, poValue, fieldsToUpdate, fieldName = 'P.O. Number') {
  const val = (poValue ?? '').toString().trim();
  if (!val) return false;

  const existing = Array.isArray(fullInvoice.CustomField) ? fullInvoice.CustomField : [];
  const row = existing.find(cf => (cf?.Name || '').toLowerCase() === fieldName.toLowerCase());
  if (!row) return false; // CF not present on this invoice/form

  // Send only the row you want to modify; omit Name to avoid mismatches.
  fieldsToUpdate.CustomField = [{
    DefinitionId: row.DefinitionId,               // e.g. "1"
    Type: row.Type || 'StringType',
    StringValue: val
  }];
  return true;
}

// function setPoCustomFieldIfBlank(fullInvoice, poValue, fieldsToUpdate, fieldName = 'P.O. Number') {
//   const val = (poValue ?? '').toString().trim();
//   if (!val) return false;

//   const existing = Array.isArray(fullInvoice.CustomField) ? fullInvoice.CustomField : [];
//   if (!existing.length) return false;

//   const idx = existing.findIndex(cf => (cf?.Name || '').toLowerCase() === fieldName.toLowerCase());
//   if (idx === -1) return false; // the PO custom field doesn't exist on this invoice

//   const current = (existing[idx].StringValue ?? '').toString().trim();
//   if (current) return false;     // already filled, do nothing

//   const merged = existing.map((cf, i) => i === idx ? { ...cf, StringValue: val } : cf);
//   fieldsToUpdate.CustomField = merged; // IMPORTANT: send the full array you got from the invoice
//   return true;
// }

function setPoCustomFieldIfBlank(fullInvoice, poValue, fieldsToUpdate) {
  const val = (poValue ?? '').toString().trim();
  if (!val) return false;

  const existingCF = Array.isArray(fullInvoice.CustomField) ? fullInvoice.CustomField : [];
  const poIdx = existingCF.findIndex(cf => (cf?.Name || '').toLowerCase() === 'p.o. number');

  if (poIdx >= 0) {
    const currentVal = (existingCF[poIdx].StringValue ?? '').toString().trim();
    // if (!currentVal) {
      const mergedCF = existingCF.map((cf, i) => i === poIdx ? { ...cf, StringValue: val} : cf);
      fieldsToUpdate.CustomField = mergedCF;
    //   return true;
    // }
    return true;
  } else {
    const existingNote = fullInvoice.PrivateNote || '';
    const noteLine = `PO: ${val}`;
    if (!existingNote.includes(noteLine)) {
      const sep = existingNote ? ' | ' : '';
      fieldsToUpdate.PrivateNote = (existingNote + sep + noteLine).slice(0, 4000);
      return true;
    }
    return false;
  }
}

// Lambda handler
export const handler = async (event, context) => {
  console.log('[Lambda] Starting invoice processing...');
  
  let qboResults;
  let fulcrumResults = null;
  
  try {
    // =====================================
    // STAGE 1: FULCRUM PROCESSING
    // =====================================
    console.log('\n🤖 Stage 1: Fulcrum Invoice Processing\n');
    
    const fulcrumUsername = "dreuven@rsgsecurity.com";
    const fulcrumPassword = "Levered76!";
    
    if (!fulcrumUsername || !fulcrumPassword) {
      console.warn('[Fulcrum] Credentials not provided, skipping Fulcrum processing');
      console.warn('[Fulcrum] Pass credentials in event: { fulcrumUsername, fulcrumPassword }');
    } else {
      try {
        fulcrumResults = await runFulcrumProcessor(
          fulcrumUsername,
          fulcrumPassword,
          true // headless mode for Lambda
        );
        
        console.log(`\n[Fulcrum] Completed - ${fulcrumResults.processedInvoices.length} processed, ${fulcrumResults.errors.length} errors\n`);
      } catch (fulcrumError) {
        console.error('[Fulcrum] Processing failed:', fulcrumError);
        fulcrumResults = {
          processedInvoices: [],
          errors: [`Fatal Fulcrum error: ${fulcrumError.message}`],
          success: false
        };
      }
    }
    
    // =====================================
    // STAGE 2: QBO PROCESSING
    // =====================================
    console.log('\n📧 Stage 2: QBO Invoice Sending\n');
    
    qboResults = await app.run();
    
    console.log(`\n[QBO] Completed - ${qboResults.sent} sent, ${qboResults.errors} errors\n`);
    
    // =====================================
    // SEND COMBINED EMAIL SUMMARY
    // =====================================
    await emailModule.sendSummaryEmail(qboResults, fulcrumResults);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Invoice processing completed',
        fulcrum: fulcrumResults ? {
          processed: fulcrumResults.processedInvoices.length,
          errors: fulcrumResults.errors.length,
          success: fulcrumResults.success
        } : { skipped: true },
        qbo: {
          processed: qboResults.processed,
          sent: qboResults.sent,
          skipped: qboResults.skipped,
          errors: qboResults.errors
        }
      })
    };
    
  } catch (error) {
    console.error('[Lambda] Fatal error:', error);

    try {
      // Create error details for the email
      const errorResults = qboResults || { processed: 0, sent: 0, skipped: 0, errors: 1, details: [
        { status: 'error', invoiceId: 'SYSTEM', error: `Fatal system error: ${error.message}\n\nStack trace:\n${error.stack}` }
      ]};

      // If qboResults exists but doesn't have this error, add it
      if (qboResults && !qboResults.details.some(d => d.invoiceId === 'SYSTEM')) {
        errorResults.errors++;
        errorResults.details.push({
          status: 'error',
          invoiceId: 'SYSTEM',
          error: `Fatal system error: ${error.message}\n\nStack trace:\n${error.stack}`
        });
      }

      await emailModule.sendSummaryEmail(errorResults, fulcrumResults);
      console.log('[Email] Error notification sent');
    } catch (emailError) {
      console.error('[Email] Failed to send error notification:', emailError);
    }

    throw error;
  }
};
