import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSummaryEmailContent, utils } from '../V2_emailSender.js';

test('summary email includes excluded customers in skipped details', () => {
  const results = {
    processed: 3,
    sent: 0,
    skipped: 3,
    errors: 0,
    details: [
      {
        invoiceId: 'F1001',
        status: 'skipped',
        customer: 'SIEMENS CANADA LIMITED',
        reason: 'excluded_customer'
      },
      {
        invoiceId: 'F1002',
        status: 'skipped',
        customer: 'HONEYWELL FIRE SYSTEMS, US',
        reason: 'excluded_customer'
      },
      {
        invoiceId: 'F1003',
        status: 'skipped',
        customer: 'Summit Fire & Security',
        reason: 'excluded_customer'
      }
    ]
  };

  const { body, skippedCustomers } = buildSummaryEmailContent(results, null, {
    now: new Date('2026-04-02T12:00:00.000Z'),
    environmentLabel: 'PRODUCTION'
  });

  assert.deepEqual(skippedCustomers, [
    'HONEYWELL FIRE SYSTEMS, US',
    'SIEMENS CANADA LIMITED',
    'Summit Fire & Security'
  ]);
  assert.match(body, /Skipped invoice: F1001 for customer: SIEMENS CANADA LIMITED/);
  assert.match(body, /Skipped invoice: F1002 for customer: HONEYWELL FIRE SYSTEMS, US/);
  assert.match(body, /Skipped invoice: F1003 for customer: Summit Fire & Security/);
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
