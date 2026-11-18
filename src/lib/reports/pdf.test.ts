import test from "node:test";
import assert from "node:assert/strict";

import {
  getReportDefinition,
  reportFileName,
  reportLinks,
  reportQueryString,
  REPORTS,
} from "./pdf";
import { buildFiltersSummary } from "./summary";

test("getReportDefinition localiza cada um dos 12 relatórios cadastrados", () => {
  for (const report of REPORTS) {
    const def = getReportDefinition(report.tipo);
    assert.ok(def, `Relatório ${report.tipo} deve existir`);
    assert.equal(def.title, report.title);
  }

  // Suporte a legado / alias
  const aliasDef = getReportDefinition("contratos-vencimento");
  assert.ok(aliasDef);
  assert.equal(aliasDef.tipo, "contratos-cobertura");
});

test("reportFileName retorna o nome com extensão .pdf", () => {
  assert.equal(reportFileName("resumo-executivo"), "resumo-executivo.pdf");
  assert.equal(reportFileName("mapa-implantacao"), "mapa-implantacao.pdf");
});

test("reportQueryString monta parâmetros corretamente ignorando campos vazios", () => {
  assert.equal(reportQueryString({}), "");
  assert.equal(reportQueryString({ clienteId: "" }), "");
  assert.equal(
    reportQueryString({ clienteId: "cli-123", modulo: "Tributos" }),
    "?clienteId=cli-123&modulo=Tributos",
  );

  const qs = reportQueryString({
    clienteId: "cli-1",
    situacaoPendencia: "aberta",
    dataInicio: "2026-01-01",
    dataFim: "2026-12-31",
  });
  const params = new URLSearchParams(qs.replace("?", ""));
  assert.equal(params.get("clienteId"), "cli-1");
  assert.equal(params.get("situacaoPendencia"), "aberta");
  assert.equal(params.get("dataInicio"), "2026-01-01");
  assert.equal(params.get("dataFim"), "2026-12-31");
});

test("reportLinks gera links com parâmetros de query string quando filtros são passados", () => {
  const linksSemFiltro = reportLinks();
  assert.equal(linksSemFiltro.length, REPORTS.length);
  assert.equal(linksSemFiltro[0].href, `/api/relatorios/${REPORTS[0].tipo}/pdf`);

  const linksComFiltro = reportLinks({ clienteId: "mun-99" });
  assert.equal(linksComFiltro[0].href, `/api/relatorios/${REPORTS[0].tipo}/pdf?clienteId=mun-99`);
});

test("buildFiltersSummary gera resumo contextual legível para o cabeçalho do PDF", () => {
  const summarySemFiltros = buildFiltersSummary({});
  assert.deepEqual(summarySemFiltros, []);

  const summaryCompleto = buildFiltersSummary(
    {
      modulo: "Contabilidade",
      situacaoCliente: "cliente_ativo",
      situacaoPendencia: "aberta",
      tipoBase: "Prefeitura",
      dataInicio: "2026-01-01",
      dataFim: "2026-12-31",
    },
    "Prefeitura Municipal de Teste",
  );

  assert.ok(summaryCompleto.some((item) => item === "Cliente: Prefeitura Municipal de Teste"));
  assert.ok(summaryCompleto.some((item) => item.includes("Módulo: Contabilidade")));
  assert.ok(summaryCompleto.some((item) => item.includes("Pendências: Abertas")));
  assert.ok(summaryCompleto.some((item) => item.includes("Tipo Base: Prefeitura")));
  assert.ok(summaryCompleto.some((item) => item.includes("Período:")));
});
