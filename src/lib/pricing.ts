export type Region = "UK" | "EU" | "US";

export type PricingOption = {
  id: string;
  label: string;
  percent: number; // 1.5 means 1.5%
  fixed: number;   // major units: 0.20 etc.
  currencySymbol: string;
};

export const PRICING: Record<Region, PricingOption[]> = {
  UK: [
    { id: "uk_standard", label: "Standard UK card", percent: 1.5, fixed: 0.2, currencySymbol: "£" },
    { id: "uk_premium", label: "Premium UK card (typical)", percent: 1.9, fixed: 0.2, currencySymbol: "£" },
    { id: "uk_eu_card", label: "EU card (UK merchant)", percent: 2.5, fixed: 0.2, currencySymbol: "£" },
    { id: "uk_international", label: "International card (typical)", percent: 3.25, fixed: 0.2, currencySymbol: "£" },
  ],
  EU: [
    { id: "eu_standard", label: "Standard EEA card", percent: 1.5, fixed: 0.25, currencySymbol: "€" },
    { id: "eu_premium", label: "Premium EEA card (typical)", percent: 1.9, fixed: 0.25, currencySymbol: "€" },
    { id: "eu_uk_card", label: "UK card (EU merchant)", percent: 2.5, fixed: 0.25, currencySymbol: "€" },
    { id: "eu_international", label: "International card (typical)", percent: 3.25, fixed: 0.25, currencySymbol: "€" },
  ],
  US: [
    { id: "us_standard", label: "Domestic US card (typical)", percent: 2.9, fixed: 0.3, currencySymbol: "$" },
    { id: "us_international", label: "International (typical)", percent: 4.4, fixed: 0.3, currencySymbol: "$" },
  ],
};
