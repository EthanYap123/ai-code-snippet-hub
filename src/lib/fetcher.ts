/** Error thrown for non-2xx API responses, carrying the server's message. */
export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body.error === "string" && body.error) ||
      (res.status >= 500 ? "The server hit a problem. Please try again." : `Request failed (${res.status})`);
    throw new ApiClientError(message, res.status);
  }
  return body as T;
}

export async function fetcher<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    throw new ApiClientError("Can't reach the server. Check your connection and try again.", 0);
  }
  return parse<T>(res);
}

export async function send<T>(url: string, method: "POST" | "DELETE", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError("Can't reach the server. Check your connection and try again.", 0);
  }
  return parse<T>(res);
}
