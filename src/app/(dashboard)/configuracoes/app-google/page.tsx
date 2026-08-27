"use client";

// /configuracoes/app-google — versao do tenant.
// Reaproveita a mesma page do superadmin (/app-google). O backend filtra
// resultados por perfil: admin so ve a propria linha do tenant + global.
// O AppGooglePage detecta o perfil e oculta a coluna "Tenant" + dropdown global.
export { default } from "../../app-google/page";
