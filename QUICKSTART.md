# RSG Invoice Processor - Quick Start Guide

## ✅ Pre-Deployment Checklist

Before you begin, make sure you have:
- [ ] Node.js 18+ installed
- [ ] AWS CLI installed and configured
- [ ] IAM role created for Lambda (see below)
- [ ] SES email verified in AWS
- [ ] Fulcrum credentials ready

## 🚀 5-Minute Setup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
```bash
cp .env.example .env
# Edit .env with your values
```

### Step 3: Test Locally
```bash
# This will open a browser and show Sheila Bot in action!
node index.js
```

### Step 4: Deploy to Lambda
```bash
# Set required environment variables
export LAMBDA_FUNCTION_NAME="RSGInvoiceProcessor"
export FROM_EMAIL="dreuven@rsgsecurity.com"
export TO_EMAILS="ar@rsgsecurity.com"
export AWS_REGION="us-east-2"

# For first deployment, also set:
export LAMBDA_ROLE_ARN="arn:aws:iam::YOUR_ACCOUNT:role/RSGInvoiceProcessorRole"

# Deploy!
./deploy.sh
```

That's it! 🎉

## 📋 Creating the IAM Role

If you haven't created the IAM role yet:

1. **Go to IAM Console** → Roles → Create Role
2. **Select AWS Service** → Lambda
3. **Attach these policies:**
   - `AWSLambdaBasicExecutionRole` (for CloudWatch logs)
   - `AmazonSSMReadOnlyAccess` (for OAuth token storage)
   - `AmazonSESFullAccess` (for sending emails)
4. **Name it:** `RSGInvoiceProcessorRole`
5. **Copy the ARN** and set it:
   ```bash
   export LAMBDA_ROLE_ARN="arn:aws:iam::123456789012:role/RSGInvoiceProcessorRole"
   ```

## 🧪 Testing

### Local Testing (with visible browser)
```bash
node index.js
```

### Lambda Testing
```bash
npm run invoke
```

### Watch Logs
```bash
npm run logs
```

## 📧 Email Setup

Make sure your email is verified in Amazon SES:

```bash
aws ses verify-email-identity \
  --email-address dreuven@rsgsecurity.com \
  --region us-east-2
```

Check your email and click the verification link!

## 🔄 What Happens When You Run It?

```
1. 🤖 Fulcrum Stage (5-10 min)
   └─ Logs into Fulcrum
   └─ Clicks "NEEDS ACTION"
   └─ Processes each invoice
   └─ Creates/Issues invoices
   └─ Paginates through all pages

2. 📧 QBO Stage (2-5 min)
   └─ Refreshes OAuth token
   └─ Fetches unissued invoices
   └─ Checks shipping status
   └─ Updates PO numbers
   └─ Sends invoices via email

3. ✉️ Email Summary
   └─ Detailed report sent to TO_EMAILS
```

## 📊 Expected Results

After running, you should see:
- ✅ Email summary with processing results
- ✅ Invoices created/issued in Fulcrum
- ✅ Invoices sent to customers via QBO
- ✅ CloudWatch logs showing detailed execution

## 🐛 Common Issues

### "Module not found"
```bash
rm -rf node_modules package-lock.json
npm install
```

### "AWS credentials not configured"
```bash
aws configure
# Enter your AWS Access Key ID and Secret
```

### "Email not sent"
```bash
# Verify your email in SES
aws ses verify-email-identity --email-address YOUR_EMAIL
```

### "Chromium not found" (Lambda)
- Check that the Chromium layer ARN is correct in template.yaml
- Current ARN: `arn:aws:lambda:us-east-2:041475135427:layer:chrome-aws-lambda:42`

### "Function timeout"
- This is normal for large batches
- Function timeout is set to 15 minutes (900 seconds)
- Check CloudWatch logs to see where it stopped

## 🎯 Pro Tips

1. **Test locally first** - Use `node index.js` to debug with visible browser
2. **Start with sandbox** - Change `activeConfig` to `config.sandbox` in index.js
3. **Monitor logs** - Keep `npm run logs` running during execution
4. **Check email** - All results are sent to your email
5. **Use git** - Version control your changes (but not credentials!)

## 📅 Scheduling

To run automatically every day at 10 AM:

1. Edit `template.yaml`
2. Uncomment the `InvoiceSchedule` section
3. Update the credentials in the Input
4. Deploy with SAM:
   ```bash
   sam build
   sam deploy
   ```

## 🔐 Security Best Practices

- ❌ **Never** commit credentials to git
- ✅ Use environment variables for local testing
- ✅ Use AWS Secrets Manager for production
- ✅ Pass Fulcrum credentials in Lambda event payload
- ✅ Rotate credentials regularly

## 📞 Need Help?

1. Check the full README.md for detailed documentation
2. Review CloudWatch logs: `npm run logs`
3. Test locally with visible browser to debug
4. Check Lambda metrics in AWS Console

## 🎉 Success Indicators

You'll know it's working when:
- ✅ Browser opens and logs into Fulcrum (local)
- ✅ Invoices are processed without errors
- ✅ Email report shows successful results
- ✅ CloudWatch shows no errors
- ✅ Customers receive their invoices

## 📝 Maintenance

### Daily
- Check email reports for errors

### Weekly
- Review CloudWatch metrics

### Monthly
- Review business rules
- Update excluded customers if needed

### As Needed
- Update dependencies: `npm update`
- Check for Chromium layer updates
- Refresh QBO OAuth if expired

---

**Questions?** Check the full README.md or CloudWatch logs!

**Happy Processing! 🚀**
