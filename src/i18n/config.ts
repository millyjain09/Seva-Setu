import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import hi from './locales/hi.json';
import hin from './locales/hin.json';
import pa from './locales/pa.json';
import mr from './locales/mr.json';
import kn from './locales/kn.json';
import bn from './locales/bn.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import gu from './locales/gu.json';
import ml from './locales/ml.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', voice: 'en-IN' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', voice: 'hi-IN' },
  { code: 'hin', label: 'Hinglish', native: 'Hinglish', voice: 'en-IN' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', voice: 'pa-IN' },
  { code: 'mr', label: 'Marathi', native: 'मराठी', voice: 'mr-IN' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', voice: 'kn-IN' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা', voice: 'bn-IN' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', voice: 'ta-IN' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', voice: 'te-IN' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', voice: 'gu-IN' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', voice: 'ml-IN' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      hin: { translation: hin },
      pa: { translation: pa },
      mr: { translation: mr },
      kn: { translation: kn },
      bn: { translation: bn },
      ta: { translation: ta },
      te: { translation: te },
      gu: { translation: gu },
      ml: { translation: ml },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'sevasetu_lang',
      caches: ['localStorage'],
    },
  });

export default i18n;