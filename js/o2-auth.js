/**
 * Portal SSO-sessie voor O2 (Element → O2).
 * Lijsten & bulk alleen voor Chillouts-role "admin".
 */
(function () {
  const SESSION_KEY = 'o2_portal_session';
  const FALLBACK_SECRET = 'element-portal-sso-v1-school-internal';

  function getSecret() {
    const cfg = window.__O2_SUPABASE__ || {};
    return cfg.portalSsoSecret || window.__O2_PORTAL_SSO_SECRET__ || FALLBACK_SECRET;
  }

  function fromBase64Url(input) {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  function toBase64Url(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function verifyToken(token) {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(getSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const expected = toBase64Url(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
    if (expected !== sig) return null;
    try {
      const json = new TextDecoder().decode(fromBase64Url(body));
      const payload = JSON.parse(json);
      if (!payload?.username || !payload?.exp) return null;
      if (payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function writeSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function isAdmin() {
    const s = readSession();
    return !!(s && s.role === 'admin');
  }

  function getUsername() {
    return readSession()?.username || '';
  }

  window.O2Auth = {
    SESSION_KEY,
    verifyToken,
    readSession,
    writeSession,
    clearSession,
    isAdmin,
    getUsername,
    async acceptPortalToken(token, fallbackUser) {
      const payload = await verifyToken(token);
      if (!payload) return null;
      const session = {
        username: payload.username || fallbackUser || '',
        role: payload.role || 'reports_access',
        from: 'element-portal',
        at: new Date().toISOString(),
      };
      writeSession(session);
      return session;
    },
  };
})();
