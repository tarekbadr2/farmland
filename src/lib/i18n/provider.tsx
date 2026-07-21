"use client";

import * as React from "react";
import { dictionaries, type Dictionary, type Locale } from "./dictionaries";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends object
    ? Leaves<T[K], `${P}${K}.`>
    : `${P}${K}`;
}[keyof T & string];

export type TKey = Leaves<Dictionary>;

interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  /** Picks the localised field off a record that carries both languages. */
  ln: <T extends { name: string; nameAr: string }>(record: T) => string;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
  formatCurrency: (n: number, opts?: Intl.NumberFormatOptions) => string;
  formatCompact: (n: number) => string;
}

const I18nContext = React.createContext<I18nValue | null>(null);
const STORAGE_KEY = "herdos.locale";

function lookup(dict: Dictionary, key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict);
  return typeof value === "string" ? value : key;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>("en");

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === "ar" || stored === "en") setLocaleState(stored);
  }, []);

  React.useEffect(() => {
    const dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = React.useMemo<I18nValue>(() => {
    const dict = dictionaries[locale];
    // Latin numerals in Arabic: farm staff read tag numbers and litres this way.
    const numLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";

    return {
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      setLocale: setLocaleState,
      toggleLocale: () => setLocaleState((l) => (l === "en" ? "ar" : "en")),
      t: (key, vars) => {
        let out = lookup(dict, key);
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          }
        }
        return out;
      },
      ln: (record) => (locale === "ar" && record.nameAr ? record.nameAr : record.name),
      formatNumber: (n, opts) =>
        new Intl.NumberFormat(numLocale, { maximumFractionDigits: 1, ...opts }).format(n),
      formatCurrency: (n, opts) =>
        new Intl.NumberFormat(numLocale, {
          style: "currency",
          currency: "EGP",
          maximumFractionDigits: 0,
          ...opts,
        }).format(n),
      formatCompact: (n) =>
        new Intl.NumberFormat(numLocale, {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(n),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
