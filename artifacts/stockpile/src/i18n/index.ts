import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en";
import id from "./id";

const LANG_KEY = "pm_language";

const savedLang = localStorage.getItem(LANG_KEY) ?? "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    id: { translation: id },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem(LANG_KEY, lng);
});

export default i18n;
