/**
 * Name / list parsing for O2 bulk & Excel import.
 * Achternaam;Voornaam → Voornaam Achternaam
 */
(function (global) {
  function unglueCamelCase(value) {
    return String(value || '')
      .replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2')
      .replace(/([A-ZÀ-Ÿ]{2,})([A-ZÀ-Ÿ][a-zà-ÿ])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function looksLikeClassToken(s) {
    const t = String(s || '').trim();
    if (!t) return false;
    if (/^\d/.test(t)) return true;
    if (/^(klas|groep|jaar)\b/i.test(t)) return true;
    return false;
  }

  function normalizePersonName() {
    const cleaned = Array.prototype.slice
      .call(arguments)
      .map(function (p) {
        return p == null ? '' : String(p).replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean);
    if (cleaned.length === 1 && /[;,]/.test(cleaned[0])) {
      return fixSemicolonName(cleaned[0]);
    }
    return unglueCamelCase(cleaned.join(' '));
  }

  function fixSemicolonName(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (value.indexOf(';') !== -1) {
      const bits = value.split(';').map(function (s) { return s.trim(); }).filter(Boolean);
      if (bits.length >= 2 && !looksLikeClassToken(bits[1])) {
        return normalizePersonName(bits[1], bits[0]);
      }
      return normalizePersonName.apply(null, bits);
    }
    if (value.indexOf(',') !== -1) {
      const bits = value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (bits.length >= 2 && !looksLikeClassToken(bits[1])) {
        return normalizePersonName(bits.slice(1).join(' '), bits[0]);
      }
    }
    return normalizePersonName(value);
  }

  function cellExact(row, keys) {
    const headers = Object.keys(row || {});
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const hit = headers.find(function (k) {
        return k.trim().toLowerCase() === key.toLowerCase();
      });
      if (hit != null && row[hit] != null && String(row[hit]).trim() !== '') {
        return String(row[hit]).trim();
      }
    }
    return '';
  }

  function buildStudentName(row) {
    const voornaam = cellExact(row, ['Voornaam', 'First name', 'Firstname', 'First Name']);
    const achternaam = cellExact(row, [
      'Achternaam', 'Last name', 'Lastname', 'Familienaam', 'Last Name',
    ]);
    const naam = cellExact(row, ['Naam', 'Name']);
    const full = cellExact(row, [
      'Volledige naam', 'Volledige Naam', 'Full name', 'Full Name', 'Leerling', 'Student', 'Personeel',
    ]);
    if (voornaam && (achternaam || naam)) return normalizePersonName(voornaam, achternaam || naam);
    if (full) return fixSemicolonName(full);
    if (naam) return fixSemicolonName(naam);
    if (voornaam) return normalizePersonName(voornaam);
    if (achternaam) return normalizePersonName(achternaam);
    return '';
  }

  /** Paste lines → unique names (order preserved). */
  function parseNameLines(text) {
    const seen = new Set();
    const out = [];
    String(text || '')
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean)
      .forEach(function (line) {
        let name = '';
        if (/[;\t]/.test(line)) {
          const parts = line.split(/[;\t]/).map(function (p) { return p.trim(); }).filter(Boolean);
          if (parts.length >= 2 && !looksLikeClassToken(parts[1])) {
            // Achternaam;Voornaam[;Klas]
            name = normalizePersonName(parts[1], parts[0]);
          } else if (parts.length >= 2 && looksLikeClassToken(parts[1])) {
            name = fixSemicolonName(parts[0]);
          } else {
            name = fixSemicolonName(parts[0] || line);
          }
        } else {
          name = fixSemicolonName(line);
        }
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(name);
      });
    return out;
  }

  function namesFromExcelRows(rows) {
    const seen = new Set();
    const out = [];
    (rows || []).forEach(function (row) {
      const name = buildStudentName(row);
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(name);
    });
    return out;
  }

  global.O2Import = {
    fixSemicolonName: fixSemicolonName,
    parseNameLines: parseNameLines,
    namesFromExcelRows: namesFromExcelRows,
    buildStudentName: buildStudentName,
  };
})(typeof window !== 'undefined' ? window : globalThis);
