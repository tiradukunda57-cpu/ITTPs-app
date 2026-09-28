const API = {
  base: '',
  token: sessionStorage.getItem('token') || null,

  setToken(t) {
    this.token = t;
    if (t) sessionStorage.setItem('token', t); else sessionStorage.removeItem('token');
  },

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Habaye ikibazo.');
      err.code = data && data.error;
      err.status = res.status;
      // Niba ticket (token) yo kwinjira itemewe/yarangiye igihe, siba ako gasanduku
      // k'amakuru ya kera muri browser kugira ngo umukoresha ahite asubizwa ku
      // ipaji yo kwinjira aho kugumana ubwo butumwa bw'ikosa burambye.
      if (res.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/register')) {
        this.setToken(null);
        sessionStorage.removeItem('user');
      }
      throw err;
    }
    return data;
  },

  // Gukuramo dosiye (PDF) ikeneye kwinjira (token) - ikoreshwa kuri fagitire.
  async download(path, fallbackName) {
    const headers = {};
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const res = await fetch(this.base + path, { headers });
    if (!res.ok) {
      let msg = 'Habaye ikibazo.';
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* no body */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    let filename = fallbackName || 'document.pdf';
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename="?([^";]+)"?/.exec(cd);
    if (m) filename = m[1];
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  patch(path, body) { return this.request('PATCH', path, body); },
  del(path) { return this.request('DELETE', path); }
};
