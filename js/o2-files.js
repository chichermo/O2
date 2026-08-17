/**
 * O2 bijlagen: upload bij beschrijving situatie en teamopvolging.
 * Supabase Storage + metadata; zonder config: base64 in localStorage/incident-JSON.
 */
(function () {
  const BUCKET = 'o2_attachments';
  const TABLE = 'o2_attachments';
  const LOCAL_KEY = 'o2_bijlagen_pending';
  const MAX_BYTES = 10 * 1024 * 1024;

  function getClient() {
    const cfg = window.__O2_SUPABASE__ || {};
    if (!cfg.url || !cfg.anonKey || cfg.anonKey.indexOf('PEGA_AQUI') === 0) return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    return window.supabase.createClient(cfg.url, cfg.anonKey);
  }

  function uid() {
    return crypto.randomUUID();
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeName(name) {
    return String(name || 'bestand').replace(/[^\w.\-() ]+/g, '_').slice(0, 120);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function getZoneRoot(el) {
    return el.closest('[data-file-zone]') || el;
  }

  function getListEl(zone) {
    return zone.querySelector('.file-zone-list');
  }

  function renderZone(zone) {
    const list = getListEl(zone);
    if (!list) return;
    const files = zone.__o2Files || [];
    if (!files.length) {
      list.innerHTML = '<p class="file-zone-empty">Nog geen bestanden toegevoegd.</p>';
      return;
    }
    list.innerHTML = files
      .map(
        (f) => `
      <div class="file-item" data-file-id="${escapeHtml(f.id)}">
        <div class="file-item-info">
          <span class="file-item-name">${escapeHtml(f.name)}</span>
          <span class="file-item-size">${formatSize(f.size)}</span>
        </div>
        <div class="file-item-actions no-print">
          ${
            f.url || f.dataUrl
              ? `<a href="${escapeHtml(f.url || f.dataUrl)}" class="btn-ghost btn-small" target="_blank" rel="noopener noreferrer" download="${escapeHtml(f.name)}">Openen</a>`
              : ''
          }
          <button type="button" class="btn-ghost btn-small file-remove" data-file-id="${escapeHtml(f.id)}">Verwijderen</button>
        </div>
      </div>`
      )
      .join('');
  }

  function addFilesToZone(zone, fileList) {
    if (!zone.__o2Files) zone.__o2Files = [];
    const added = [];
    [...fileList].forEach((file) => {
      if (file.size > MAX_BYTES) {
        alert(`"${file.name}" is te groot (max. ${formatSize(MAX_BYTES)}).`);
        return;
      }
      const entry = {
        id: uid(),
        name: file.name,
        size: file.size,
        mimeType: file.type || '',
        file,
      };
      zone.__o2Files.push(entry);
      added.push(entry);
    });
    renderZone(zone);
    zone.dispatchEvent(new CustomEvent('o2fileschange'));
    return added;
  }

  function removeFromZone(zone, fileId) {
    zone.__o2Files = (zone.__o2Files || []).filter((f) => f.id !== fileId);
    renderZone(zone);
    zone.dispatchEvent(new CustomEvent('o2fileschange'));
  }

  function mountZone(container) {
    if (!container) return null;
    container.classList.add('file-zone');
    if (!container.querySelector('.file-zone-list')) {
      container.insertAdjacentHTML(
        'beforeend',
        `
      <div class="file-zone-list"></div>
      <div class="btn-row no-print">
        <label class="btn-secondary btn-small file-add-btn">
          Bestand toevoegen
          <input type="file" class="file-input" multiple>
        </label>
      </div>
      <p class="hint file-zone-hint no-print">Je kunt bestanden toevoegen (afbeelding, PDF of Word). Maximum ${formatSize(MAX_BYTES)} per bestand.</p>
    `
      );
    }
    if (!container.__o2Files) container.__o2Files = [];

    if (!container.dataset.fileMounted) {
      container.dataset.fileMounted = '1';
      container.querySelector('.file-input').addEventListener('change', (e) => {
        if (e.target.files?.length) addFilesToZone(container, e.target.files);
        e.target.value = '';
      });
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.file-remove');
        if (!btn) return;
        removeFromZone(container, btn.dataset.fileId);
      });
    }

    renderZone(container);
    return container;
  }

  function getZoneFiles(zoneOrContainer) {
    const zone = getZoneRoot(zoneOrContainer);
    return (zone.__o2Files || []).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType || '',
      url: f.url || '',
      dataUrl: f.dataUrl || '',
      storagePath: f.storagePath || '',
    }));
  }

  function setZoneFiles(zoneOrContainer, files) {
    const zone = getZoneRoot(zoneOrContainer);
    zone.__o2Files = (files || []).map((f) => ({ ...f, file: null }));
    renderZone(zone);
  }

  function clearZone(zoneOrContainer) {
    const zone = getZoneRoot(zoneOrContainer);
    zone.__o2Files = [];
    renderZone(zone);
  }

  function formatFilesForReport(files) {
    if (!files || !files.length) return '';
    return files
      .map((f, i) => {
        const link = f.url || f.dataUrl;
        return link
          ? `   ${i + 1}. ${f.name} (${formatSize(f.size)}) — ${link}`
          : `   ${i + 1}. ${f.name} (${formatSize(f.size)})`;
      })
      .join('\n');
  }

  async function uploadOne(sb, incidentId, section, fileMeta, opvolgingNr) {
    if (fileMeta.url || fileMeta.dataUrl) {
      return {
        id: fileMeta.id,
        name: fileMeta.name,
        size: fileMeta.size,
        mimeType: fileMeta.mimeType || '',
        url: fileMeta.url || fileMeta.dataUrl,
        storagePath: fileMeta.storagePath || '',
      };
    }

    if (!fileMeta.file && !fileMeta.dataUrl) return null;

    if (!sb) {
      const dataUrl = fileMeta.dataUrl || (await readFileAsDataUrl(fileMeta.file));
      return {
        id: fileMeta.id,
        name: fileMeta.name,
        size: fileMeta.size,
        mimeType: fileMeta.mimeType || '',
        dataUrl,
        url: '',
        storagePath: '',
      };
    }

    const ext = (fileMeta.name.split('.').pop() || 'bin').toLowerCase();
    const storagePath = `${incidentId}/${section}${opvolgingNr != null ? `-opv${opvolgingNr}` : ''}/${fileMeta.id}.${ext}`;

    const body = fileMeta.file;
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(storagePath, body, {
      upsert: true,
      contentType: fileMeta.mimeType || undefined,
    });
    if (uploadError) throw uploadError;

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
    const url = pub.publicUrl;

    const row = {
      id: fileMeta.id,
      incident_id: incidentId,
      section,
      opvolging_nr: opvolgingNr ?? null,
      name: fileMeta.name,
      url,
      storage_path: storagePath,
      size: fileMeta.size,
      mime_type: fileMeta.mimeType || '',
    };

    const { error: insertError } = await sb.from(TABLE).insert(row);
    if (insertError) console.warn('O2 attachment metadata:', insertError);

    return {
      id: fileMeta.id,
      name: fileMeta.name,
      size: fileMeta.size,
      mimeType: fileMeta.mimeType || '',
      url,
      storagePath,
    };
  }

  async function prepareIncidentAttachments(incident) {
    const sb = getClient();
    const beschrijvingRaw = incident.beschrijvingBijlagen || [];
    const beschrijvingBijlagen = [];

    for (const f of beschrijvingRaw) {
      const uploaded = await uploadOne(sb, incident.id, 'beschrijving', f, null);
      if (uploaded) beschrijvingBijlagen.push(uploaded);
    }

    const opvolgingen = [];
    for (const opv of incident.opvolgingen || []) {
      const bijlagen = [];
      for (const f of opv.bijlagen || []) {
        const uploaded = await uploadOne(sb, incident.id, 'opvolging', f, opv.nr);
        if (uploaded) bijlagen.push(uploaded);
      }
      opvolgingen.push({ ...opv, bijlagen });
    }

    return {
      ...incident,
      beschrijvingBijlagen,
      opvolgingen,
    };
  }

  function clearLocalPending() {
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
  }

  window.O2Files = {
    mountZone,
    getZoneFiles,
    setZoneFiles,
    clearZone,
    formatFilesForReport,
    formatSize,
    prepareIncidentAttachments,
    isRemote() {
      return !!getClient();
    },
    clearLocalPending,
  };
})();
