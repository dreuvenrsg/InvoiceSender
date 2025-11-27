# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RSG Invoice Processor is an AWS Lambda-based automation system that processes invoices in two stages:

1. **Fulcrum Stage** (`fulcrumProcessor.js`): Browser automation using Puppeteer to create and issue invoices in Fulcrum
2. **QBO Stage** (`V2_emailSender.js`): QuickBooks Online API integration to send invoices via email

The system runs on AWS Lambda with a scheduled trigger (daily at 5 PM Pacific).

## Architecture

### Two-Stage Processing Pipeline

```
Lambda Handler (V2_emailSender.js)
    ↓
Stage 1: Fulcrum Browser Automation (fulcrumProcessor.js)
    → Launches headless Chromium
    → Logs into Fulcrum
    → Processes "NEEDS ACTION" invoices
    → Creates/Issues invoices based on business rules
    → Returns results (processed invoices + errors)
    ↓
Stage 2: QBO API Processing (V2_emailSender.js)
    → Refreshes OAuth token (stored in SSM Parameter Store)
    → Fetches unissued invoices from QuickBooks
    → Checks shipping status via Fulcrum API
    → Updates PO numbers
    → Sends invoices to customers (excludes Siemens/Honeywell)
    → Returns results (sent/skipped/errors)
    ↓
Stage 3: Email Notification
    → Sends summary email via SES with both stages' results
```

### Key Components

- **fulcrumProcessor.js**: Puppeteer-based browser automation
  - Uses `@sparticuz/chromium` for Lambda compatibility
  - Has local mode (visible browser) and Lambda mode (headless)
  - Includes TTS "Sheila Bot" announcements for local development
  - Handles pagination and dynamic element waiting

- **V2_emailSender.js**: Main handler with QBO integration
  - OAuth token management via AWS SSM Parameter Store
  - Customer filtering (excluded/included lists)
  - Shipping status validation
  - Email reporting via AWS SES
  - Configuration for sandbox vs production environments

- **template.yaml**: AWS SAM infrastructure
  - Node.js 20 runtime
  - 3008 MB memory (required for Chromium)
  - 900s timeout (15 minutes)
  - Public Chromium layer (us-east-2)
  - EventBridge schedule trigger (5 PM PT daily)

## Development Commands

### Local Testing
```bash
# Test with visible browser (macOS/Linux)
node V2_emailSender.js

# Or use npm script
npm run test-local
```

### Building and Deployment
```bash
# Build with SAM
npm run build

# Deploy to AWS
npm run deploy

# Deploy with prompts (first time)
npm run deploy-guided

# Remove stack
npm run remove
```

### Testing and Monitoring
```bash
# Invoke locally with SAM
npm run invoke-local

# View CloudWatch logs (live tail)
npm run logs

# Get stack info
npm run info
```

## Environment Variables

### Required for Lambda (set in template.yaml parameters)
- `FROM_EMAIL`: Sender email for SES notifications
- `TO_EMAILS`: Comma-separated recipient emails for reports
- `deploy_region`: AWS region (default: us-east-2)

### For Local Testing
Set these environment variables before running locally:
```bash
export AWS_REGION=us-east-2
export FROM_EMAIL=dreuven@rsgsecurity.com
export TO_EMAILS=ar@rsgsecurity.com
```

## Configuration

### Switching Between Sandbox and Production
In `V2_emailSender.js`, locate the configuration section:
```javascript
const activeConfig = config.production; // or config.sandbox
```

### Customer Filtering
The `EXCLUDED_CUSTOMERS` and `INCLUDED_CUSTOMERS` arrays in `V2_emailSender.js` control which customers receive invoices. These are case-insensitive.

### Fulcrum Processing Rules
In `fulcrumProcessor.js`, the `shouldProcessRow()` function determines which invoices to process:
- Skips invoices with REFUND badge
- Can add custom balance/total validation rules

### Timeouts
Adjust timeouts in `fulcrumProcessor.js` config if Fulcrum UI becomes slower:
```javascript
timeouts: {
  navigation: 35000,      // Page load timeout
  elementWait: 30000,     // Element appearance timeout
  actionDelay: 6000,      // Delay after clicks
  modalWait: 6000,        // Modal processing timeout
  pageStabilization: 6000 // After page change
}
```

## OAuth Token Management

OAuth tokens are stored in AWS SSM Parameter Store at:
- `/qbo-invoice-sender/refresh_token`

The system automatically:
1. Loads refresh token from SSM
2. Exchanges it for a new access token
3. Saves the new refresh token back to SSM

If OAuth fails, get a new refresh token from:
https://appcenter.intuit.com/connect/oauth2?client_id=...&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl&state=xyz123

## Important Files Not to Modify

- `.env` - Contains credentials (in .gitignore)
- `.refresh-token-prod.txt` - OAuth token backup (in .gitignore)
- `.aws-sam/` - SAM build artifacts

## Lambda Deployment Notes

1. **Chromium Layer**: Uses public layer `arn:aws:lambda:us-east-2:764866452798:layer:chrome-aws-lambda:50`
   - If deploying to a different region, update the ARN in template.yaml
   - Check https://github.com/shelfio/chrome-aws-lambda-layer for region-specific ARNs

2. **Memory Requirements**: 3008 MB required for Chromium browser automation

3. **Timeout**: 900s (15 min) to handle large batches of invoices

4. **IAM Permissions**: Lambda needs:
   - SSM: GetParameter, PutParameter for OAuth tokens
   - SES: SendEmail for notifications
   - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents

## Business Logic

### Invoice Processing Flow
1. Fulcrum creates/issues invoices that have "NEEDS ACTION" status
2. QBO fetches unissued invoices
3. System checks if order is fully shipped (via Fulcrum API)
4. If shipped, updates PO number and sends invoice to customer
5. Excluded customers (Siemens/Honeywell) are skipped
6. Email summary sent to AR team

### Error Handling
- Each stage catches its own errors independently
- Errors in one stage don't prevent the other from running
- All errors are reported in the email summary
- Lambda returns success (200) even if some invoices fail

## Troubleshooting

### "Chromium not found" in Lambda
- Verify Chromium layer ARN matches your region in template.yaml
- Check CloudWatch logs for executablePath

### "NEEDS ACTION button not found"
- Fulcrum UI may have changed
- Update selector in fulcrumProcessor.js
- Increase wait timeouts

### OAuth Token Refresh Failed
- Get new refresh token from QuickBooks OAuth playground
- Update config in V2_emailSender.js
- Manually save to SSM Parameter Store if needed

### Function Timeout
- Normal for large batches (100+ invoices)
- Check CloudWatch logs to see progress
- Consider increasing timeout in template.yaml (max 15 min)

## Testing Strategy

1. **Local First**: Always test locally with visible browser (`node V2_emailSender.js`)
2. **Sandbox Mode**: Test with sandbox config before production
3. **Lambda Test**: Use `npm run invoke-local` for SAM local testing
4. **Monitor Logs**: Keep `npm run logs` running during execution
5. **Check Email**: Verify email summary report after each run
