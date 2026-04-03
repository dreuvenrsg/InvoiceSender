import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSummaryEmailContent, customerModule, utils } from '../V2_emailSender.js';

test('summary email separates explicit exclusions from allowlist misses', () => {
  const results = {
    processed: 3,
    sent: 0,
    skipped: 3,
    errors: 0,
    candidatePolicySummary: {
      candidateInvoiceCount: 5,
      uniqueCustomerCount: 4,
      sendableCustomers: ['Johnson Controls Fire Protection LP'],
      explicitlyExcludedCustomers: ['HONEYWELL FIRE SYSTEMS, US', 'SIEMENS CANADA LIMITED'],
      allowlistMissCustomers: ['Summit Fire & Security'],
      sendableInvoiceCount: 2,
      explicitlyExcludedInvoiceCount: 2,
      allowlistMissInvoiceCount: 1
    },
    details: [
      {
        invoiceId: 'F1001',
        status: 'skipped',
        customer: 'SIEMENS CANADA LIMITED',
        reason: 'explicit_exclusion',
        skipCategory: 'explicit_exclusion'
      },
      {
        invoiceId: 'F1002',
        status: 'skipped',
        customer: 'HONEYWELL FIRE SYSTEMS, US',
        reason: 'explicit_exclusion',
        skipCategory: 'explicit_exclusion'
      },
      {
        invoiceId: 'F1003',
        status: 'skipped',
        customer: 'Summit Fire & Security',
        reason: 'not_in_allowlist',
        skipCategory: 'allowlist_miss'
      }
    ]
  };

  const {
    body,
    skippedCustomers,
    explicitlyExcludedCustomers,
    allowlistMissCustomers,
    emailContext
  } = buildSummaryEmailContent(results, null, {
    now: new Date('2026-04-02T12:00:00.000Z'),
    environmentLabel: 'PRODUCTION'
  });

  assert.deepEqual(skippedCustomers, [
    'HONEYWELL FIRE SYSTEMS, US',
    'SIEMENS CANADA LIMITED',
    'Summit Fire & Security'
  ]);
  assert.deepEqual(explicitlyExcludedCustomers, [
    'HONEYWELL FIRE SYSTEMS, US',
    'SIEMENS CANADA LIMITED'
  ]);
  assert.deepEqual(allowlistMissCustomers, [
    'Summit Fire & Security'
  ]);
  assert.deepEqual(emailContext.qbo.explicitlyExcludedCustomers, explicitlyExcludedCustomers);
  assert.deepEqual(emailContext.qbo.allowlistMissCustomers, allowlistMissCustomers);
  assert.equal(emailContext.qbo.candidatePolicySummary.candidateInvoiceCount, 5);
  assert.match(body, /Explicitly excluded customers: \{HONEYWELL FIRE SYSTEMS, US, SIEMENS CANADA LIMITED\}/);
  assert.match(body, /Customers skipped because not in allowlist: \{Summit Fire & Security\}/);
  assert.match(body, /Candidate invoices before processing: 5/);
  assert.match(body, /Sendable customers considered: \{Johnson Controls Fire Protection LP\}/);
  assert.match(body, /Skipped invoice: F1001 for customer: SIEMENS CANADA LIMITED and was skipped because category: explicit_exclusion/);
  assert.match(body, /Skipped invoice: F1003 for customer: Summit Fire & Security and was skipped because category: allowlist_miss/);
});

test('customer skip policy distinguishes explicit exclusions from allowlist misses', () => {
  assert.deepEqual(customerModule.getSkipPolicy('Honeywell Fire Systems, US'), {
    shouldSkip: true,
    skipCategory: 'explicit_exclusion',
    reason: 'explicit_exclusion. The customer is: Honeywell Fire Systems, US'
  });

  assert.deepEqual(customerModule.getSkipPolicy('Summit Fire & Security'), {
    shouldSkip: true,
    skipCategory: 'allowlist_miss',
    reason: 'not_in_allowlist. The customer is: Summit Fire & Security'
  });

  assert.deepEqual(customerModule.getSkipPolicy('Johnson Controls Fire Protection LP'), {
    shouldSkip: false,
    skipCategory: null,
    reason: null
  });
});

test('candidate policy summary reports sendable and skipped customer groups', () => {
  const summary = customerModule.summarizeInvoicePolicies([
    { CustomerRef: { value: '1', name: 'Honeywell Fire Systems, US' } },
    { CustomerRef: { value: '2', name: 'Summit Fire & Security' } },
    { CustomerRef: { value: '3', name: 'Johnson Controls Fire Protection LP' } },
    { CustomerRef: { value: '3', name: 'Johnson Controls Fire Protection LP' } }
  ], {
    '1': { DisplayName: 'Honeywell Fire Systems, US' },
    '2': { DisplayName: 'Summit Fire & Security' },
    '3': { DisplayName: 'Johnson Controls Fire Protection LP' }
  });

  assert.deepEqual(summary, {
    candidateInvoiceCount: 4,
    uniqueCustomerCount: 3,
    sendableCustomers: ['Johnson Controls Fire Protection LP'],
    explicitlyExcludedCustomers: ['Honeywell Fire Systems, US'],
    allowlistMissCustomers: ['Summit Fire & Security'],
    sendableInvoiceCount: 2,
    explicitlyExcludedInvoiceCount: 1,
    allowlistMissInvoiceCount: 1
  });
});

test('HLI San Diego invoices route to AP-C510', () => {
  const selection = utils.resolveInvoiceRecipients({
    invoice: {
      CustomerRef: { name: 'HLI Solutions, Inc.' },
      ShipAddr: {
        Line1: 'c/o MC Warehouse & Logistics 7707 Paseo de la Fuente',
        Line2: 'San Diego, CA 92154 USA'
      }
    },
    customer: {
      DisplayName: 'HLI Solutions, Inc.',
      PrimaryEmail: 'aphli@currentlighting.com'
    }
  });

  assert.equal(selection.recipients, 'ap-c510@currentlighting.com');
  assert.equal(selection.source, 'hli_ship_to_san_diego');
});

test('HLI Christiansburg invoices route to APHLI', () => {
  const selection = utils.resolveInvoiceRecipients({
    invoice: {
      CustomerRef: { name: 'HLI Solutions, Inc.' },
      ShipAddr: {
        Line1: '2000 Electric Way',
        Line2: 'Christiansburg, VA 24073'
      }
    },
    customer: {
      DisplayName: 'HLI Solutions, Inc.',
      PrimaryEmail: 'some-old-value@example.com'
    }
  });

  assert.equal(selection.recipients, 'aphli@currentlighting.com');
  assert.equal(selection.source, 'hli_ship_to_christiansburg');
});

test('non-HLI invoices default to normalized customer primary email set', () => {
  const selection = utils.resolveInvoiceRecipients({
    invoice: {
      CustomerRef: { name: 'Summit Fire & Security' },
      ShipAddr: {
        Line1: '123 Main St'
      }
    },
    customer: {
      DisplayName: 'Summit Fire & Security',
      PrimaryEmail: 'Ap@summitcompanies.com, apvendorinquiry@summitfire.com'
    }
  });

  assert.equal(selection.recipients, 'ap@summitcompanies.com, apvendorinquiry@summitfire.com');
  assert.equal(selection.source, 'customer_primary_email');
});
