import { translations } from '@casino/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useSettings } from './store/settings';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: translations.en },
    vi: { translation: translations.vi },
  },
  lng: useSettings.getState().locale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

document.documentElement.lang = i18n.language;
useSettings.subscribe((s) => {
  if (s.locale !== i18n.language) {
    void i18n.changeLanguage(s.locale);
    document.documentElement.lang = s.locale;
  }
});

export default i18n;
