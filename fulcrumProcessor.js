/**
 * Fulcrum Invoice Processor - Browser Automation for Invoice Creation
 * Runs BEFORE QBO processing to create and issue invoices in Fulcrum
 */

import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const IS_LOCAL = !process.env.AWS_LAMBDA_FUNCTION_NAME;

// Helper function to replace page.waitForTimeout (removed in Puppeteer v21+)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Configuration
const config = {
  baseUrl: 'https://rsgsecurity.fulcrumpro.com',
  invoicingUrl: 'https://rsgsecurity.fulcrumpro.com/ui/invoicing',
  loginUrl: 'https://rsgsecurity.fulcrumpro.com/ui/login',
  
  timeouts: {
    navigation: 35000,
    elementWait: 30000,
    actionDelay: 6000,
    modalWait: 6000,
    pageStabilization: 6000
  }
};
config.timeouts.navigation
// TTS for local development (Sheila Bot announcement)
async function playWelcomeTTS() {
  if (!IS_LOCAL) return;
  try {
    const message = "Hello, I am the Sheila Bot Invoice Processor 3000. Beginning program execution.";
    const command = process.platform === 'darwin' ? `say "${message}"` : `echo "${message}"`;
    await execAsync(command);
  } catch (error) {
    console.log('[TTS] Not available');
  }
}

// Initialize browser (headless for Lambda, visible for local)
// Initialize browser (headless for Lambda, visible for local)
async function initBrowser(headless = true) {
  console.log('[Browser] Initializing...');
  console.log('[Env] AWS_LAMBDA_FUNCTION_NAME:', process.env.AWS_LAMBDA_FUNCTION_NAME || '(local)');
  console.log('[Env] NODE_VERSION:', process.version);

  const DEFAULT_NAV_TIMEOUT = config.timeouts.navigation;
  const DEFAULT_WAIT_TIMEOUT = config.timeouts.elementWait;

  let browserConfig;

  if (IS_LOCAL) {
    browserConfig = {
      executablePath: process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/google-chrome',
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    };
  } else {
    const execPath = await chromium.executablePath();
    console.log('[Chromium] executablePath:', execPath || '(none)');

    browserConfig = {
      executablePath: execPath,
      // Pass boolean headless directly; don't call chromium.setHeadlessMode()
      headless, 
      args: [
        ...chromium.args,
        '--disable-dev-shm-usage',
        '--disable-features=site-per-process',
        '--no-zygote',
        '--single-process'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    };
  }

  const browser = await puppeteer.launch(browserConfig);
  const page = await browser.newPage();

  page.setDefaultNavigationTimeout(DEFAULT_NAV_TIMEOUT);
  page.setDefaultTimeout(DEFAULT_WAIT_TIMEOUT);

  // Block images/fonts in Lambda for speed
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (!IS_LOCAL && (type === 'image' || type === 'font')) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.setViewport({ width: 1920, height: 1080 });
  console.log('[Browser] Ready');
  return { browser, page };
}

// Login to Fulcrum
async function login(page, username, password) {
  console.log('[Login] Logging in...');
  
  await page.goto(config.loginUrl, { waitUntil: 'networkidle2', timeout: config.timeouts.navigation });
  
  // Enter username
  await page.waitForSelector('input[type="email"]', { visible: true, timeout: config.timeouts.elementWait });
  await page.type('input[type="email"]', username);
  
  // Enter password
  await page.waitForSelector('input[type="password"]', { visible: true, timeout: config.timeouts.elementWait });
  await page.type('input[type="password"]', password);
  
  // Submit
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.timeouts.navigation })
  ]);
  
  await delay(config.timeouts.actionDelay);
  console.log('[Login] Success');
}

// Navigate to invoicing page
async function goToInvoicing(page) {
  console.log('[Nav] Going to invoicing page...');
  await page.goto(config.invoicingUrl, { waitUntil: 'networkidle2', timeout: config.timeouts.navigation });
  await delay(config.timeouts.actionDelay);
}

// Click the "NEEDS ACTION" button at the top
async function clickNeedsAction(page) {
  console.log('[Nav] Clicking NEEDS ACTION...');

  await page.waitForSelector('button', { visible: true, timeout: config.timeouts.elementWait });

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const needsActionBtn = buttons.find(btn => btn.textContent.includes('NEEDS ACTION'));
    if (needsActionBtn) {
      needsActionBtn.click();
      return true;
    }
    return false;
  });

  if (!clicked) throw new Error('NEEDS ACTION button not found');

  await delay(config.timeouts.pageStabilization);
  console.log('[Nav] NEEDS ACTION clicked');
}

// Verify NEEDS ACTION filter is active
async function verifyNeedsActionActive(page) {
  const isActive = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const needsActionBtn = buttons.find(btn => btn.textContent.includes('NEEDS ACTION'));
    // Check if button has active/selected class (common patterns: active, selected, btn-primary, etc.)
    return needsActionBtn && (
      needsActionBtn.classList.contains('active') ||
      needsActionBtn.classList.contains('btn-primary') ||
      needsActionBtn.classList.contains('selected') ||
      needsActionBtn.getAttribute('aria-pressed') === 'true'
    );
  });

  if (!isActive) {
    console.log('[Nav] WARNING: NEEDS ACTION filter may not be active!');
  }

  return isActive;
}

// Read paginator state from the current table view
async function getPageInfo(page) {
  return page.evaluate(() => {
    const allPages = Array.from(document.querySelectorAll('.p-paginator-page'));
    const currentPage = document.querySelector('.p-paginator-page.p-paginator-page-selected');
    const nextButton = document.querySelector('.p-paginator-next');
    const isNextDisabled = !!nextButton && (
      nextButton.classList.contains('p-paginator-element-disabled') ||
      nextButton.disabled ||
      nextButton.getAttribute('aria-disabled') === 'true'
    );

    const parsedCurrent = currentPage ? parseInt(currentPage.textContent.trim(), 10) : 1;

    return {
      totalPages: allPages.length,
      currentPageNum: Number.isNaN(parsedCurrent) ? 1 : parsedCurrent,
      hasNextButton: !!nextButton,
      isNextDisabled
    };
  });
}

// Restore paginator to the desired page after reloading NEEDS ACTION
async function goToPage(page, targetPageNum) {
  if (!targetPageNum || targetPageNum <= 1) return;

  let pageInfo = await getPageInfo(page);
  if (pageInfo.totalPages <= 1) return;

  const desiredPage = Math.min(targetPageNum, pageInfo.totalPages);
  if (desiredPage <= pageInfo.currentPageNum) return;

  let attempts = 0;
  while (pageInfo.currentPageNum < desiredPage && attempts < desiredPage + 5) {
    const clicked = await page.evaluate(() => {
      const nextButton = document.querySelector('.p-paginator-next');
      if (nextButton && !nextButton.classList.contains('p-paginator-element-disabled')) {
        nextButton.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      console.log(`[Pagination] Could not advance from page ${pageInfo.currentPageNum} while restoring to page ${desiredPage}`);
      return;
    }

    await delay(config.timeouts.pageStabilization);
    const previousPageNum = pageInfo.currentPageNum;
    pageInfo = await getPageInfo(page);
    attempts++;

    if (pageInfo.currentPageNum <= previousPageNum) {
      console.log(`[Pagination] Page did not advance while restoring (still at ${pageInfo.currentPageNum})`);
      return;
    }
  }

  console.log(`[Pagination] Restored to page ${pageInfo.currentPageNum}/${pageInfo.totalPages}`);
}

async function returnToNeedsActionPage(page, targetPageNum) {
  await goToInvoicing(page);
  await clickNeedsAction(page);
  await goToPage(page, targetPageNum);
}

// Extract data from a row
async function extractRowData(row) {
  try {
    const data = await row.evaluate(el => {
      // Get Sales Order Balance
      const balanceEl = el.querySelector('cdk-cell.cdk-column-salesOrderBalance');
      const balanceText = balanceEl ? balanceEl.textContent.trim() : '$0.00';
      const balance = parseFloat(balanceText.replace(/[$,]/g, '')) || 0;
      
      // Get Invoice Total
      const totalEl = el.querySelector('cdk-cell.cdk-column-invoice-total');
      const totalText = totalEl ? totalEl.textContent.trim() : '$0.00';
      const total = parseFloat(totalText.replace(/[$,]/g, '')) || 0;
      
      // Check for REFUND badge
      const hasRefund = !!el.querySelector('.refund-badge');
      
      // Get Sales Order Number
      const soLink = el.querySelector('cdk-cell.cdk-column-salesOrderNumber a b');
      const soNumber = soLink ? soLink.textContent.trim() : 'Unknown';
      
      return { balance, total, hasRefund, soNumber };
    });
    
    return data;
  } catch (error) {
    console.error('[Row] Failed to extract data:', error.message);
    return null;
  }
}

// CUSTOMIZE THIS: Your business logic for which invoices to process
function shouldProcessRow(balance, total, hasRefund, hasCreate, hasIssue) {
  // Skip refunds
  if (hasRefund){
    return false;
  } else if (hasCreate){
    return balance > 0 && total > 0
  } else if (hasIssue){
    return total > 0
  } else {
    throw new Error('Weird edge case in shouldProcessRow, balance, total, hasRefund, hasCreate, and hasIssue, respectively: ', balance, total, hasRefund, hasCreate, hasIssue);
  }
}

// Process a row with "Create" button (Create → Issue workflow)
async function processCreate(page, row, rowData, errors, targetPageNum) {
  try {
    console.log(`[Row] Processing CREATE for ${rowData.soNumber}...`);
    
    // Click Create button
    const clicked = await row.evaluate(el => {
      const buttons = Array.from(el.querySelectorAll('button'));
      const createBtn = buttons.find(btn => btn.textContent.trim() === 'Create' && btn.classList.contains('btn-primary'));
      if (createBtn) {
        createBtn.click();
        return true;
      }
      return false;
    });
    
    if (!clicked) throw new Error('Create button not found');
    
    // Wait for invoice detail page
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.timeouts.navigation });
    await delay(config.timeouts.actionDelay);
    
    // Click Actions dropdown
    console.log('[Row] Clicking Actions dropdown...');
    await page.waitForSelector('.dropdown.actionsdrop button.dropdown-toggle', { visible: true, timeout: config.timeouts.elementWait });
    await page.click('.dropdown.actionsdrop button.dropdown-toggle');
    await delay(1000);
    
    // Click "Issued" in dropdown
    console.log('[Row] Clicking Issued...');
    const issuedClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button.dropdown-item'));
      const issuedBtn = buttons.find(btn => btn.getAttribute('name') === 'Issued');
      if (issuedBtn) {
        issuedBtn.click();
        return true;
      }
      return false;
    });
    
    if (!issuedClicked) throw new Error('Issued button not found in dropdown');
    
    // Wait for modal
    await page.waitForSelector('.card-footer', { visible: true, timeout: config.timeouts.elementWait });
    
    // Click "Ok" in modal
    console.log('[Row] Confirming...');
    const okClicked = await page.evaluate(() => {
      const modal = document.querySelector('.card-footer');
      if (modal) {
        const buttons = Array.from(modal.querySelectorAll('button'));
        const okBtn = buttons.find(btn => btn.textContent.trim().toLowerCase() === 'ok' && btn.classList.contains('btn-primary'));
        if (okBtn) {
          okBtn.click();
          return true;
        }
      }
      return false;
    });
    
    if (!okClicked) throw new Error('Ok button not found');
    
    // Wait for modal to close
    await delay(config.timeouts.modalWait);
    console.log(`[Row] ✓ ${rowData.soNumber} created & issued`);
    
    await returnToNeedsActionPage(page, targetPageNum);
    
    return true;
  } catch (error) {
      const errorMsg = `Failed CREATE for ${rowData.soNumber}: ${error.message}`;
      console.error(`[Row] ${errorMsg}`);
      errors.push(errorMsg);
      
      // Try to recover
      try {
        await returnToNeedsActionPage(page, targetPageNum);
      } catch (recoveryError) {
        console.error('[Row] Recovery failed:', recoveryError.message);
      }
    
    return false;
  }
}

// Process a row with "Issue" button (Issue only)
async function processIssue(page, row, rowData, errors, targetPageNum) {
  try {
    console.log(`[Row] Processing ISSUE for ${rowData.soNumber}...`);
    
    // Click Issue button
    const clicked = await row.evaluate(el => {
      const buttons = Array.from(el.querySelectorAll('button'));
      const issueBtn = buttons.find(btn => btn.textContent.trim() === 'Issue' && btn.classList.contains('btn-primary'));
      if (issueBtn) {
        issueBtn.click();
        return true;
      }
      return false;
    });
    
    if (!clicked) throw new Error('Issue button not found');
    
    // Wait for detail page
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.timeouts.navigation });
    await delay(config.timeouts.actionDelay);
    
    // Click Cancel button
    console.log('[Row] Clicking Cancel...');
    const cancelClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const cancelBtn = buttons.find(btn => btn.textContent.trim() === 'Cancel' && !btn.closest('.modal'));
      if (cancelBtn) {
        cancelBtn.click();
        return true;
      }
      return false;
    });
    
    if (!cancelClicked) throw new Error('Cancel button not found');
    await delay(1000);
    
    // Confirm modal (click Yes)
    console.log('[Row] Confirming...');
    await page.waitForSelector('.modal-footer', { visible: true, timeout: config.timeouts.elementWait });
    
    const yesClicked = await page.evaluate(() => {
      const modal = document.querySelector('.modal-footer');
      if (modal) {
        const buttons = Array.from(modal.querySelectorAll('button'));
        const yesBtn = buttons.find(btn => btn.textContent.trim() === 'Yes' && btn.classList.contains('btn-primary'));
        if (yesBtn) {
          yesBtn.click();
          return true;
        }
      }
      return false;
    });
    
    if (!yesClicked) throw new Error('Yes button not found');
    
    await delay(config.timeouts.modalWait);
    console.log(`[Row] ✓ ${rowData.soNumber} issued`);
    
    await returnToNeedsActionPage(page, targetPageNum);
    
    return true;
  } catch (error) {
    const errorMsg = `Failed ISSUE for ${rowData.soNumber}: ${error.message}`;
    console.error(`[Row] ${errorMsg}`);
    errors.push(errorMsg);
    
    // Try to recover
    try {
      await returnToNeedsActionPage(page, targetPageNum);
    } catch (recoveryError) {
      console.error('[Row] Recovery failed:', recoveryError.message);
    }
    
    return false;
  }
}

// Process all rows on current page using Set-based deduplication
// Re-scans page after each process to handle dynamic reordering
async function processPage(page, processedInvoices, errors, processedSOSet) {
  console.log('[Process] Processing current page...');

  try {
    // Keep scanning current page until no unprocessed rows found
    while (true) {
      const pageInfo = await getPageInfo(page);
      const currentPageNum = pageInfo.currentPageNum;

      await page.waitForSelector('cdk-row', { visible: true, timeout: config.timeouts.elementWait });

      const rows = await page.$$('cdk-row');
      console.log(`[Process] Found ${rows.length} rows on page`);

      if (rows.length === 0) return false;

      let foundUnprocessedRow = false;

      // Scan all rows looking for first unprocessed eligible row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowData = await extractRowData(row);

        if (!rowData) {
          console.log(`[Process] Skipping row ${i + 1} - failed to extract data`);
          continue;
        }

        // Skip if already processed
        if (processedSOSet.has(rowData.soNumber)) {
          console.log(`[Process] Row ${i + 1}: ${rowData.soNumber} - already processed, skipping`);
          continue;
        }

        console.log(`[Process] Row ${i + 1}: ${rowData.soNumber}, $${rowData.balance} / $${rowData.total}, Refund=${rowData.hasRefund}`);

        // Check which button is present
        const hasCreate = await row.evaluate(el => {
          const buttons = Array.from(el.querySelectorAll('button'));
          return buttons.some(btn => btn.textContent.trim() === 'Create' && btn.classList.contains('btn-primary'));
        });

        const hasIssue = await row.evaluate(el => {
          const buttons = Array.from(el.querySelectorAll('button'));
          return buttons.some(btn => btn.textContent.trim() === 'Issue' && btn.classList.contains('btn-primary'));
        });

        // Check if we should process
        if (!shouldProcessRow(rowData.balance, rowData.total, rowData.hasRefund, hasCreate, hasIssue)) {
          console.log(`[Process] Skipping ${rowData.soNumber} - validation failed`);
          // Mark as processed so we don't check again
          processedSOSet.add(rowData.soNumber);
          continue;
        }

        let success = false;
        let action = '';

        if (hasCreate) {
          success = await processCreate(page, row, rowData, errors, currentPageNum);
          action = 'Created & Issued';
        } else if (hasIssue) {
          success = await processIssue(page, row, rowData, errors, currentPageNum);
          action = 'Issued';
        } else {
          console.log(`[Process] No action button for ${rowData.soNumber}`);
          processedSOSet.add(rowData.soNumber);
          continue;
        }

        // Mark as processed regardless of success/failure
        processedSOSet.add(rowData.soNumber);

        if (success) {
          processedInvoices.push({
            soNumber: rowData.soNumber,
            balance: rowData.balance,
            total: rowData.total,
            action: action
          });
        }

        // Found and processed a row - mark flag and break to re-scan
        foundUnprocessedRow = true;
        await delay(1000);
        break; // Exit for loop to re-fetch all rows (page reordered)
      }

      // If we scanned all rows and found nothing to process, page is exhausted
      if (!foundUnprocessedRow) {
        console.log('[Process] No unprocessed rows found on this page');
        return true; // Page processed successfully
      }

      // Otherwise, loop continues and re-scans page
    }
  } catch (error) {
    console.error('[Process] Error:', error.message);
    errors.push(`Page processing error: ${error.message}`);
    return false;
  }
}

// Check for and click next page
async function checkNextPage(page) {
  try {
    const pageInfo = await getPageInfo(page);

    console.log(`[Pagination] Current page: ${pageInfo.currentPageNum}/${pageInfo.totalPages}`);

    // If we're on the last page number, we're done
    if (pageInfo.currentPageNum >= pageInfo.totalPages && pageInfo.totalPages > 0) {
      console.log('[Pagination] Reached last page (current page equals total pages)');
      return false;
    }

    // If next button is disabled, we're on the last page
    if (pageInfo.isNextDisabled) {
      console.log('[Pagination] Reached last page (next button disabled)');
      return false;
    }

    if (!pageInfo.hasNextButton) {
      console.log('[Pagination] No next button found');
      return false;
    }

    // Click the next button
    const clicked = await page.evaluate(() => {
      const nextButton = document.querySelector('.p-paginator-next');
      if (nextButton && !nextButton.classList.contains('p-paginator-element-disabled')) {
        nextButton.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      console.log('[Pagination] Could not click next button');
      return false;
    }

    console.log('[Pagination] Clicked next page button');
    await delay(config.timeouts.pageStabilization);
    return true;
  } catch (error) {
    console.log('[Pagination] Error:', error.message);
    return false;
  }
}

// Main function - run the entire process
export async function runFulcrumProcessor(username, password, headless = true) {
  const processedInvoices = [];
  const errors = [];
  const processedSOSet = new Set(); // Track processed SO numbers to prevent duplicates
  let browser = null;
  
  try {
    console.log('\n=== FULCRUM INVOICE PROCESSOR ===\n');
    
    // TTS welcome (local only)
    if (IS_LOCAL) await playWelcomeTTS();
    
    // Initialize browser
    const browserData = await initBrowser(headless);
    browser = browserData.browser;
    const page = browserData.page;
    
    // Login
    await login(page, username, password);
    
    // Navigate to invoicing
    await goToInvoicing(page);
    
    // Click NEEDS ACTION
    await clickNeedsAction(page);
    
    // Process all pages
    let pageCount = 0;
    let hasMorePages = true;

    while (hasMorePages && pageCount < 20) { // Safety limit
      pageCount++;
      console.log(`\n[Main] Processing page ${pageCount}...\n`);

      const pageProcessed = await processPage(page, processedInvoices, errors, processedSOSet);

      if (!pageProcessed) {
        console.log('[Main] Page processing failed, stopping');
        break;
      }

      hasMorePages = await checkNextPage(page);
    }

    if (pageCount >= 20) {
      console.log('[Main] WARNING: Hit page limit safety check (20 pages)');
    }
    
    console.log('\n=== FULCRUM COMPLETE ===');
    console.log(`Processed: ${processedInvoices.length}`);
    console.log(`Errors: ${errors.length}\n`);
    
    return {
      processedInvoices,
      errors,
      success: errors.length === 0
    };
    
  } catch (error) {
    console.error('\n[Main] FATAL ERROR:', error.message);
    errors.push(`Fatal error: ${error.message}`);
    
    return {
      processedInvoices,
      errors,
      success: false
    };
    
  } finally {
    if (browser) {
      await browser.close();
      console.log('[Browser] Closed');
    }
  }
}

export default { runFulcrumProcessor };
