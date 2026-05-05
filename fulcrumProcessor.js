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
    navigation: 45000,
    elementWait: 65000,
    actionDelay: 8000,
    modalWait: 8000,
    pageStabilization: 8000
  },

  retries: {
    createDetailWait: {
      maxAttempts: 2,
      extendedDetailTimeout: 70000,
      extendedActionDelay: 12000,
      recoveryDelay: 15000
    }
  }
};

const DEFAULT_MAX_PAGES = 20;

function parsePositiveInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function createProcessingLimits(options = {}) {
  return {
    maxPages: parsePositiveInteger(options.maxPages) || DEFAULT_MAX_PAGES,
    maxActionAttempts: parsePositiveInteger(options.maxActionAttempts ?? options.maxProcessedInvoices),
    stopAtEpochMs: parsePositiveInteger(options.stopAtEpochMs)
  };
}

function getProcessingStopReason(limits, state) {
  if (limits.maxActionAttempts && state.actionAttempts >= limits.maxActionAttempts) {
    return `reached Fulcrum action limit (${limits.maxActionAttempts})`;
  }

  if (limits.stopAtEpochMs && Date.now() >= limits.stopAtEpochMs) {
    return 'reached Fulcrum time budget';
  }

  return null;
}

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
  await waitForInvoicingPageReady(page);
}

async function collectPageDiagnostics(page) {
  try {
    return await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      readyState: document.readyState,
      buttonCount: document.querySelectorAll('button').length,
      inputCount: document.querySelectorAll('input').length,
      rowCount: document.querySelectorAll('cdk-row').length,
      invoiceGridPresent: !!document.querySelector('[data-testid="invoicing-grid"], invoicing-grid'),
      needsActionCardPresent: !!document.querySelector('kpi-total[displaystatus="NEEDS ACTION"]'),
      needsActionButtonPresent: !!document.querySelector('kpi-total[displaystatus="NEEDS ACTION"] button'),
      needsActionButtonText: document.querySelector('kpi-total[displaystatus="NEEDS ACTION"] button')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      kpiCards: Array.from(document.querySelectorAll('kpi-total')).map(card => ({
        displaystatus: card.getAttribute('displaystatus'),
        status: card.getAttribute('status'),
        text: (card.textContent || '').replace(/\s+/g, ' ').trim()
      })),
      rowSamples: Array.from(document.querySelectorAll('cdk-row')).slice(0, 5).map(row =>
        (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 250)
      ),
      bodyTextSample: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 700)
    }));
  } catch (error) {
    return { diagnosticsError: error.message };
  }
}

async function logPageDiagnostics(page, context) {
  const diagnostics = await collectPageDiagnostics(page);
  console.log(`[Debug] ${context}: ${JSON.stringify(diagnostics)}`);
}

async function waitForInvoicingPageReady(page) {
  try {
    await page.waitForFunction(() => {
      const hasGrid = !!document.querySelector('[data-testid="invoicing-grid"], invoicing-grid');
      const needsActionButton = document.querySelector('kpi-total[displaystatus="NEEDS ACTION"] button');
      const hasSearchInput = Array.from(document.querySelectorAll('input')).some(
        input => input.placeholder && input.placeholder.includes('Search')
      );

      return (
        hasGrid &&
        hasSearchInput &&
        !!needsActionButton &&
        !!needsActionButton.textContent &&
        needsActionButton.textContent.includes('NEEDS ACTION')
      );
    }, { timeout: config.timeouts.elementWait });
  } catch (error) {
    await logPageDiagnostics(page, 'Invoicing page did not become ready');
    throw new Error(`Invoicing page did not fully render: ${error.message}`);
  }
}

async function findNeedsActionButton(page) {
  const handle = await page.evaluateHandle(() => {
    const directButton = document.querySelector('kpi-total[displaystatus="NEEDS ACTION"] button');
    if (directButton && directButton.textContent.includes('NEEDS ACTION')) {
      return directButton;
    }

    const cards = Array.from(document.querySelectorAll('kpi-total'));
    const matchingCard = cards.find(card => {
      const label = card.getAttribute('displaystatus') || '';
      const text = card.textContent || '';
      return label.includes('NEEDS ACTION') || text.includes('NEEDS ACTION');
    });

    const fallbackButton = matchingCard?.querySelector('button');
    if (fallbackButton && fallbackButton.textContent.includes('NEEDS ACTION')) {
      return fallbackButton;
    }

    return null;
  });

  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    return null;
  }

  return element;
}

async function waitForNeedsActionFilterApplied(page) {
  await page.waitForFunction(() => {
    const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
    const parseVisibleRgb = value => {
      const parts = String(value || '').match(/\d+(\.\d+)?/g)?.map(Number);
      if (!parts || parts.length < 3) return null;
      const alpha = parts.length >= 4 ? parts[3] : 1;
      return alpha > 0.1 ? parts.slice(0, 3) : null;
    };
    const luminance = rgb => (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]);
    const needsActionButton = document.querySelector('kpi-total[displaystatus="NEEDS ACTION"] button');
    const kpiCard = needsActionButton?.closest('kpi-total') || null;
    const visualCandidates = [
      needsActionButton,
      needsActionButton?.parentElement,
      kpiCard,
      kpiCard?.firstElementChild
    ].filter(Boolean);
    const visuallySelected = visualCandidates.some(candidate => {
      const backgroundRgb = parseVisibleRgb(window.getComputedStyle(candidate).backgroundColor);
      return !!backgroundRgb && luminance(backgroundRgb) < 160;
    });

    const rows = Array.from(document.querySelectorAll('cdk-row'));
    const rowsLookFiltered = rows.length > 0 && rows.every(row => {
      const rowText = normalize(row.textContent);
      const rowButtonTexts = Array.from(row.querySelectorAll('button')).map(button => normalize(button.textContent));
      return rowText.includes('Unissued') && rowButtonTexts.some(text => text === 'Create' || text === 'Issue');
    });

    return visuallySelected || rowsLookFiltered;
  }, { timeout: config.timeouts.elementWait });
}

async function getNeedsActionFilterState(page) {
  return page.evaluate(() => {
    const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
    const parseVisibleRgb = value => {
      const parts = String(value || '').match(/\d+(\.\d+)?/g)?.map(Number);
      if (!parts || parts.length < 3) return null;
      const alpha = parts.length >= 4 ? parts[3] : 1;
      return alpha > 0.1 ? parts.slice(0, 3) : null;
    };
    const luminance = rgb => (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]);
    const needsActionBtn = document.querySelector('kpi-total[displaystatus="NEEDS ACTION"] button');
    const kpiCard = needsActionBtn?.closest('kpi-total') || null;
    const visualCandidates = [
      needsActionBtn,
      needsActionBtn?.parentElement,
      kpiCard,
      kpiCard?.firstElementChild
    ].filter(Boolean);
    const selectedVisual = visualCandidates.find(candidate => {
      const backgroundRgb = parseVisibleRgb(window.getComputedStyle(candidate).backgroundColor);
      return !!backgroundRgb && luminance(backgroundRgb) < 160;
    });
    const visuallySelected = !!selectedVisual;
    const classSelected = !!needsActionBtn && (
      needsActionBtn.classList.contains('active') ||
      needsActionBtn.classList.contains('btn-primary') ||
      needsActionBtn.classList.contains('selected') ||
      needsActionBtn.getAttribute('aria-pressed') === 'true'
    );

    const rows = Array.from(document.querySelectorAll('cdk-row'));
    const rowsLookFiltered = rows.length > 0 && rows.every(row => {
      const rowText = normalize(row.textContent);
      const rowButtonTexts = Array.from(row.querySelectorAll('button')).map(button => normalize(button.textContent));
      return rowText.includes('Unissued') && rowButtonTexts.some(text => text === 'Create' || text === 'Issue');
    });

    return {
      isActive: classSelected || visuallySelected || rowsLookFiltered,
      classSelected,
      visuallySelected,
      rowsLookFiltered,
      rowCount: rows.length,
      needsActionText: normalize(needsActionBtn?.textContent),
      needsActionClass: needsActionBtn?.className || null,
      selectedVisualTag: selectedVisual?.tagName || null,
      selectedVisualClass: selectedVisual?.className || null,
      selectedVisualBackground: selectedVisual ? window.getComputedStyle(selectedVisual).backgroundColor : null
    };
  });
}

// Click the "NEEDS ACTION" button at the top
async function clickNeedsAction(page) {
  console.log('[Nav] Ensuring NEEDS ACTION filter is active...');

  await waitForInvoicingPageReady(page);

  const existingState = await getNeedsActionFilterState(page);
  if (existingState.isActive) {
    console.log(`[Nav] NEEDS ACTION already active, not clicking: ${JSON.stringify(existingState)}`);
    return;
  }

  console.log(`[Nav] NEEDS ACTION not active, clicking: ${JSON.stringify(existingState)}`);

  const needsActionButton = await findNeedsActionButton(page);
  if (!needsActionButton) {
    await logPageDiagnostics(page, 'NEEDS ACTION button not found');
    throw new Error('NEEDS ACTION button not found');
  }

  try {
    await needsActionButton.evaluate(button => {
      button.scrollIntoView({ block: 'center', inline: 'center' });
      button.click();
    });
  } catch (error) {
    await needsActionButton.dispose();
    await logPageDiagnostics(page, 'Failed while clicking NEEDS ACTION');
    throw new Error(`Failed to click NEEDS ACTION: ${error.message}`);
  }

  await needsActionButton.dispose();

  try {
    await waitForNeedsActionFilterApplied(page);
    await verifyNeedsActionActive(page);
  } catch (_error) {
    if (!(await verifyNeedsActionActive(page))) {
      await logPageDiagnostics(page, 'NEEDS ACTION click may not have activated filter');
    }
  }

  await delay(config.timeouts.pageStabilization);
  console.log('[Nav] NEEDS ACTION clicked');
}

// Verify NEEDS ACTION filter is active
async function verifyNeedsActionActive(page) {
  const state = await getNeedsActionFilterState(page);

  if (!state.isActive) {
    console.log(`[Nav] WARNING: NEEDS ACTION filter may not be active: ${JSON.stringify(state)}`);
  } else {
    console.log(`[Nav] NEEDS ACTION filter verified: ${JSON.stringify(state)}`);
  }

  return state.isActive;
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

function isCreateDetailTimeoutError(error) {
  return /Navigation timeout .* exceeded|Waiting failed: .* exceeded/i.test(error?.message || '');
}

async function waitForCreateDetailReady(page, timeoutMs) {
  await page.waitForFunction(() => {
    const dropdown = document.querySelector('.dropdown.actionsdrop button.dropdown-toggle');
    return !!dropdown && dropdown.offsetParent !== null;
  }, { timeout: timeoutMs });
}

async function findRowBySoNumber(page, soNumber) {
  const rows = await page.$$('cdk-row');

  for (const row of rows) {
    const rowData = await extractRowData(row);
    if (rowData?.soNumber === soNumber) {
      return row;
    }
  }

  return null;
}

async function runCreateWorkflow(page, row, rowData, targetPageNum, detailTimeoutMs, actionDelayMs) {
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

  await waitForCreateDetailReady(page, detailTimeoutMs);
  await delay(actionDelayMs);
  
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
}

// Process a row with "Create" button (Create → Issue workflow)
async function processCreate(page, row, rowData, errors, targetPageNum) {
  console.log(`[Row] Processing CREATE for ${rowData.soNumber}...`);

  const retryConfig = config.retries.createDetailWait;
  let currentRow = row;

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    const detailTimeoutMs = attempt === 1
      ? config.timeouts.navigation
      : retryConfig.extendedDetailTimeout;
    const actionDelayMs = attempt === 1
      ? config.timeouts.actionDelay
      : retryConfig.extendedActionDelay;

    try {
      if (attempt > 1) {
        console.log(`[Row] Retrying CREATE for ${rowData.soNumber} with extended waits (attempt ${attempt}/${retryConfig.maxAttempts})...`);
      }

      await runCreateWorkflow(page, currentRow, rowData, targetPageNum, detailTimeoutMs, actionDelayMs);
      return true;
    } catch (error) {
      if (!isCreateDetailTimeoutError(error) || attempt >= retryConfig.maxAttempts) {
        const errorMsg = `Failed CREATE for ${rowData.soNumber}: ${error.message}`;
        console.error(`[Row] ${errorMsg}`);
        errors.push(errorMsg);

        try {
          await returnToNeedsActionPage(page, targetPageNum);
        } catch (recoveryError) {
          console.error('[Row] Recovery failed:', recoveryError.message);
        }

        return false;
      }

      console.warn(`[Row] CREATE attempt ${attempt} for ${rowData.soNumber} timed out (${error.message}). Recovering and retrying after ${retryConfig.recoveryDelay}ms...`);

      try {
        await returnToNeedsActionPage(page, targetPageNum);
        await delay(retryConfig.recoveryDelay);
        currentRow = await findRowBySoNumber(page, rowData.soNumber);

        if (!currentRow) {
          console.log(`[Row] ${rowData.soNumber} no longer appears in NEEDS ACTION after timeout recovery; assuming prior CREATE succeeded`);
          return true;
        }
      } catch (recoveryError) {
        const errorMsg = `Failed CREATE for ${rowData.soNumber}: ${error.message} (retry recovery failed: ${recoveryError.message})`;
        console.error(`[Row] ${errorMsg}`);
        errors.push(errorMsg);
        return false;
      }
    }
  }

  return false;
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
async function processPage(page, processedInvoices, errors, processedSOSet, limits, state) {
  console.log('[Process] Processing current page...');

  try {
    // Keep scanning current page until no unprocessed rows found
    while (true) {
      const stopReason = getProcessingStopReason(limits, state);
      if (stopReason) {
        state.stopReason = stopReason;
        console.log(`[Process] Stopping before next row: ${stopReason}`);
        return true;
      }

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
          state.actionAttempts++;
          success = await processCreate(page, row, rowData, errors, currentPageNum);
          action = 'Created & Issued';
        } else if (hasIssue) {
          state.actionAttempts++;
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
export async function runFulcrumProcessor(username, password, headless = true, options = {}) {
  const processedInvoices = [];
  const errors = [];
  const processedSOSet = new Set(); // Track processed SO numbers to prevent duplicates
  const limits = createProcessingLimits(options);
  const state = {
    actionAttempts: 0,
    stopReason: null
  };
  let browser = null;
  let pageCount = 0;
  let hasMorePages = true;
  
  try {
    console.log('\n=== FULCRUM INVOICE PROCESSOR ===\n');
    console.log('[Config] Fulcrum processing limits:', JSON.stringify({
      maxPages: limits.maxPages,
      maxActionAttempts: limits.maxActionAttempts,
      stopAtEpochMs: limits.stopAtEpochMs
    }));
    
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
    while (hasMorePages && pageCount < limits.maxPages && !state.stopReason) {
      pageCount++;
      console.log(`\n[Main] Processing page ${pageCount}...\n`);

      const pageProcessed = await processPage(page, processedInvoices, errors, processedSOSet, limits, state);

      if (!pageProcessed) {
        console.log('[Main] Page processing failed, stopping');
        break;
      }

      if (state.stopReason) {
        console.log(`[Main] Fulcrum processing stopped early: ${state.stopReason}`);
        break;
      }

      hasMorePages = await checkNextPage(page);
    }

    if (pageCount >= limits.maxPages && hasMorePages && !state.stopReason) {
      state.stopReason = `hit page limit safety check (${limits.maxPages} pages)`;
      console.log(`[Main] WARNING: ${state.stopReason}`);
    }
    
    console.log('\n=== FULCRUM COMPLETE ===');
    console.log(`Processed: ${processedInvoices.length}`);
    console.log(`Action attempts: ${state.actionAttempts}`);
    if (state.stopReason) {
      console.log(`Stopped early: ${state.stopReason}`);
    }
    console.log(`Errors: ${errors.length}\n`);
    
    return {
      processedInvoices,
      errors,
      success: errors.length === 0,
      complete: !state.stopReason && !hasMorePages,
      stoppedEarly: !!state.stopReason,
      stopReason: state.stopReason,
      actionAttempts: state.actionAttempts,
      pagesVisited: pageCount
    };
    
  } catch (error) {
    console.error('\n[Main] FATAL ERROR:', error.message);
    errors.push(`Fatal error: ${error.message}`);
    
    return {
      processedInvoices,
      errors,
      success: false,
      complete: false,
      stoppedEarly: !!state.stopReason,
      stopReason: state.stopReason,
      actionAttempts: state.actionAttempts,
      pagesVisited: pageCount
    };
    
  } finally {
    if (browser) {
      await browser.close();
      console.log('[Browser] Closed');
    }
  }
}

export default { runFulcrumProcessor };
export { isCreateDetailTimeoutError };
