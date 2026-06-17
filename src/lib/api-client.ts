"use client";

type FetchOptions = RequestInit & {
  token?: string | null;
};

export async function authFetch(url: string, options: FetchOptions = {}) {
  const { token, headers, ...rest } = options;

  return fetch(url, {
    ...rest,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
