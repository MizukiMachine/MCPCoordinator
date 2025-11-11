import { jaText } from "./ja";
import { Locale, UiText } from "./types";

const translations: Record<Locale, UiText> = {
  ja: jaText,
};

export const defaultLocale: Locale = "ja";

export function getUiText(locale: Locale = defaultLocale): UiText {
  return translations[locale];
}

export const uiText = getUiText();

export function formatUiText(
  template: string,
  replacements: Record<string, string | number>,
): string {
  return Object.entries(replacements).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}
