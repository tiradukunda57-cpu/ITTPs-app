const I18N = {
  lang: localStorage.getItem('lang') || 'rw',
  dict: {},

  async load(lang) {
    this.lang = lang;
    localStorage.setItem('lang', lang);
    try {
      this.dict = await API.get(`/api/locales/${lang}`);
    } catch (e) {
      this.dict = {};
    }
  },

  t(key) {
    return this.dict[key] || key;
  }
};
