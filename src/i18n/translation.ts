import { siteConfig } from "../config";
import type I18nKey from "./i18nKey";
import { en } from "./languages/en";
import { es } from "./languages/es";
import { ko } from "./languages/ko";
import { de } from  "./languages/de";

export type Translation = {
	[K in I18nKey]: string;
};

const defaultTranslation = en;

const map: { [key: string]: Translation } = {
	es: es,
	en: en,
	en_us: en,
	en_gb: en,
	en_au: en,
	ko: ko,
	ko_kr: ko,
	de: de,
};

export function getTranslation(lang: string): Translation {
	return map[lang.toLowerCase()] || defaultTranslation;
}

export function i18n(key: I18nKey): string {
	const lang = siteConfig.lang || "en";
	return getTranslation(lang)[key];
}
