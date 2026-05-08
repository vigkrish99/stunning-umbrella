/**
 * Zoho Books API Client with automatic token refresh
 */

const ZOHO_DOMAIN = process.env.ZOHO_DOMAIN || "in";
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_ORG_ID = process.env.ZOHO_ORG_ID;

let cachedAccessToken = process.env.ZOHO_ACCESS_TOKEN || null;
let tokenExpiresAt = Date.now() + 3600 * 1000;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!refreshToken || !ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
    throw new Error("Missing Zoho OAuth credentials");
  }

  const response = await fetch(
    `https://accounts.zoho.${ZOHO_DOMAIN}/oauth/v2/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    }
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(`Zoho token refresh failed: ${data.error}`);
  }

  cachedAccessToken = data.access_token as string;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;

  console.log("✅ Zoho access token refreshed");

  return cachedAccessToken!;
}

async function getAccessToken(): Promise<string> {
  const bufferTime = 5 * 60 * 1000;

  if (cachedAccessToken && Date.now() < tokenExpiresAt - bufferTime) {
    return cachedAccessToken;
  }

  return refreshAccessToken();
}

interface ZohoRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  params?: Record<string, string>;
  body?: unknown;
}

export async function zohoRequest<T>(
  endpoint: string,
  options: ZohoRequestOptions = {}
): Promise<T> {
  const { method = "GET", params = {}, body } = options;

  const accessToken = await getAccessToken();

  const url = new URL(`https://www.zohoapis.${ZOHO_DOMAIN}/books/v3${endpoint}`);

  url.searchParams.set("organization_id", ZOHO_ORG_ID || "");

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const fetchOptions: RequestInit = {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoho API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function getInvoices(params: {
  page?: number;
  per_page?: number;
  date_start?: string;
  date_end?: string;
  customer_id?: string;
  status?: string;
} = {}) {
  return zohoRequest<{
    invoices: Array<{
      invoice_id: string;
      invoice_number: string;
      customer_id: string;
      customer_name: string;
      date: string;
      due_date: string;
      total: number;
      status: string;
      line_items?: Array<{
        item_id: string;
        name: string;
        description: string;
        quantity: number;
        rate: number;
        amount: number;
      }>;
    }>;
    page_context: {
      page: number;
      per_page: number;
      has_more_page: boolean;
      total: number;
    };
  }>("/invoices", {
    params: {
      page: String(params.page || 1),
      per_page: String(params.per_page || 200),
      ...(params.date_start && { date_start: params.date_start }),
      ...(params.date_end && { date_end: params.date_end }),
      ...(params.customer_id && { customer_id: params.customer_id }),
      ...(params.status && { status: params.status }),
    },
  });
}

export async function getContacts(params: { page?: number; per_page?: number } = {}) {
  return zohoRequest<{
    contacts: Array<{
      contact_id: string;
      contact_name: string;
      company_name: string;
      email: string;
      phone: string;
      billing_address: {
        address: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      };
    }>;
    page_context: {
      page: number;
      per_page: number;
      has_more_page: boolean;
      total: number;
    };
  }>("/contacts", {
    params: {
      page: String(params.page || 1),
      per_page: String(params.per_page || 200),
    },
  });
}

export async function getInvoiceDetails(invoiceId: string) {
  return zohoRequest<{
    invoice: {
      invoice_id: string;
      invoice_number: string;
      customer_id: string;
      customer_name: string;
      date: string;
      due_date: string;
      total: number;
      status: string;
      line_items: Array<{
        item_id: string;
        name: string;
        description: string;
        quantity: number;
        rate: number;
        amount: number;
        sku?: string;
      }>;
    };
  }>(`/invoices/${invoiceId}`);
}
