const API_BASE = "/api";
const WATCHLIST_TOKEN = import.meta.env.VITE_WATCHLIST_TOKEN as string | undefined;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...Object.fromEntries(new Headers(init?.headers).entries()),
  };

  const method = init?.method?.toUpperCase() ?? "GET";
  if (method !== "GET" && WATCHLIST_TOKEN) {
    headers["Authorization"] = `Bearer ${WATCHLIST_TOKEN}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}
