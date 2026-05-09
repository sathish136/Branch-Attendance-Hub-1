export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem("auth_token");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
