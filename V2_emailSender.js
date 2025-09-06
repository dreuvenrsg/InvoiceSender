/**
 * QBO Email & Send Flow (Modular Version)
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
import fetch from "node-fetch";

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
    REALM_ID: "9341455274031163"
  },
  
  // PRODUCTION Credentials (commented out)
  production: {
    CLIENT_ID: "ABFEj4xs3FW9f1oCAEXrH0Ww04eFdJAbQSQwbq03imSVrkXLY4",
    CLIENT_SECRET: "5sYuOuGpVmHWErATqsUk4jmIrDfIu2GtnHy5sWfc",
    REFRESH_TOKEN: "RT1-50-H0-1765926631tl5xo9ya7g0klvew83hc",
    ACCESS_TOKEN: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..uzkKkgTR5wNRDgyy1GP2Zg.qyUWS_USgJz1-i-eKuVPNI9piBTrmpU5xioSNTH-Yg83aOVZ52nn2ZsZHTVCH7dXe_E1R1xKE81k5cSLeLZiwJo7xBn3Sy1VNwOn2saLNX1vxxdbE--9Fe9zRURLuLh3nEmVXroDIJwUXvO7uU-7EV1axA2av8ke2HmVu0Wx1TYhDBOLXyjPny1AYih-b4KmrEPfqoaweA7r1aGlFzOfdMRTOGRsUouhD62gS0504AFdiw1NbrnHfHkXWRqwbCxg0qOI2b0JZXjpVk0BWBDk2ZGfUXkqTY56hZfXl6GJmMecy9rdf-i8Sv59R3p3q1YvcK3Iz5RBgwsunHiYWS-ag8wiUBj368lbOxgiB4M14Z6Xa2q1aoXgRUg7OWI_dueia_FxPDwf-Zz-js_nTMfkfxWR9eNcfzGUYpN3_A6iLZW05q7Z1x0MRAgahC8JIBDuDj5PkvwvS-AWEDA85zNk6A6FBlGaT3RgWmgR6jciGiFYVLb0Qpf9E1Ih11La6eFmO9nPNaY6GbYj956Emu3IQjIIiq6xHOVNkpt80yiBi-v7jptd_lnG6da31ADevDPhEqbD_xbo5iwyc3APsAgAOnth3bOwMkfyydEI-Gd-qmN79MgPhhRoCo7E9A9iPAA1.3gSHSpuljCbWyI0X4cSTZA",
    HOST: "https://quickbooks.api.intuit.com/v3/company",
    REALM_ID: "9341453397929901"
  },
  
  // Common configuration
  TOKEN_URL: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  MINOR_VERSION: 65,
  
  // Business rules
  EXCLUDED_CUSTOMERS: ['siemens', 'honeywell'] // case-insensitive
};

// Use sandbox by default
const activeConfig = config.sandbox;
let currentRefreshToken = activeConfig.REFRESH_TOKEN;

// ===========================
// OAuth Module
// ===========================
const oauth = {
  accessToken: null,
  
  async initialize() {
    console.log("[OAuth] Starting token refresh process...");
    
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
      
      console.log("[OAuth] ✅ Token refresh successful!");
      console.log("[OAuth] ⚠️  NEW REFRESH TOKEN (save for next run):");
      console.log(`[OAuth] ${json.refresh_token}`);
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
    
    console.log(`[QBO API] GET ${pathAndQuery}`);
    
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
      console.log(`[QBO API] ✅ GET successful`);
      
      return data;
      
    } catch (error) {
      console.error(`[QBO API] Error during GET request:`, error.message);
      throw error;
    }
  },

  async post(pathAndQuery, body) {
    const url = `${activeConfig.HOST}/${activeConfig.REALM_ID}${pathAndQuery}`;
    
    console.log(`[QBO API] POST ${pathAndQuery}`);
    if (body) {
      console.log(`[QBO API] Request body:`, JSON.stringify(body, null, 2));
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
      console.log(`[QBO API] ✅ POST successful`);
      
      return data;
      
    } catch (error) {
      console.error(`[QBO API] Error during POST request:`, error.message);
      throw error;
    }
  },

  async query(queryString) {
    console.log(`[QBO API] Executing query:`, queryString.trim());
    const response = await this.get(`/query?minorversion=${config.MINOR_VERSION}&query=${encodeURIComponent(queryString)}`);
    return response.QueryResponse || {};
  }
};

// ===========================
// Invoice Module
// ===========================
const invoiceModule = {
  async getUnsentUnpaidInvoices() {
    console.log("[Invoice] Fetching invoices...");
    
    // Get all invoices and filter in JavaScript
    const query = `SELECT Id, DocNumber, Balance, EmailStatus, CustomerRef, BillEmail FROM Invoice ORDER BY TxnDate DESC`;
    
    const { Invoice = [] } = await qboAPI.query(query);
    
    // Filter for unsent and unpaid invoices
    const unsentUnpaidInvoices = Invoice.filter(inv => 
        inv.EmailStatus === 'NeedToSend' && inv.Balance > 0
    );
    
    console.log(`[Invoice] Found ${Invoice.length} total invoice(s), ${unsentUnpaidInvoices.length} are unsent with balance > 0`);
    
    return unsentUnpaidInvoices;
  },

  async getFullInvoice(id) {
    const { Invoice } = await qboAPI.get(`/invoice/${id}?minorversion=${config.MINOR_VERSION}`);
    return Invoice;
  },

  async updateInvoice(invoiceId, syncToken, fieldsToUpdate) {
    const body = { 
      Invoice: { 
        Id: invoiceId, 
        SyncToken: syncToken, 
        sparse: true, 
        ...fieldsToUpdate 
      } 
    };
    const { Invoice } = await qboAPI.post(`/invoice?minorversion=${config.MINOR_VERSION}`, body);
    return Invoice;
  },

  async sendInvoice(invoiceId) {
    await qboAPI.post(`/invoice/${invoiceId}/send?minorversion=${config.MINOR_VERSION}`, null);
    return true;
  }
};

// ===========================
// Customer Module
// ===========================
const customerModule = {
  async getCustomersMap(invoices) {
    const customerIds = [...new Set(invoices.map(i => i.CustomerRef?.value).filter(Boolean))];
    if (!customerIds.length) return {};
    
    const query = `SELECT Id, DisplayName, PrimaryEmailAddr FROM Customer WHERE Id IN (${customerIds.map(id => `'${id}'`).join(',')})`;
    const { Customer = [] } = await qboAPI.query(query);
    
    const customerMap = {};
    for (const customer of Customer) {
      customerMap[customer.Id] = { 
        DisplayName: customer.DisplayName, 
        PrimaryEmail: customer.PrimaryEmailAddr?.Address || null 
      };
    }
    return customerMap;
  },

  isExcludedCustomer(customerName) {
    if (!customerName) return false;
    const lowerName = customerName.toLowerCase();
    return config.EXCLUDED_CUSTOMERS.some(excluded => 
      lowerName.includes(excluded.toLowerCase())
    );
  }
};

// ===========================
// Shipping Module
// ===========================
const shippingModule = {
  async resolveShipMethodByName(name) {
    if (!name) return null;
    
    const query = `SELECT Name, Id FROM ShipMethod WHERE Name = '${name.replace(/'/g,"''")}'`;
    const { ShipMethod = [] } = await qboAPI.query(query);
    
    if (!ShipMethod.length) return null;
    return { value: ShipMethod[0].Id, name: ShipMethod[0].Name };
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
// External Data Module
// ===========================
const externalDataModule = {
  async fetchExternalDataForInvoice({ invoice, customer }) {
    // TODO: Implement your external API integration here
    // This is a placeholder that returns empty data
    return {
      // additionalEmails: ['ops@example.com', 'ap@example.com'],
      // trackingNumber: '1Z999AA10123456784',
      // shipMethodName: 'UPS Ground'
    };
  }
};

// ===========================
// Invoice Processing Module
// ===========================
const invoiceProcessor = {
  async processInvoice(invoice, customersMap) {
    // Get full invoice details
    const fullInvoice = await invoiceModule.getFullInvoice(invoice.Id);
    const customer = customersMap[fullInvoice.CustomerRef?.value] || {};
    
    // Check if customer should be excluded
    if (customerModule.isExcludedCustomer(customer.DisplayName)) {
      console.log(`Skipping invoice #${fullInvoice.DocNumber} for ${customer.DisplayName} (excluded customer)`);
      return { skipped: true, reason: 'excluded_customer' };
    }
    
    // Fetch external data
    const externalData = await externalDataModule.fetchExternalDataForInvoice({ 
      invoice: fullInvoice, 
      customer 
    });
    
    // Prepare email recipients
    let recipients = '';
    if (externalData?.additionalEmails?.length) {
      recipients = utils.normalizeEmails(externalData.additionalEmails);
    } else {
      recipients = utils.normalizeEmails([
        fullInvoice.BillEmail?.Address, 
        customer.PrimaryEmail
      ]);
    }
    
    // Prepare tracking and shipping info
    const tracking = externalData?.trackingNumber || fullInvoice.TrackingNum || null;
    let shipMethodRef = fullInvoice.ShipMethodRef || null;
    
    if (externalData?.shipMethodName) {
      const resolved = await shippingModule.resolveShipMethodByName(externalData.shipMethodName);
      if (resolved) shipMethodRef = resolved;
    }
    
    // Build update fields
    const fieldsToUpdate = {};
    if (recipients) fieldsToUpdate.BillEmail = { Address: recipients };
    if (tracking) fieldsToUpdate.TrackingNum = tracking;
    if (shipMethodRef?.value) fieldsToUpdate.ShipMethodRef = shipMethodRef;
    
    // Update invoice if needed
    let updatedInvoice = fullInvoice;
    if (Object.keys(fieldsToUpdate).length) {
      updatedInvoice = await invoiceModule.updateInvoice(
        fullInvoice.Id, 
        fullInvoice.SyncToken, 
        fieldsToUpdate
      );
      console.log(`Updated invoice #${updatedInvoice.DocNumber}: email="${updatedInvoice.BillEmail?.Address}"`);
    }
    
    // Send the invoice
    await invoiceModule.sendInvoice(updatedInvoice.Id);
    console.log(`✅ Sent invoice #${updatedInvoice.DocNumber} to ${updatedInvoice.BillEmail?.Address}`);
    
    return { 
      success: true, 
      invoiceNumber: updatedInvoice.DocNumber,
      email: updatedInvoice.BillEmail?.Address 
    };
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
              reason: result.reason
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
            invoiceId: invoice.Id,
            status: 'error',
            error: error.message
          });
          console.error(`\n❌ Failed to process invoice ID=${invoice.Id}`);
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
      
      // Save new refresh token reminder
      if (currentRefreshToken !== activeConfig.REFRESH_TOKEN) {
        console.log('⚠️  IMPORTANT: Update your refresh token for next run!');
        console.log(`New refresh token: ${currentRefreshToken}`);
        console.log('=====================================\n');
      }
      
      return results;
      
    } catch (error) {
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

// ===========================
// Entry Point
// ===========================
if (import.meta.url === `file://${process.argv[1]}`) {
  app.run()
    .then(results => {
      process.exit(results.errors > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
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