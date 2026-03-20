"use client";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/backend").replace(/\/$/, "");

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}
