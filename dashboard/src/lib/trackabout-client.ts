/**
 * TrackAbout API Client
 * 
 * IMPORTANT: TrackAbout uses token as QUERY PARAMETER, not Authorization header
 * Base URL includes port 443: https://www.trackabout.com:443/api
 */

const TRACKABOUT_BASE_URL = "https://www.trackabout.com:443/api";
const TRACKABOUT_USER = process.env.TRACKABOUT_USER;
const TRACKABOUT_PASS = process.env.TRACKABOUT_PASS;
const TRACKABOUT_API_KEY = process.env.TRACKABOUT_API_KEY;
const TRACKABOUT_APP_INSTANCE_ID = process.env.TRACKABOUT_APP_INSTANCE_ID || "helix-gases-app-001";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

interface TrackAboutTokenResponse {
  token: string;
  expires: string;
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  if (!TRACKABOUT_USER || !TRACKABOUT_PASS || !TRACKABOUT_API_KEY) {
    throw new Error("Missing TrackAbout credentials");
  }

  // Token endpoint uses query params, not JSON body
  const params = new URLSearchParams({
    username: TRACKABOUT_USER,
    password: TRACKABOUT_PASS,
    apiKey: TRACKABOUT_API_KEY,
    applicationInstanceId: TRACKABOUT_APP_INSTANCE_ID,
  });

  const response = await fetch(`${TRACKABOUT_BASE_URL}/tokens/basic?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Length": "0" },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TrackAbout auth failed (${response.status}): ${errorText}`);
  }

  const data: TrackAboutTokenResponse = await response.json();
  cachedToken = data.token;
  tokenExpiresAt = new Date(data.expires).getTime();

  console.log("✅ TrackAbout token obtained, expires:", data.expires);

  return cachedToken;
}

async function trackaboutRequest<T>(
  endpoint: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {}
): Promise<T> {
  const token = await getToken();

  // Build URL with token as query parameter
  const url = new URL(`${TRACKABOUT_BASE_URL}${endpoint}`);
  url.searchParams.set("token", token);
  url.searchParams.set("maxRows", "500");
  
  // Add any additional params
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const fetchOptions: RequestInit = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TrackAbout API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export interface TrackAboutCustomer {
  mid: string;
  tid: number;
  name: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
}

export interface CustomerBalance {
  mid: string;
  productCode: string;
  productDescription: string;
  quantity: number;
}

export async function getCustomers(): Promise<TrackAboutCustomer[]> {
  const data = await trackaboutRequest<{ customers: TrackAboutCustomer[] }>(
    "/customers"
  );
  return data.customers || [];
}

export async function getCustomerBalances(mid: string): Promise<CustomerBalance[]> {
  const data = await trackaboutRequest<{ balances: CustomerBalance[] }>(
    `/customers/bymid/${encodeURIComponent(mid)}/balances`
  );
  return data.balances || [];
}

export async function getAllCustomerBalances(): Promise<
  Array<{ mid: string; name: string; balances: CustomerBalance[] }>
> {
  const customers = await getCustomers();
  const results: Array<{ mid: string; name: string; balances: CustomerBalance[] }> = [];

  for (const customer of customers) {
    try {
      const balances = await getCustomerBalances(customer.mid);
      results.push({
        mid: customer.mid,
        name: customer.name,
        balances,
      });
    } catch (error) {
      console.warn(`Failed to get balances for ${customer.mid}:`, error);
    }
  }

  return results;
}

export async function searchAssets(params: {
  lastMovedAfter?: string;
  productCode?: string;
  customerMid?: string;
}): Promise<unknown[]> {
  const queryParams = new URLSearchParams();
  
  if (params.lastMovedAfter) {
    queryParams.set("lastMovedAfter", params.lastMovedAfter);
  }
  if (params.productCode) {
    queryParams.set("productCode", params.productCode);
  }
  if (params.customerMid) {
    queryParams.set("customerMid", params.customerMid);
  }

  const data = await trackaboutRequest<{ assets: unknown[] }>(
    `/assets/search?${queryParams.toString()}`
  );
  return data.assets || [];
}
