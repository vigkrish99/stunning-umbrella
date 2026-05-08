/**
 * Zoho Books API Client with Pagination Support
 *
 * Pagination: Uses page & per_page params, has_more_page indicates more data
 * Rate Limit: 100 requests/minute/org
 *
 * REDACTED FOR ANONYMIZED REVIEW: Zoho OAuth client/secret/refresh token
 * removed; in production this client manages a refresh-token loop and stays
 * within Zoho's ~12K calls/month budget for the client org. Org ID and all
 * tokens are loaded from env at runtime. See ANONYMIZATION_NOTES.md.
 */

const ZOHO_DOMAIN = process.env.ZOHO_DOMAIN || 'in';
const ZOHO_ORG_ID = process.env.ZOHO_ORG_ID;
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;

let accessToken = process.env.ZOHO_ACCESS_TOKEN;
let tokenExpiresAt = 0; // Unix ms timestamp when token expires

/**
 * Refresh the access token using refresh token.
 * Caches the token for its lifetime (typically 1 hour) minus a 5-minute buffer.
 * Call ensureAccessToken() instead of this directly — it skips refresh if token is still valid.
 */
export async function refreshAccessToken() {
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!refreshToken || !ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
    throw new Error('Missing Zoho OAuth credentials');
  }

  const response = await fetch(`https://accounts.zoho.${ZOHO_DOMAIN}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Zoho token refresh failed: ${data.error}`);
  }

  accessToken = data.access_token;
  // Zoho tokens last 1 hour (3600s). Cache with 5-min buffer.
  const expiresInMs = ((data.expires_in || 3600) - 300) * 1000;
  tokenExpiresAt = Date.now() + expiresInMs;
  console.log('✅ Zoho access token refreshed (cached until', new Date(tokenExpiresAt).toISOString(), ')');
  return accessToken;
}

/**
 * Ensure we have a valid access token, refreshing only if expired or near expiry.
 * Prefer this over calling refreshAccessToken() directly.
 */
export async function ensureAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }
  return refreshAccessToken();
}

/**
 * Make a request to Zoho Books API
 */
export async function zohoRequest(endpoint, params = {}) {
  const url = new URL(`https://www.zohoapis.${ZOHO_DOMAIN}/books/v3${endpoint}`);
  url.searchParams.set('organization_id', ZOHO_ORG_ID);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 401) {
    await refreshAccessToken();
    return zohoRequest(endpoint, params);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoho API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * POST/PUT request to Zoho Books API (for write operations)
 */
export async function zohoWriteRequest(endpoint, method, body) {
  const url = new URL(`https://www.zohoapis.${ZOHO_DOMAIN}/books/v3${endpoint}`);
  url.searchParams.set('organization_id', ZOHO_ORG_ID);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (response.status === 401) {
    await refreshAccessToken();
    return zohoWriteRequest(endpoint, method, body);
  }

  return response.json();
}

/**
 * Fetch ALL records with pagination
 * @param {string} endpoint - API endpoint (e.g., '/contacts')
 * @param {string} dataKey - Key in response containing array (e.g., 'contacts')
 * @param {object} extraParams - Additional query params
 */
export async function fetchAllWithPagination(endpoint, dataKey, extraParams = {}) {
  const allRecords = [];
  let page = 1;
  let hasMore = true;
  const perPage = 200; // Max allowed by Zoho

  console.log(`📡 Fetching all ${dataKey} from Zoho...`);

  while (hasMore) {
    const response = await zohoRequest(endpoint, {
      page,
      per_page: perPage,
      ...extraParams
    });

    const records = response[dataKey] || [];
    allRecords.push(...records);

    const pageContext = response.page_context || {};
    hasMore = pageContext.has_more_page === true;

    console.log(`   Page ${page}: ${records.length} records (total: ${allRecords.length})`);
    page++;

    // Rate limit protection - small delay between requests
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`✅ Fetched ${allRecords.length} total ${dataKey}`);
  return allRecords;
}

/**
 * Get ALL contacts with pagination
 */
export async function getAllContacts() {
  return fetchAllWithPagination('/contacts', 'contacts');
}

/**
 * Get ALL invoices with pagination
 */
export async function getAllInvoices(dateStart, dateEnd) {
  const params = {};
  if (dateStart) params.date_start = dateStart;
  if (dateEnd) params.date_end = dateEnd;
  return fetchAllWithPagination('/invoices', 'invoices', params);
}

/**
 * Get ALL items with pagination
 */
export async function getAllItems() {
  return fetchAllWithPagination('/items', 'items');
}

/**
 * Get invoice details (includes line items)
 */
export async function getInvoiceDetails(invoiceId) {
  const response = await zohoRequest(`/invoices/${invoiceId}`);
  return response.invoice;
}

/**
 * Update a contact
 */
export async function updateContact(contactId, updates) {
  return zohoWriteRequest(`/contacts/${contactId}`, 'PUT', updates);
}

/**
 * Create an invoice
 */
export async function createInvoice(invoiceData) {
  return zohoWriteRequest('/invoices', 'POST', invoiceData);
}

// Export for checking write capabilities
export const WRITE_CAPABILITIES = {
  contacts: {
    create: 'POST /contacts',
    update: 'PUT /contacts/:id',
    delete: 'DELETE /contacts/:id'
  },
  invoices: {
    create: 'POST /invoices',
    update: 'PUT /invoices/:id',
    delete: 'DELETE /invoices/:id',
    markAsSent: 'POST /invoices/:id/status/sent',
    markAsPaid: 'POST /invoices/:id/status/paid'
  },
  items: {
    create: 'POST /items',
    update: 'PUT /items/:id',
    delete: 'DELETE /items/:id'
  }
};
