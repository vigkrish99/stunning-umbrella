# API Credentials Checklist
## Production Setup for Helix Industrial Gases

---

## ✅ Zoho Books (READY)

| Item | Status | Value/Notes |
|------|--------|-------------|
| Organization Access | ✅ Verified | Added to Helix Industrial Gases org |
| Organization ID | ✅ Confirmed | `<REDACTED_ZOHO_ORG_ID>` |
| Organization Name | ✅ Confirmed | Helix Industrial Gases Private Limited |
| Client ID | ✅ Have | `<YOUR_ZOHO_CLIENT_ID>` |
| Client Secret | ✅ Have | In demo .env |
| Refresh Token | ⚠️ Need New | Generate for production org |
| Domain | ✅ Confirmed | `in` (zohoapis.in) |
| Scopes | ✅ Confirmed | contacts.READ, invoices.READ, settings.READ |

### Action Required
Generate new refresh token for production org:
```bash
cd ~/projects/helix-gases-trackabout-demo
node setup-zoho-tokens.js
```

---

## ✅ TrackAbout (READY)

| Item | Status | Value/Notes |
|------|--------|-------------|
| Username | ✅ Have | `<YOUR_TRACKABOUT_USERNAME>` |
| Password | ✅ Have | In demo .env |
| Base URL | ✅ Confirmed | `https://www.trackabout.com/api` |
| API Key | ✅ Have | `<YOUR_TRACKABOUT_API_KEY>` |
| App Instance ID | ✅ Have | `helix-gases-analytics-app-instance-01` |

### Verified Endpoints
- ✅ `/api/tokens/basic` - Authentication
- ✅ `/api/customers` - Customer list
- ✅ `/api/customers/bymid/{mid}/balances` - Cylinder holdings
- ✅ `/api/orders` - Transaction history

---

## ⚠️ MongoDB (NEED TO SET UP)

| Item | Status | Notes |
|------|--------|-------|
| Railway MongoDB | ⏳ Pending | Add during deployment |
| Connection String | ⏳ Pending | Will be generated |
| Database Name | 📝 Planned | `helix-gases_production` |

### Setup Steps
1. Create new Railway project
2. Add MongoDB service
3. Copy connection string to `.env`

---

## ⚠️ JWT Secrets (NEED TO GENERATE)

| Item | Status | Notes |
|------|--------|-------|
| JWT_SECRET | ⏳ Pending | Generate 64-byte hex |
| JWT_REFRESH_SECRET | ⏳ Pending | Generate 64-byte hex |

### Generation Command
```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
```

---

## ⏳ Twilio WhatsApp (FOR TESTING)

| Item | Status | Notes |
|------|--------|-------|
| Account SID | ⏳ Get from existing | South Arc Twilio account |
| Auth Token | ⏳ Get from existing | South Arc Twilio account |
| WhatsApp Number | ⏳ Get from existing | +14155238886 (sandbox) |

### Source
Get from: `~/projects/whatsapp-lead-bot/.env`

---

## ⏳ Wati (PRODUCTION - PHASE 2)

| Item | Status | Notes |
|------|--------|-------|
| API URL | ⏳ Get from client | Client's Wati account |
| API Token | ⏳ Get from client | Client's Wati account |
| WhatsApp Number | ⏳ Get from client | Client's business number |

### Action Required
Request Wati credentials from Mr. Client Owner during Phase 2.

---

## ⏳ Email (SMTP)

| Item | Status | Notes |
|------|--------|-------|
| SMTP Host | 📝 Planned | smtp.gmail.com or client's |
| SMTP User | ⏳ Pending | Create or get from client |
| SMTP Password | ⏳ Pending | App password |

### Options
1. Use client's email service
2. Set up SendGrid or similar
3. Use Gmail with app password

---

## 🔐 Security Checklist

- [ ] All secrets in environment variables
- [ ] `.env` in `.gitignore`
- [ ] No credentials in code
- [ ] No credentials in logs
- [ ] Rotate Zoho tokens for production
- [ ] Generate fresh JWT secrets
- [ ] Use HTTPS only

---

## 📋 Pre-Development Checklist

Before starting development:

1. [ ] Generate new Zoho refresh token for org `<REDACTED_ZOHO_ORG_ID>`
2. [ ] Verify TrackAbout credentials work with production data
3. [ ] Generate JWT secrets
4. [ ] Get Twilio credentials from existing project
5. [ ] Set up Railway project with MongoDB
6. [ ] Create `.env` from `.env.template`
7. [ ] Test all API connections

---

**Last Updated:** December 23, 2025
