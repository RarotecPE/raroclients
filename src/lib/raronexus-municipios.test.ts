import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
import {
  clearRaroNexusMunicipiosCache,
  getRaroNexusMunicipioDetalhe,
  getRaroNexusMunicipiosByUf,
  getRaroNexusUfs,
  RaroNexusMunicipiosError,
} from "./raronexus-municipios";

const originalEnv = {
  municipiosApi: process.env.RARONEXUS_MUNICIPIOS_API,
  baseUrl: process.env.RARONEXUS_BASE_URL,
};

const SAMPLE_PAYLOAD = [
  {
    uf: "RO",
    nome_uf: "Rondônia",
    municipios: [
      { codigoIbge: 1100023, nome: "Ariquemes" },
      { codigoIbge: 1100015, nome: "Alta Floresta D'Oeste" },
    ],
  },
  {
    uf: "PE",
    nome_uf: "Pernambuco",
    municipios: [
      { codigoIbge: 2611606, nome: "Recife" },
      { codigoIbge: 2600054, nome: "Abreu e Lima" },
      { codigoIbge: 2604007, nome: "Carpina" },
    ],
  },
  {
    uf: "AC",
    nome_uf: "Acre",
    municipios: [{ codigoIbge: 1200401, nome: "Rio Branco" }],
  },
];

beforeEach(() => {
  clearRaroNexusMunicipiosCache();
  process.env.RARONEXUS_MUNICIPIOS_API = "https://nexus.example.com/api/constants/municipios";
  process.env.RARONEXUS_BASE_URL = "https://nexus.example.com";
});

afterEach(() => {
  clearRaroNexusMunicipiosCache();
  mock.restoreAll();
  for (const [name, value] of Object.entries({
    RARONEXUS_MUNICIPIOS_API: originalEnv.municipiosApi,
    RARONEXUS_BASE_URL: originalEnv.baseUrl,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("carrega UFs e municípios da API do RaroNexus com ordenação pt-BR, headers de sessão e cache em memória", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: input.toString(), init });
    return Response.json(SAMPLE_PAYLOAD);
  });

  const ufs = await getRaroNexusUfs("global-token-123");
  const municipiosPe = await getRaroNexusMunicipiosByUf("pe", "global-token-123");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://nexus.example.com/api/constants/municipios");
  assert.equal(calls[0]?.init?.cache, "no-store");
  assert.deepEqual(calls[0]?.init?.headers, {
    accept: "application/json",
    Cookie: "raronexus_global_session=global-token-123",
    Authorization: "Bearer global-token-123",
  });
  assert.deepEqual(ufs, [
    { sigla: "AC", nome: "Acre" },
    { sigla: "PE", nome: "Pernambuco" },
    { sigla: "RO", nome: "Rondônia" },
  ]);
  assert.deepEqual(municipiosPe, [
    { id: "2600054", nome: "Abreu e Lima" },
    { id: "2604007", nome: "Carpina" },
    { id: "2611606", nome: "Recife" },
  ]);
});

test("aceita payload encapsulado no padrão { success: true, data: [...] }", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ success: true, data: SAMPLE_PAYLOAD }));

  const ufs = await getRaroNexusUfs("token-envelope");
  assert.deepEqual(ufs.map((item) => item.sigla), ["AC", "PE", "RO"]);
});

test("usa fallback de RARONEXUS_BASE_URL quando RARONEXUS_MUNICIPIOS_API não está definida", async () => {
  delete process.env.RARONEXUS_MUNICIPIOS_API;
  let capturedUrl = "";
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    capturedUrl = input.toString();
    return Response.json(SAMPLE_PAYLOAD);
  });

  await getRaroNexusUfs("token-fallback");
  assert.equal(capturedUrl, "https://nexus.example.com/api/constants/municipios");
});

test("propaga status 401 quando o RaroNexus rejeita a sessão", async () => {
  mock.method(globalThis, "fetch", async () => Response.json(
    { success: false, message: "Sessao invalida ou encerrada.", code: "GLOBAL_SESSION_INVALID" },
    { status: 401 },
  ));

  await assert.rejects(
    getRaroNexusUfs("expired-token"),
    (error: unknown) =>
      error instanceof RaroNexusMunicipiosError
      && error.status === 401
      && /Sessao invalida/.test(error.message),
  );
});

test("resolve detalhe do município via RaroNexus e enriquece população via SIDRA", async () => {
  const urls: string[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input.toString();
    urls.push(url);
    if (url.includes("apisidra.ibge.gov.br")) {
      return Response.json([
        { V: "Valor" },
        { V: "1.488.920" },
      ]);
    }
    return Response.json(SAMPLE_PAYLOAD);
  });

  const detalhe = await getRaroNexusMunicipioDetalhe("2611606", "token-detalhe");

  assert.deepEqual(detalhe, {
    id: "2611606",
    nome: "Recife",
    uf: "PE",
    populacao: 1488920,
  });
  assert.equal(urls.length, 2);
  assert.ok(urls[0]?.includes("/api/constants/municipios"));
  assert.ok(urls[1]?.includes("apisidra.ibge.gov.br/values/t/6579/n6/2611606/v/9324/p/last"));
});

test("mantém detalhe do município com populacao null quando o SIDRA falha", async () => {
  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input.toString();
    if (url.includes("apisidra.ibge.gov.br")) {
      throw new Error("sidra timeout");
    }
    return Response.json(SAMPLE_PAYLOAD);
  });

  const detalhe = await getRaroNexusMunicipioDetalhe("2604007", "token-sidra-fail");

  assert.deepEqual(detalhe, {
    id: "2604007",
    nome: "Carpina",
    uf: "PE",
    populacao: null,
  });
});

test("valida entradas inválidas e configuração ausente sem chamar fetch desnecessariamente", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json(SAMPLE_PAYLOAD));

  assert.deepEqual(await getRaroNexusMunicipiosByUf("123", "token"), []);
  assert.equal(await getRaroNexusMunicipioDetalhe("abc", "token"), null);
  assert.equal(fetchMock.mock.callCount(), 0);

  delete process.env.RARONEXUS_MUNICIPIOS_API;
  delete process.env.RARONEXUS_BASE_URL;

  await assert.rejects(
    getRaroNexusUfs("token"),
    /RARONEXUS_MUNICIPIOS_API is required/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});
