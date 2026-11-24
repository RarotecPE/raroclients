const SIDRA_BASE = "https://apisidra.ibge.gov.br/values";
const SIDRA_REVALIDATE = 60 * 60 * 24 * 30;
const CATALOG_TTL_MS = 1000 * 60 * 60 * 24;

export interface RaroNexusUfOption {
  sigla: string;
  nome: string;
}

export interface RaroNexusMunicipioOption {
  id: string;
  nome: string;
}

export interface RaroNexusMunicipioDetalhe {
  id: string;
  nome: string;
  uf: string;
  populacao: number | null;
}

export interface RaroNexusUfCatalogo {
  sigla: string;
  nome: string;
  municipios: RaroNexusMunicipioOption[];
}

interface RaroNexusMunicipioRaw {
  codigoIbge?: unknown;
  nome?: unknown;
}

interface RaroNexusUfRaw {
  uf?: unknown;
  sigla?: unknown;
  nome_uf?: unknown;
  nome?: unknown;
  municipios?: unknown;
}

interface RaroNexusEnvelope {
  success?: unknown;
  message?: unknown;
  error?: unknown;
  data?: unknown;
}

export class RaroNexusMunicipiosError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "RaroNexusMunicipiosError";
    this.status = status;
  }
}

let cachedCatalog: { expiresAt: number; data: RaroNexusUfCatalogo[] } | null = null;
let inFlightCatalog: Promise<RaroNexusUfCatalogo[]> | null = null;

export function clearRaroNexusMunicipiosCache() {
  cachedCatalog = null;
  inFlightCatalog = null;
}

function getRaroNexusMunicipiosUrl(): string {
  const directUrl = process.env.RARONEXUS_MUNICIPIOS_API?.trim();
  if (directUrl) return directUrl;

  const baseUrl = process.env.RARONEXUS_BASE_URL?.trim();
  if (baseUrl) return new URL("/api/constants/municipios", baseUrl).toString();

  throw new RaroNexusMunicipiosError("RARONEXUS_MUNICIPIOS_API is required", 500);
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const envelope = payload as RaroNexusEnvelope;
  if (typeof envelope.message === "string" && envelope.message.trim()) return envelope.message.trim();
  if (typeof envelope.error === "string" && envelope.error.trim()) return envelope.error.trim();
  return null;
}

function extractRawUfArray(payload: unknown): RaroNexusUfRaw[] {
  if (Array.isArray(payload)) return payload as RaroNexusUfRaw[];

  if (payload && typeof payload === "object") {
    const envelope = payload as RaroNexusEnvelope;
    if (envelope.success === false) {
      throw new RaroNexusMunicipiosError(
        extractErrorMessage(envelope) ?? "A API RaroNexus retornou uma resposta sem sucesso.",
        502,
      );
    }

    if (Array.isArray(envelope.data)) return envelope.data as RaroNexusUfRaw[];

    if (envelope.data && typeof envelope.data === "object") {
      const nested = envelope.data as Record<string, unknown>;
      if (Array.isArray(nested.ufs)) return nested.ufs as RaroNexusUfRaw[];
      if (Array.isArray(nested.estados)) return nested.estados as RaroNexusUfRaw[];
    }
  }

  throw new RaroNexusMunicipiosError("Formato invalido retornado pela API de municipios do RaroNexus.", 502);
}

export function parseRaroNexusMunicipiosPayload(payload: unknown): RaroNexusUfCatalogo[] {
  const rawUfs = extractRawUfArray(payload);
  const catalog: RaroNexusUfCatalogo[] = [];

  for (const item of rawUfs) {
    if (!item || typeof item !== "object") continue;

    const rawSigla = typeof item.uf === "string" ? item.uf : typeof item.sigla === "string" ? item.sigla : "";
    const sigla = rawSigla.trim().toUpperCase();
    const rawNome = typeof item.nome_uf === "string" ? item.nome_uf : typeof item.nome === "string" ? item.nome : "";
    const nome = rawNome.trim();

    if (!/^[A-Z]{2}$/.test(sigla) || !nome || !Array.isArray(item.municipios)) continue;

    const municipios: RaroNexusMunicipioOption[] = [];
    for (const rawMunicipio of item.municipios as RaroNexusMunicipioRaw[]) {
      if (!rawMunicipio || typeof rawMunicipio !== "object") continue;

      const rawCode = rawMunicipio.codigoIbge;
      const id =
        typeof rawCode === "number" && Number.isFinite(rawCode)
          ? String(rawCode)
          : typeof rawCode === "string"
            ? rawCode.trim()
            : "";
      const municipioNome = typeof rawMunicipio.nome === "string" ? rawMunicipio.nome.trim() : "";

      if (!id || !municipioNome) continue;
      municipios.push({ id, nome: municipioNome });
    }

    municipios.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    catalog.push({ sigla, nome, municipios });
  }

  if (catalog.length === 0) {
    throw new RaroNexusMunicipiosError("A API de municipios do RaroNexus nao retornou UFs validas.", 502);
  }

  catalog.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return catalog;
}

async function fetchRaroNexusCatalog(sessionToken: string): Promise<RaroNexusUfCatalogo[]> {
  const url = getRaroNexusMunicipiosUrl();
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      Cookie: `raronexus_global_session=${encodeURIComponent(sessionToken)}`,
      Authorization: `Bearer ${sessionToken}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message = extractErrorMessage(payload) ?? `RaroNexus municipios request failed: ${response.status}`;
    throw new RaroNexusMunicipiosError(message, response.status === 401 ? 401 : 502);
  }

  return parseRaroNexusMunicipiosPayload(payload);
}

async function loadRaroNexusCatalog(sessionToken: string): Promise<RaroNexusUfCatalogo[]> {
  const token = sessionToken.trim();
  if (!token) {
    throw new RaroNexusMunicipiosError("Sessao nao encontrada.", 401);
  }

  if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) {
    return cachedCatalog.data;
  }

  if (!inFlightCatalog) {
    inFlightCatalog = fetchRaroNexusCatalog(token)
      .then((data) => {
        cachedCatalog = { expiresAt: Date.now() + CATALOG_TTL_MS, data };
        return data;
      })
      .finally(() => {
        inFlightCatalog = null;
      });
  }

  return inFlightCatalog;
}

export async function getRaroNexusUfs(sessionToken: string): Promise<RaroNexusUfOption[]> {
  const catalog = await loadRaroNexusCatalog(sessionToken);
  return catalog.map(({ sigla, nome }) => ({ sigla, nome }));
}

export async function getRaroNexusMunicipiosByUf(
  uf: string,
  sessionToken: string,
): Promise<RaroNexusMunicipioOption[]> {
  const normalizedUf = uf.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedUf)) return [];

  const catalog = await loadRaroNexusCatalog(sessionToken);
  return catalog.find((item) => item.sigla === normalizedUf)?.municipios ?? [];
}

async function getPopulacaoEstimada(codigoIbge: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${SIDRA_BASE}/t/6579/n6/${encodeURIComponent(codigoIbge)}/v/9324/p/last?formato=json`,
      {
        next: { revalidate: SIDRA_REVALIDATE },
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok) return null;

    const rows = (await response.json()) as Record<string, string>[];
    if (!Array.isArray(rows)) return null;

    const value = rows.find(
      (row) => typeof row.V === "string" && !["...", "-", "X"].includes(row.V) && /\d/.test(row.V),
    )?.V;
    if (!value) return null;

    const numeric = Number.parseInt(value.replace(/\D/g, ""), 10);
    return Number.isNaN(numeric) ? null : numeric;
  } catch {
    return null;
  }
}

export async function getRaroNexusMunicipioDetalhe(
  codigoIbge: string,
  sessionToken: string,
): Promise<RaroNexusMunicipioDetalhe | null> {
  const normalizedCodigo = codigoIbge.trim();
  if (!/^\d{7}$/.test(normalizedCodigo)) return null;

  const catalog = await loadRaroNexusCatalog(sessionToken);

  for (const ufEntry of catalog) {
    const municipio = ufEntry.municipios.find((item) => item.id === normalizedCodigo);
    if (municipio) {
      return {
        id: municipio.id,
        nome: municipio.nome,
        uf: ufEntry.sigla,
        populacao: await getPopulacaoEstimada(normalizedCodigo),
      };
    }
  }

  return null;
}
