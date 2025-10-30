# RSG Invoice Processor - Complete Integration Guide

## 📋 Overview

This system automates invoice processing in two stages:
1. **Fulcrum Stage**: Browser automation to create and issue invoices
2. **QBO Stage**: API integration to send invoices via email

## 🚀 Quick Start

### 1. Install Dependencies (5 min)
```bash
npm install
```

### 2. Test Locally (5 min)
```bash
# Test with visible browser
node index.js
```

The browser will open and you'll see Sheila Bot in action! 🤖

### 3. Deploy to Lambda (10 min)
```bash
# Make sure these environment variables are set
export LAMBDA_FUNCTION_NAME="RSGInvoiceProcessor"
export FROM_EMAIL="dreuven@rsgsecurity.com"
export TO_EMAILS="ar@rsgsecurity.com"
export AWS_REGION="us-east-2"

# Build and deploy
npm run package
npm run deploy
npm run update-config
```

### 4. Test Lambda Invocation
```bash
npm run invoke
```

## 📁 File Structure

```
.
├── index.js              # Main integration file (Fulcrum + QBO)
├── fulcrumProcessor.js   # Browser automation logic
├── package.json          # Dependencies and scripts
├── template.yaml         # AWS SAM template
└── README.md            # This file
```

## 🔧 Configuration

### Environment Variables

**For Local Testing:**
```bash
export FULCRUM_USERNAME="dreuven@rsgsecurity.com"
export FULCRUM_PASSWORD="Levered76!"
export FROM_EMAIL="dreuven@rsgsecurity.com"
export TO_EMAILS="ar@rsgsecurity.com"
export AWS_REGION="us-east-2"
```

**For Lambda:**
Set these in AWS Lambda console or pass in the event payload:
- `FROM_EMAIL`: Email sender address
- `TO_EMAILS`: Comma-separated recipient emails
- Fulcrum credentials passed in event payload (see below)

### Lambda Event Payload

```json
{
  "fulcrumUsername": "dreuven@rsgsecurity.com",
  "fulcrumPassword": "Levered76!"
}
```

## 📊 How It Works

```
Lambda Trigger
    ↓
┌─────────────────────────────────────┐
│  STAGE 1: Fulcrum Processing       │
├─────────────────────────────────────┤
│  ✓ Launch Chromium browser          │
│  ✓ Login to Fulcrum                 │
│  ✓ Click "NEEDS ACTION" filter      │
│  ✓ For each invoice row:            │
│    • Extract SO balance & total     │
│    • Check for REFUND badge         │
│    • Validate business rules        │
│    • Click Create→Issue OR Issue    │
│  ✓ Paginate through all pages       │
│  ✓ Collect results                  │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  STAGE 2: QBO Processing           │
├─────────────────────────────────────┤
│  ✓ Refresh OAuth token              │
│  ✓ Fetch unissued invoices          │
│  ✓ Check shipping status (Fulcrum)  │
│  ✓ Update PO numbers                │
│  ✓ Send via QBO API                 │
│  ✓ Track results                    │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Email Summary Report              │
├─────────────────────────────────────┤
│  • Fulcrum: X processed, Y errors   │
│  • QBO: X sent, Y skipped, Z errors │
│  • Detailed breakdown per invoice   │
└─────────────────────────────────────┘
```

## 🎯 Business Logic

### Fulcrum Processing Rules (`shouldProcessRow`)

The processor will **skip** invoices that:
- Have a REFUND badge
- You can add custom rules in `fulcrumProcessor.js`:
  ```javascript
  function shouldProcessRow(balance, total, hasRefund) {
    if (hasRefund) return false;
    // Add your rules:
    // if (Math.abs(balance - total) > 0.01) return false;
    // if (total < 100) return false;
    return true;
  }
  ```

### QBO Processing Rules

The processor will **skip** invoices for:
- Excluded customers (Siemens, Honeywell)
- Customers without email addresses
- Orders not fully shipped

## 📦 NPM Scripts

```bash
# Development
npm run test-local          # Test locally with visible browser

# Build & Package
npm run clean              # Remove dist/ and function.zip
npm run build              # Copy files to dist/
npm run install-prod       # Install production dependencies
npm run zip                # Create function.zip
npm run package            # Run all above steps

# Deployment
npm run deploy             # Update Lambda function code
npm run update-config      # Update memory/timeout/layer
npm run deploy-all         # Package + deploy + configure
npm run create-function    # Create new Lambda (first time only)

# Testing & Monitoring
npm run invoke             # Test Lambda with Fulcrum credentials
npm run logs               # Follow Lambda logs in real-time
```

## 🔐 Security Notes

**DO NOT** hardcode credentials in code or commit them to git!

**Best practices:**
1. **Local testing**: Use environment variables
   ```bash
   export FULCRUM_USERNAME="your-username"
   export FULCRUM_PASSWORD="your-password"
   ```

2. **Lambda**: Pass credentials in event payload
   ```json
   {
     "fulcrumUsername": "your-username",
     "fulcrumPassword": "your-password"
   }
   ```

3. **Production**: Use AWS Secrets Manager
   ```javascript
   // Example for future enhancement
   const secret = await secretsManager.getSecretValue({
     SecretId: 'fulcrum-credentials'
   });
   ```

## 🐛 Troubleshooting

### Local Testing Issues

**Browser won't launch:**
```bash
# macOS
which /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome

# Linux
which google-chrome
```

**"Module not found" errors:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Lambda Issues

**Function timeout:**
- Increase timeout in `template.yaml` (currently 900s = 15 min)
- Check CloudWatch logs: `npm run logs`

**Memory issues:**
- Memory is set to 3008 MB (required for Chromium)
- Check actual usage in CloudWatch metrics

**Chromium layer not found:**
```bash
# Update layer ARN in template.yaml
# Check for latest at: https://github.com/shelfio/chrome-aws-lambda-layer
```

### Common Errors

**"NEEDS ACTION button not found"**
- The UI may have changed
- Check the button selector in `fulcrumProcessor.js`
- Try increasing wait times in config

**"OAuth token refresh failed"**
- Check if refresh token is still valid
- Get new refresh token from QBO developer portal
- Update config in `index.js`

**"Invoice not fully shipped"**
- This is expected behavior
- Invoice will be sent once Fulcrum shows shipment complete

## 📈 Monitoring

### CloudWatch Logs
```bash
# Follow logs in real-time
npm run logs

# Or use AWS console
# Navigate to: CloudWatch > Log Groups > /aws/lambda/RSGInvoiceProcessor
```

### Email Reports

You'll receive an email summary after each run:
```
Invoice Processing Summary
==========================
Date: 2025-01-07T10:30:00Z
Environment: PRODUCTION

FULCRUM INVOICE PROCESSING
==========================
Total Processed: 15
Errors: 0
Status: ✓ SUCCESS

Processed Invoices:
- SO SO5197: Created & Issued (Balance: $249.97, Total: $249.97)
- SO SO5198: Issued (Balance: $150.00, Total: $150.00)
...

QBO INVOICE SENDING
===================
Total processed: 45
Successfully sent: 40
Skipped (excluded): 3
Errors: 2

Successfully Sent:
- Invoice 1001: sent to customer@example.com
...
```

## 🔄 Scheduling

To run automatically, uncomment the EventBridge schedule in `template.yaml`:

```yaml
InvoiceSchedule:
  Type: AWS::Events::Rule
  Properties:
    Description: Daily invoice processing at 10 AM
    ScheduleExpression: cron(0 10 * * ? *)  # 10 AM UTC daily
    State: ENABLED
    Targets:
      - Arn: !GetAtt RSGInvoiceSender.Arn
        Id: InvoiceProcessorTarget
        Input: |
          {
            "fulcrumUsername": "dreuven@rsgsecurity.com",
            "fulcrumPassword": "YOUR_PASSWORD_HERE"
          }
```

Then redeploy:
```bash
sam deploy
```

## 🧪 Testing Strategy

### 1. Test Fulcrum Only (Local)
```javascript
// In fulcrumProcessor.js, run standalone
node fulcrumProcessor.js
```

### 2. Test QBO Only (Local)
```javascript
// Modify index.js temporarily to skip Fulcrum
// Set fulcrumUsername = null
node index.js
```

### 3. Test Full Integration (Local)
```bash
node index.js
```

### 4. Test in Lambda (Sandbox)
```bash
# Change activeConfig to config.sandbox in index.js
npm run package
npm run deploy
npm run invoke
```

### 5. Production Deployment
```bash
# Ensure activeConfig = config.production
npm run deploy-all
```

## 📞 Support

If you encounter issues:
1. Check CloudWatch logs first: `npm run logs`
2. Review error messages in email reports
3. Test locally with visible browser to debug
4. Check Lambda memory/timeout metrics

## 🎉 Success Metrics

You'll know it's working when:
- ✅ Invoices are created and issued in Fulcrum
- ✅ Invoices are sent via QBO to customers
- ✅ Email reports show successful processing
- ✅ No errors in CloudWatch logs

## 📝 Maintenance

### Weekly Tasks
- Review email reports for errors
- Check CloudWatch metrics for performance

### Monthly Tasks
- Review excluded customer list
- Update business rules if needed
- Check for Chromium layer updates

### As Needed
- Refresh QBO OAuth tokens (automatic)
- Update Fulcrum credentials if changed
- Adjust timeouts if UI becomes slower

---

**Built with ❤️ by Doron Reuven @ RSG Security**

**Powered by:**
- 🤖 Puppeteer (Browser Automation)
- 📧 QuickBooks Online API
- ⚡ AWS Lambda + Chromium Layer
- 📨 Amazon SES (Email Notifications)
