/**
 * Persistencia O2: Supabase (o2_incidenten) con fallback a localStorage.
 */
(function () {
  const LOCAL_KEY = 'o2_incidenten';
  let client = null;
  let cache = null;

  function getClient() {
    if (client) return client;
    const cfg = window.__O2_SUPABASE__ || {};
    if (!cfg.url || !cfg.anonKey || cfg.anonKey.indexOf('PEGA_AQUI') === 0) return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    client = window.supabase.createClient(cfg.url, cfg.anonKey);
    return client;
  }

  function rowToIncident(row) {
    return {
      id: row.id,
      opgeslagenOp: row.opgeslagen_op,
      datumIncident: row.datum_incident || '',
      verbaleAgressie: !!row.verbale_agressie,
      fysiekeAgressie: !!row.fysieke_agressie,
      beschrijving: row.beschrijving || '',
      leerlingen: Array.isArray(row.leerlingen) ? row.leerlingen : [],
      personeel: Array.isArray(row.personeel) ? row.personeel : [],
      opvolgingen: Array.isArray(row.opvolgingen) ? row.opvolgingen : [],
      andereData: row.andere_data || ''
    };
  }

  function incidentToRow(incident) {
    return {
      id: incident.id,
      datum_incident: incident.datumIncident || null,
      verbale_agressie: !!incident.verbaleAgressie,
      fysieke_agressie: !!incident.fysiekeAgressie,
      beschrijving: incident.beschrijving || '',
      leerlingen: incident.leerlingen || [],
      personeel: incident.personeel || [],
      opvolgingen: incident.opvolgingen || [],
      andere_data: incident.andereData || '',
      opgeslagen_op: incident.opgeslagenOp || new Date().toISOString()
    };
  }

  function readLocal() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    } catch {
      return [];
    }
  }

  async function loadAll() {
    const sb = getClient();
    if (!sb) return readLocal();
    const { data, error } = await sb
      .from('o2_incidenten')
      .select('*')
      .order('opgeslagen_op', { ascending: true });
    if (error) {
      console.error('O2 Supabase load:', error);
      return readLocal();
    }
    return (data || []).map(rowToIncident);
  }

  window.O2DB = {
    async init() {
      cache = await loadAll();
      return {
        count: cache.length,
        mode: getClient() ? 'supabase' : 'local'
      };
    },
    getAll() {
      return cache || [];
    },
    isRemote() {
      return !!getClient();
    },
    async save(incident) {
      if (!cache) cache = [];
      cache.push(incident);
      const sb = getClient();
      if (!sb) {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(cache));
        return { mode: 'local' };
      }
      const { error } = await sb.from('o2_incidenten').insert(incidentToRow(incident));
      if (error) {
        console.error('O2 Supabase save:', error);
        localStorage.setItem(LOCAL_KEY, JSON.stringify(cache));
        throw error;
      }
      return { mode: 'supabase' };
    },
    async clear() {
      cache = [];
      localStorage.removeItem(LOCAL_KEY);
      const sb = getClient();
      if (!sb) return { mode: 'local' };
      const { error } = await sb.from('o2_incidenten').delete().neq('id', '');
      if (error) throw error;
      return { mode: 'supabase' };
    }
  };
})();
