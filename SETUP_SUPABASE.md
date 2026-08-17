# O2 + Supabase (proyecto compartido Chill Outs)

## 1. Tablas

En el SQL Editor del proyecto **Chill Outs**, ejecuta:

[`supabase/shared_element_project.sql`](./supabase/shared_element_project.sql)

(Si ya lo corriste para Detentions, la tabla `o2_incidenten` ya existe.)

## 2. Config local / Vercel

```bash
copy config.example.js config.js
```

Edita `config.js` y pega la **anon key** de Chill Outs (Settings → API), la misma que usa la app Chill Outs.

Para Vercel (sitio estático): sube `config.js` al deploy **o** genera el archivo en el build. No hace falta service role.

## 3. Bijlagen (optioneel)

Voer in Supabase SQL Editor ook uit:

[`supabase/migration_o2_attachments.sql`](./supabase/migration_o2_attachments.sql)

Dit voegt storage voor bestanden toe bij **beschrijving situatie** en **teamopvolging**.

## 4. Comportamiento

- Con `config.js` válido → los verslagen se guardan en `o2_incidenten` (visibles para los ~5 usuarios).
- Sin config → fallback a `localStorage` del navegador (como antes).
