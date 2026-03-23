"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultLocale,
  htmlLangByLocale,
  interpolateTemplate,
  localeStorageKey,
  localeLabels,
  localeTagByLocale,
  normalizeLocale,
  translateText,
  type SupportedLocale,
} from "@/lib/i18n";

type RelativeUnit = "second" | "minute" | "hour" | "day" | "week";

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  localeLabels: Record<SupportedLocale, string>;
  t: (key: string, values?: Record<string, string | number>) => string;
  interpolate: (template: string, values?: Record<string, string | number>) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCompactCurrency: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatRelativeTime: (value: number, unit: RelativeUnit) => string;
  formatDate: (value: Date | string, options?: Intl.DateTimeFormatOptions) => string;
  formatMonth: (monthIndex: number, month: "short" | "long") => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<SupportedLocale>(defaultLocale);

  useEffect(() => {
    setLocale(normalizeLocale(window.localStorage.getItem(localeStorageKey)));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale);
    document.documentElement.lang = htmlLangByLocale[locale];
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const localeTag = localeTagByLocale[locale];
    const relativeFormatter = new Intl.RelativeTimeFormat(localeTag, {
      numeric: "auto",
    });

    return {
      locale,
      setLocale,
      localeLabels,
      t: (key, values) => translateText(locale, key, values),
      interpolate: interpolateTemplate,
      formatNumber: (value, options) =>
        new Intl.NumberFormat(localeTag, options).format(value),
      formatCurrency: (value, options) =>
        new Intl.NumberFormat(localeTag, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
          ...options,
        }).format(value),
      formatCompactCurrency: (value, options) =>
        new Intl.NumberFormat(localeTag, {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 1,
          ...options,
        }).format(value),
      formatRelativeTime: (value, unit) => relativeFormatter.format(value, unit),
      formatDate: (value, options) =>
        new Intl.DateTimeFormat(localeTag, options).format(
          typeof value === "string" ? new Date(value) : value
        ),
      formatMonth: (monthIndex, month) =>
        new Intl.DateTimeFormat(localeTag, { month }).format(
          new Date(2024, monthIndex, 1)
        ),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider.");
  }

  return context;
}
