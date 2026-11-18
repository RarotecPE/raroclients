import { and, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  aditivos,
  baseModules,
  bases,
  contratoModulos,
  contratos,
  documentos,
  eventos,
  moduloResponsaveis,
  municipios,
  pendencias,
  propostas,
} from "@/db/schema";
import {
  EVENTO_TIPOS,
  MUNICIPIO_SITUACOES,
  PENDENCIA_TIPOS,
  optLabel,
} from "@/lib/constants";
import { computeOportunidades, contratadoSet, moduloState } from "@/lib/domain";
import { isOperationalEvent, isOperationalPendingType } from "@/lib/contract-reference";
import { countBy, formatDate, formatDateTime } from "@/lib/utils";
import { buildFiltersSummary } from "./summary";
import type { ReportFilters, ReportSection, ReportTipo } from "./types";

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return formatDateTime(value);
  return String(value);
}

export async function loadReportDataAndSections(
  tipo: ReportTipo,
  filters: ReportFilters = {},
): Promise<{ sections: ReportSection[]; filtersSummary: string[] }> {
  let matchedClienteNome: string | undefined;
  const addClientSummary = (nome?: string) => {
    if (nome) matchedClienteNome = nome;
  };
  const summary = () => buildFiltersSummary(filters, matchedClienteNome);

  // -------------------------------------------------------------------------
  // 1. Resumo Executivo
  // -------------------------------------------------------------------------
  if (tipo === "resumo-executivo") {
    const munConds = [];
    if (filters.clienteId) munConds.push(eq(municipios.id, filters.clienteId));
    if (filters.situacaoCliente) munConds.push(eq(municipios.situacao, filters.situacaoCliente));

    const ms = await db.select().from(municipios).where(munConds.length ? and(...munConds) : undefined);
    if (filters.clienteId && ms[0]) addClientSummary(ms[0].clienteNome);

    if (ms.length === 0) {
      return {
        sections: [{ title: "Indicadores gerais", rows: [], empty: "Nenhum cliente encontrado para os filtros selecionados." }],
        filtersSummary: summary(),
      };
    }

    const munIds = ms.map((m) => m.id);

    const [bs, cs, allPends] = await Promise.all([
      db.select().from(bases).where(inArray(bases.municipioId, munIds)),
      db.select().from(contratos).where(inArray(contratos.municipioId, munIds)),
      db.select().from(pendencias).where(inArray(pendencias.municipioId, munIds)),
    ]);

    const baseIds = bs.map((b) => b.id);
    const contratoIds = cs.map((c) => c.id);

    const [mods, cms] = await Promise.all([
      baseIds.length ? db.select().from(baseModules).where(inArray(baseModules.baseId, baseIds)) : Promise.resolve([]),
      contratoIds.length ? db.select().from(contratoModulos).where(inArray(contratoModulos.contratoId, contratoIds)) : Promise.resolve([]),
    ]);

    const pends = allPends.filter((p) => isOperationalPendingType(p.tipo));
    const conSet = contratadoSet(cms);
    const porSituacao = countBy(ms, (cliente) => cliente.situacao);
    const abertas = pends.filter((pendencia) => pendencia.situacao === "aberta");
    const habilitados = mods.filter((modulo) => modulo.habilitadoAt && !modulo.desabilitadoAt);

    const sections: ReportSection[] = [
      {
        title: "Indicadores gerais",
        headers: ["Indicador", "Total"],
        rows: [
          ["Clientes", ms.length],
          ["Bases", bs.length],
          ["Modulos", mods.length],
          ["Contratos", cs.length],
          ["Clientes com contrato", new Set(cs.map((c) => c.municipioId)).size],
          ["Modulos contemplados", conSet.size],
          ["Modulos habilitados", habilitados.length],
          ["Modulos habilitados sem execucao", habilitados.filter((m) => !m.execucaoInicio).length],
          ["Pendencias abertas", abertas.length],
          ["Bases incompletas", bs.filter((base) => !base.cnpj).length],
        ].map((row) => row.map(text)),
      },
      {
        title: "Clientes por situacao",
        headers: ["Situacao", "Total"],
        rows: MUNICIPIO_SITUACOES.map((situacao) => [situacao.label, text(porSituacao.get(situacao.value) ?? 0)]),
      },
    ];

    return { sections, filtersSummary: summary() };
  }

  // -------------------------------------------------------------------------
  // 2. Ficha Completa dos Clientes
  // -------------------------------------------------------------------------
  if (tipo === "ficha-clientes") {
    const munConds = [];
    if (filters.clienteId) munConds.push(eq(municipios.id, filters.clienteId));
    if (filters.situacaoCliente) munConds.push(eq(municipios.situacao, filters.situacaoCliente));

    const ms = await db.select().from(municipios).where(munConds.length ? and(...munConds) : undefined);
    if (filters.clienteId && ms[0]) addClientSummary(ms[0].clienteNome);

    if (ms.length === 0) {
      return {
        sections: [{ title: "Ficha dos clientes", rows: [], empty: "Nenhum cliente encontrado." }],
        filtersSummary: summary(),
      };
    }

    const munIds = ms.map((m) => m.id);
    const [bs, cs, allPends] = await Promise.all([
      db.select().from(bases).where(inArray(bases.municipioId, munIds)),
      db.select().from(contratos).where(inArray(contratos.municipioId, munIds)),
      db.select().from(pendencias).where(and(inArray(pendencias.municipioId, munIds), eq(pendencias.situacao, "aberta"))),
    ]);

    const baseIds = bs.map((b) => b.id);
    const mods = baseIds.length ? await db.select().from(baseModules).where(inArray(baseModules.baseId, baseIds)) : [];
    const pends = allPends.filter((p) => isOperationalPendingType(p.tipo));

    const sections: ReportSection[] = ms
      .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"))
      .map((cliente) => {
        const clienteBases = bs.filter((base) => base.municipioId === cliente.id);
        const cBaseIds = new Set(clienteBases.map((base) => base.id));
        const clienteMods = mods.filter((modulo) => cBaseIds.has(modulo.baseId));
        const clienteContratos = cs.filter((contrato) => contrato.municipioId === cliente.id);
        const clientePendencias = pends.filter((pendencia) => pendencia.municipioId === cliente.id);
        return {
          title: cliente.clienteNome,
          headers: ["Campo", "Valor"],
          rows: [
            ["Municipio/UF", `${cliente.municipio} - ${cliente.uf}`],
            ["Situacao", optLabel(cliente.situacao)],
            ["Codigo IBGE", cliente.codigoIbge],
            ["Populacao", cliente.populacao],
            ["Bases", clienteBases.length],
            ["Modulos", clienteMods.length],
            ["Contratos", clienteContratos.length],
            ["Pendencias abertas", clientePendencias.length],
            ["Dados administrativos", cliente.dadosAdministrativos],
            ["Observacoes", cliente.observacoes],
          ].map((row) => row.map(text)),
        };
      });

    return { sections, filtersSummary: summary() };
  }

  // -------------------------------------------------------------------------
  // 3. Mapa de Implantação
  // -------------------------------------------------------------------------
  if (tipo === "mapa-implantacao") {
    let bs: (typeof bases.$inferSelect)[] = [];
    let ms: (typeof municipios.$inferSelect)[] = [];

    if (filters.clienteId) {
      ms = await db.select().from(municipios).where(eq(municipios.id, filters.clienteId));
      if (ms[0]) addClientSummary(ms[0].clienteNome);
      bs = await db.select().from(bases).where(eq(bases.municipioId, filters.clienteId));
    }

    const modConds = [];
    if (filters.clienteId) {
      const baseIds = bs.map((b) => b.id);
      if (baseIds.length === 0) {
        return {
          sections: [{ title: "Modulos por cliente e base", rows: [], empty: "Nenhum módulo encontrado para este cliente.", headers: ["Cliente", "Base", "Modulo", "Status", "Habilitado", "Execucao"] }],
          filtersSummary: summary(),
        };
      }
      modConds.push(inArray(baseModules.baseId, baseIds));
    }
    if (filters.modulo) {
      modConds.push(eq(baseModules.nome, filters.modulo));
    }
    if (filters.dataInicio) {
      modConds.push(gte(baseModules.habilitadoAt, filters.dataInicio));
    }
    if (filters.dataFim) {
      modConds.push(lte(baseModules.habilitadoAt, filters.dataFim));
    }

    const mods = await db.select().from(baseModules).where(modConds.length ? and(...modConds) : undefined);

    if (mods.length === 0) {
      return {
        sections: [{ title: "Modulos por cliente e base", rows: [], empty: "Nenhum modulo cadastrado.", headers: ["Cliente", "Base", "Modulo", "Status", "Habilitado", "Execucao"] }],
        filtersSummary: summary(),
      };
    }

    if (!filters.clienteId) {
      const baseIds = Array.from(new Set(mods.map((m) => m.baseId)));
      bs = baseIds.length ? await db.select().from(bases).where(inArray(bases.id, baseIds)) : [];
      const munIds = Array.from(new Set(bs.map((b) => b.municipioId)));
      ms = munIds.length ? await db.select().from(municipios).where(inArray(municipios.id, munIds)) : [];
    }

    const modIds = mods.map((m) => m.id);
    const cms = modIds.length ? await db.select().from(contratoModulos).where(inArray(contratoModulos.baseModuleId, modIds)) : [];
    const conSet = contratadoSet(cms);

    const baseById = new Map(bs.map((b) => [b.id, b]));
    const munById = new Map(ms.map((m) => [m.id, m]));

    const rows = mods.map((modulo) => {
      const base = baseById.get(modulo.baseId);
      const cliente = base ? munById.get(base.municipioId) : undefined;
      const state = moduloState(modulo, conSet.has(modulo.id));
      return [
        cliente?.clienteNome,
        base?.nome,
        modulo.nome,
        state.label,
        formatDate(modulo.habilitadoAt),
        formatDate(modulo.execucaoInicio),
      ].map(text);
    });

    return {
      sections: [{
        title: "Modulos por cliente e base",
        headers: ["Cliente", "Base", "Modulo", "Status", "Habilitado", "Execucao"],
        empty: "Nenhum modulo cadastrado.",
        rows,
      }],
      filtersSummary: summary(),
    };
  }

  // -------------------------------------------------------------------------
  // 4. Cobertura dos Contratos
  // -------------------------------------------------------------------------
  if (tipo === "contratos-cobertura") {
    const cConds = [];
    if (filters.clienteId) cConds.push(eq(contratos.municipioId, filters.clienteId));
    if (filters.modalidadeContrato) cConds.push(eq(contratos.modalidade, filters.modalidadeContrato));
    if (filters.situacaoContrato) cConds.push(eq(contratos.situacao, filters.situacaoContrato));
    if (filters.dataInicio) cConds.push(gte(contratos.dataInicio, filters.dataInicio));
    if (filters.dataFim) cConds.push(lte(contratos.dataFim, filters.dataFim));

    const cs = await db.select().from(contratos).where(cConds.length ? and(...cConds) : undefined);

    if (cs.length === 0) {
      if (filters.clienteId) {
        const mun = await db.select().from(municipios).where(eq(municipios.id, filters.clienteId));
        if (mun[0]) addClientSummary(mun[0].clienteNome);
      }
      return {
        sections: [{ title: "Cobertura dos contratos", rows: [], empty: "Nenhum contrato cadastrado.", headers: ["Contrato", "Cliente", "Modalidade", "Processo", "Base", "Modulo"] }],
        filtersSummary: summary(),
      };
    }

    const contratoIds = cs.map((c) => c.id);
    const munIds = Array.from(new Set(cs.map((c) => c.municipioId)));

    const [ms, cms] = await Promise.all([
      db.select().from(municipios).where(inArray(municipios.id, munIds)),
      db.select().from(contratoModulos).where(inArray(contratoModulos.contratoId, contratoIds)),
    ]);

    if (filters.clienteId && ms[0]) addClientSummary(ms[0].clienteNome);

    const moduleIds = Array.from(new Set(cms.map((cm) => cm.baseModuleId)));
    const mods = moduleIds.length ? await db.select().from(baseModules).where(inArray(baseModules.id, moduleIds)) : [];
    const baseIds = Array.from(new Set(mods.map((m) => m.baseId)));
    const bs = baseIds.length ? await db.select().from(bases).where(inArray(bases.id, baseIds)) : [];

    const munById = new Map(ms.map((m) => [m.id, m]));
    const modById = new Map(mods.map((m) => [m.id, m]));
    const baseById = new Map(bs.map((b) => [b.id, b]));

    const rows = cs.flatMap((contrato) => {
      const links = cms.filter((cm) => cm.contratoId === contrato.id);
      if (links.length === 0) {
        return [[contrato.numero, munById.get(contrato.municipioId)?.clienteNome, optLabel(contrato.modalidade), contrato.processo, null, null].map(text)];
      }
      return links.map((link) => {
        const modulo = modById.get(link.baseModuleId);
        const base = modulo ? baseById.get(modulo.baseId) : undefined;
        return [contrato.numero, munById.get(contrato.municipioId)?.clienteNome, optLabel(contrato.modalidade), contrato.processo, base?.nome, modulo?.nome].map(text);
      });
    });

    return {
      sections: [{
        title: "Cobertura dos contratos",
        headers: ["Contrato", "Cliente", "Modalidade", "Processo", "Base", "Modulo"],
        empty: "Nenhum contrato cadastrado.",
        rows,
      }],
      filtersSummary: summary(),
    };
  }

  // -------------------------------------------------------------------------
  // 5. Pendências por Cliente
  // -------------------------------------------------------------------------
  if (tipo === "pendencias-clientes") {
    const pConds = [];
    if (filters.clienteId) pConds.push(eq(pendencias.municipioId, filters.clienteId));
    if (filters.situacaoPendencia && filters.situacaoPendencia !== "todas") {
      pConds.push(eq(pendencias.situacao, filters.situacaoPendencia));
    }
    if (filters.tipoPendencia) {
      pConds.push(eq(pendencias.tipo, filters.tipoPendencia));
    }
    if (filters.dataInicio) {
      pConds.push(gte(pendencias.createdAt, new Date(filters.dataInicio)));
    }
    if (filters.dataFim) {
      pConds.push(lte(pendencias.createdAt, new Date(`${filters.dataFim}T23:59:59`)));
    }

    const rawPends = await db.select().from(pendencias).where(pConds.length ? and(...pConds) : undefined);
    const pends = rawPends.filter((p) => isOperationalPendingType(p.tipo));

    if (filters.clienteId) {
      const mun = await db.select().from(municipios).where(eq(municipios.id, filters.clienteId));
      if (mun[0]) addClientSummary(mun[0].clienteNome);
    }

    if (pends.length === 0) {
      return {
        sections: [{ title: "Pendencias", rows: [], empty: "Nenhuma pendencia cadastrada.", headers: ["Cliente", "Tipo", "Situacao", "Contexto", "Criada", "Resolvida"] }],
        filtersSummary: summary(),
      };
    }

    const munIds = Array.from(new Set(pends.map((p) => p.municipioId).filter(Boolean))) as string[];
    const baseIds = Array.from(new Set(pends.map((p) => p.baseId).filter(Boolean))) as string[];
    const modIds = Array.from(new Set(pends.map((p) => p.baseModuleId).filter(Boolean))) as string[];
    const contratoIds = Array.from(new Set(pends.map((p) => p.contratoId).filter(Boolean))) as string[];

    const [ms, bs, mods, cs] = await Promise.all([
      munIds.length ? db.select().from(municipios).where(inArray(municipios.id, munIds)) : [],
      baseIds.length ? db.select().from(bases).where(inArray(bases.id, baseIds)) : [],
      modIds.length ? db.select().from(baseModules).where(inArray(baseModules.id, modIds)) : [],
      contratoIds.length ? db.select().from(contratos).where(inArray(contratos.id, contratoIds)) : [],
    ]);

    const munById = new Map(ms.map((m) => [m.id, m]));
    const baseById = new Map(bs.map((b) => [b.id, b]));
    const modById = new Map(mods.map((m) => [m.id, m]));
    const contratoById = new Map(cs.map((c) => [c.id, c]));

    const rows = pends.map((pendencia) => {
      const modulo = pendencia.baseModuleId ? modById.get(pendencia.baseModuleId) : undefined;
      const base = pendencia.baseId ? baseById.get(pendencia.baseId) : modulo ? baseById.get(modulo.baseId) : undefined;
      const cliente = pendencia.municipioId ? munById.get(pendencia.municipioId) : base ? munById.get(base.municipioId) : undefined;
      const contrato = pendencia.contratoId ? contratoById.get(pendencia.contratoId) : undefined;
      return [
        cliente?.clienteNome,
        PENDENCIA_TIPOS[pendencia.tipo]?.label ?? pendencia.tipo,
        pendencia.situacao,
        [base?.nome, modulo?.nome, contrato ? `Contrato ${contrato.numero}` : null].filter(Boolean).join(" / "),
        formatDateTime(pendencia.createdAt),
        pendencia.resolvedAt ? formatDateTime(pendencia.resolvedAt) : "-",
      ].map(text);
    });

    return {
      sections: [{
        title: "Pendencias",
        headers: ["Cliente", "Tipo", "Situacao", "Contexto", "Criada", "Resolvida"],
        empty: "Nenhuma pendencia cadastrada.",
        rows,
      }],
      filtersSummary: summary(),
    };
  }

  // -------------------------------------------------------------------------
  // 6. Módulos Habilitados Sem Contrato
  // -------------------------------------------------------------------------
  if (tipo === "modulos-sem-contrato") {
    let bs: (typeof bases.$inferSelect)[] = [];
    if (filters.clienteId) {
      bs = await db.select().from(bases).where(eq(bases.municipioId, filters.clienteId));
      const mun = await db.select().from(municipios).where(eq(municipios.id, filters.clienteId));
      if (mun[0]) addClientSummary(mun[0].clienteNome);
      if (bs.length === 0) {
        return {
          sections: [{ title: "Modulos habilitados sem contrato", headers: ["Cliente", "Base", "Modulo", "Habilitado em"], empty: "Nenhum modulo habilitado sem contrato.", rows: [] }],
          filtersSummary: summary(),
        };
      }
    }

    const modConds = [
      isNotNull(baseModules.habilitadoAt),
      isNull(baseModules.desabilitadoAt),
    ];
    if (filters.clienteId) {
      modConds.push(inArray(baseModules.baseId, bs.map((b) => b.id)));
    }
    if (filters.modulo) {
      modConds.push(eq(baseModules.nome, filters.modulo));
    }

    const mods = await db.select().from(baseModules).where(and(...modConds));
    if (mods.length === 0) {
      return {
        sections: [{ title: "Modulos habilitados sem contrato", headers: ["Cliente", "Base", "Modulo", "Habilitado em"], empty: "Nenhum modulo habilitado sem contrato.", rows: [] }],
        filtersSummary: summary(),
      };
    }

    const modIds = mods.map((m) => m.id);
    const cms = await db.select().from(contratoModulos).where(inArray(contratoModulos.baseModuleId, modIds));
    const conSet = contratadoSet(cms);

    const modsSemContrato = mods.filter((m) => !conSet.has(m.id));
    if (modsSemContrato.length === 0) {
      return {
        sections: [{ title: "Modulos habilitados sem contrato", headers: ["Cliente", "Base", "Modulo", "Habilitado em"], empty: "Nenhum modulo habilitado sem contrato.", rows: [] }],
        filtersSummary: summary(),
      };
    }

    const neededBaseIds = Array.from(new Set(modsSemContrato.map((m) => m.baseId)));
    const neededBases = await db.select().from(bases).where(inArray(bases.id, neededBaseIds));
    const neededMunIds = Array.from(new Set(neededBases.map((b) => b.municipioId)));
    const ms = await db.select().from(municipios).where(inArray(municipios.id, neededMunIds));

    const baseById = new Map(neededBases.map((b) => [b.id, b]));
    const munById = new Map(ms.map((m) => [m.id, m]));

    const rows = modsSemContrato.map((modulo) => {
      const base = baseById.get(modulo.baseId);
      const cliente = base ? munById.get(base.municipioId) : undefined;
      return [cliente?.clienteNome, base?.nome, modulo.nome, formatDate(modulo.habilitadoAt)].map(text);
    });

    return {
      sections: [{ title: "Modulos habilitados sem contrato", headers: ["Cliente", "Base", "Modulo", "Habilitado em"], empty: "Nenhum modulo habilitado sem contrato.", rows }],
      filtersSummary: summary(),
    };
  }

  // -------------------------------------------------------------------------
  // 7. Módulos Contratados Não Habilitados
  // -------------------------------------------------------------------------
  if (tipo === "modulos-nao-habilitados") {
    let cms: (typeof contratoModulos.$inferSelect)[] = [];
    if (filters.clienteId) {
      const mun = await db.select().from(municipios).where(eq(municipios.id, filters.clienteId));
      if (mun[0]) addClientSummary(mun[0].clienteNome);
      const cs = await db.select().from(contratos).where(eq(contratos.municipioId, filters.clienteId));
      const cIds = cs.map((c) => c.id);
      cms = cIds.length ? await db.select().from(contratoModulos).where(inArray(contratoModulos.contratoId, cIds)) : [];
    } else {
      cms = await db.select().from(contratoModulos);
    }

    const conSet = contratadoSet(cms);
    const modIds = Array.from(conSet);

    if (modIds.length === 0) {
      return {
        sections: [{ title: "Modulos contratados nao habilitados", headers: ["Cliente", "Base", "Modulo", "Status"], empty: "Nenhum modulo contratado pendente de habilitacao.", rows: [] }],
        filtersSummary: summary(),
      };
    }

    const modConds = [
      inArray(baseModules.id, modIds),
      isNull(baseModules.habilitadoAt),
      isNull(baseModules.desabilitadoAt),
    ];
    if (filters.modulo) {
      modConds.push(eq(baseModules.nome, filters.modulo));
    }

    const mods = await db.select().from(baseModules).where(and(...modConds));
    if (mods.length === 0) {
      return {
        sections: [{ title: "Modulos contratados nao habilitados", headers: ["Cliente", "Base", "Modulo", "Status"], empty: "Nenhum modulo contratado pendente de habilitacao.", rows: [] }],
        filtersSummary: summary(),
      };
    }

    const baseIds = Array.from(new Set(mods.map((m) => m.baseId)));
    const bs = await db.select().from(bases).where(inArray(bases.id, baseIds));
    const munIds = Array.from(new Set(bs.map((b) => b.municipioId)));
    const ms = await db.select().from(municipios).where(inArray(municipios.id, munIds));

    const baseById = new Map(bs.map((b) => [b.id, b]));
    const munById = new Map(ms.map((m) => [m.id, m]));

    const rows = mods.map((modulo) => {
      const base = baseById.get(modulo.baseId);
      const cliente = base ? munById.get(base.municipioId) : undefined;
      return [cliente?.clienteNome, base?.nome, modulo.nome, "Contratado"].map(text);
    });

    return {
      sections: [{ title: "Modulos contratados nao habilitados", headers: ["Cliente", "Base", "Modulo", "Status"], empty: "Nenhum modulo contratado pendente de habilitacao.", rows }],
      filtersSummary: summary(),
    };
  }

  // -------------------------------------------------------------------------
  // 8. Responsáveis por Módulo
  // -------------------------------------------------------------------------
  if (tipo === "responsaveis-modulos") {
    const rConds = [];
    if (filters.clienteId) {
      rConds.push(eq(moduloResponsaveis.municipioId, filters.clienteId));
      const mun = await db.select().from(municipios).where(eq(municipios.id, filters.clienteId));
      if (mun[0]) addClientSummary(mun[0].clienteNome);
    }

    if (filters.modulo) {
      const matchedMods = await db.select().from(baseModules).where(eq(baseModules.nome, filters.modulo));
      const matchedIds = matchedMods.map((m) => m.id);
      if (matchedIds.length === 0) {
        return {
          sections: [{ title: "Responsaveis", headers: ["Cliente", "Base", "Modulo", "Responsavel", "Email", "Celular"], empty: "Nenhum responsavel cadastrado.", rows: [] }],
          filtersSummary: summary(),
        };
      }
      rConds.push(inArray(moduloResponsaveis.baseModuleId, matchedIds));
    }

    const responsaveis = await db.select().from(moduloResponsaveis).where(rConds.length ? and(...rConds) : undefined);

    if (responsaveis.length === 0) {
      return {
        sections: [{ title: "Responsaveis", headers: ["Cliente", "Base", "Modulo", "Responsavel", "Email", "Celular"], empty: "Nenhum responsavel cadastrado.", rows: [] }],
        filtersSummary: summary(),
      };
    }

    const modIds = Array.from(new Set(responsaveis.map((r) => r.baseModuleId)));
    const munIds = Array.from(new Set(responsaveis.map((r) => r.municipioId)));

    const [mods, ms] = await Promise.all([
      db.select().from(baseModules).where(inArray(baseModules.id, modIds)),
      db.select().from(municipios).where(inArray(municipios.id, munIds)),
    ]);

    const baseIds = Array.from(new Set(mods.map((m) => m.baseId)));
    const bs = baseIds.length ? await db.select().from(bases).where(inArray(bases.id, baseIds)) : [];

    const modById = new Map(mods.map((m) => [m.id, m]));
    const baseById = new Map(bs.map((b) => [b.id, b]));
    const munById = new Map(ms.map((m) => [m.id, m]));

    const rows = responsaveis.map((responsavel) => {
      const modulo = modById.get(responsavel.baseModuleId);
      const base = modulo ? baseById.get(modulo.baseId) : undefined;
      const cliente = munById.get(responsavel.municipioId) ?? (base ? munById.get(base.municipioId) : undefined);
      return [
        cliente?.clienteNome,
        base?.nome,
        modulo?.nome,
        responsavel.nome,
        responsavel.email,
        responsavel.celular,
      ].map(text);
    });

    return {
      sections: [{
        title: "Responsaveis",
        headers: ["Cliente", "Base", "Modulo", "Responsavel", "Email", "Celular"],
        empty: "Nenhum responsavel cadastrado.",
        rows,
      }],
      filtersSummary: summary(),
    };
  }

  // -------------------------------------------------------------------------
  // 9. Bases Incompletas
  // -------------------------------------------------------------------------
  if (tipo === "bases-incompletas") {
    const bConds = [
      eq(bases.situacao, "ativa"),
      or(isNull(bases.cnpj), eq(bases.cnpj, "")),
    ];
    if (filters.clienteId) {
      bConds.push(eq(bases.municipioId, filters.clienteId));
      const mun = await db.select().from(municipios).where(eq(municipios.id, filters.clienteId));
      if (mun[0]) addClientSummary(mun[0].clienteNome);
    }
    if (filters.tipoBase) {
      bConds.push(eq(bases.tipo, filters.tipoBase));
    }

    const bs = await db.select().from(bases).where(and(...bConds));
    if (bs.length === 0) {
      return {
        sections: [{ title: "Bases incompletas", headers: ["Cliente", "Base", "Tipo", "Pendencia"], empty: "Nenhuma base incompleta encontrada.", rows: [] }],
        filtersSummary: summary(),
      };
    }

    const munIds = Array.from(new Set(bs.map((b) => b.municipioId)));
    const ms = await db.select().from(municipios).where(inArray(municipios.id, munIds));
    const munById = new Map(ms.map((m) => [m.id, m]));

    const rows = bs.map((base) => [
      munById.get(base.municipioId)?.clienteNome,
      base.nome,
      base.tipo,
      "CNPJ ausente",
    ].map(text));

    return {
      sections: [{ title: "Bases incompletas", headers: ["Cliente", "Base", "Tipo", "Pendencia"], empty: "Nenhuma base incompleta encontrada.", rows }],
      filtersSummary: summary(),
    };
  }

  // -------------------------------------------------------------------------
  // 10. Histórico dos Clientes
  // -------------------------------------------------------------------------
  if (tipo === "historico-clientes") {
    const eConds = [];
    if (filters.clienteId) {
      eConds.push(eq(eventos.municipioId, filters.clienteId));
      const mun = await db.select().from(municipios).where(eq(municipios.id, filters.clienteId));
      if (mun[0]) addClientSummary(mun[0].clienteNome);
    }
    if (filters.tipoEvento) {
      eConds.push(eq(eventos.tipo, filters.tipoEvento));
    }
    if (filters.dataInicio) {
      eConds.push(gte(eventos.data, filters.dataInicio));
    }
    if (filters.dataFim) {
      eConds.push(lte(eventos.data, filters.dataFim));
    }

    const rawEvts = await db.select().from(eventos).where(eConds.length ? and(...eConds) : undefined);
    const evts = rawEvts.filter(isOperationalEvent);

    if (evts.length === 0) {
      return {
        sections: [{ title: "Eventos", headers: ["Data", "Cliente", "Evento", "Contexto", "Usuario", "Descricao"], empty: "Nenhum evento registrado.", rows: [] }],
        filtersSummary: summary(),
      };
    }

    const munIds = Array.from(new Set(evts.map((e) => e.municipioId).filter(Boolean))) as string[];
    const baseIds = Array.from(new Set(evts.map((e) => e.baseId).filter(Boolean))) as string[];
    const modIds = Array.from(new Set(evts.map((e) => e.baseModuleId).filter(Boolean))) as string[];
    const cIds = Array.from(new Set(evts.map((e) => e.contratoId).filter(Boolean))) as string[];

    const [ms, bs, mods, cs] = await Promise.all([
      munIds.length ? db.select().from(municipios).where(inArray(municipios.id, munIds)) : [],
      baseIds.length ? db.select().from(bases).where(inArray(bases.id, baseIds)) : [],
      modIds.length ? db.select().from(baseModules).where(inArray(baseModules.id, modIds)) : [],
      cIds.length ? db.select().from(contratos).where(inArray(contratos.id, cIds)) : [],
    ]);

    const munById = new Map(ms.map((m) => [m.id, m]));
    const baseById = new Map(bs.map((b) => [b.id, b]));
    const modById = new Map(mods.map((m) => [m.id, m]));
    const contratoById = new Map(cs.map((c) => [c.id, c]));

    const rows = evts
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      .map((evento) => {
        const modulo = evento.baseModuleId ? modById.get(evento.baseModuleId) : undefined;
        const base = evento.baseId ? baseById.get(evento.baseId) : modulo ? baseById.get(modulo.baseId) : undefined;
        const cliente = evento.municipioId ? munById.get(evento.municipioId) : base ? munById.get(base.municipioId) : undefined;
        const contrato = evento.contratoId ? contratoById.get(evento.contratoId) : undefined;
        return [
          formatDate(evento.data),
          cliente?.clienteNome,
          EVENTO_TIPOS[evento.tipo] ?? evento.tipo,
          [base?.nome, modulo?.nome, contrato ? `Contrato ${contrato.numero}` : null].filter(Boolean).join(" / "),
          evento.usuario,
          evento.descricao,
        ].map(text);
      });

    return {
      sections: [{
        title: "Eventos",
        headers: ["Data", "Cliente", "Evento", "Contexto", "Usuario", "Descricao"],
        empty: "Nenhum evento registrado.",
        rows,
      }],
      filtersSummary: summary(),
    };
  }

  // -------------------------------------------------------------------------
  // 11. Oportunidades Comerciais
  // -------------------------------------------------------------------------
  if (tipo === "oportunidades-comerciais") {
    const munConds = [];
    if (filters.clienteId) munConds.push(eq(municipios.id, filters.clienteId));
    if (filters.situacaoCliente) munConds.push(eq(municipios.situacao, filters.situacaoCliente));

    const ms = await db.select().from(municipios).where(munConds.length ? and(...munConds) : undefined);
    if (filters.clienteId && ms[0]) addClientSummary(ms[0].clienteNome);

    if (ms.length === 0) {
      return {
        sections: [{ title: "Oportunidades", headers: ["Cliente", "Municipio/UF", "Modulos sugeridos"], empty: "Nenhuma oportunidade identificada.", rows: [] }],
        filtersSummary: summary(),
      };
    }

    const munIds = ms.map((m) => m.id);
    const bs = await db.select().from(bases).where(inArray(bases.municipioId, munIds));
    const baseIds = bs.map((b) => b.id);
    const mods = baseIds.length ? await db.select().from(baseModules).where(inArray(baseModules.baseId, baseIds)) : [];

    let oportunidades = computeOportunidades(ms, bs, mods);
    if (filters.modulo) {
      oportunidades = oportunidades.filter((op) => op.missing.includes(filters.modulo!));
    }

    const rows = oportunidades.map((oportunidade) => [
      oportunidade.municipio.clienteNome,
      `${oportunidade.municipio.municipio} - ${oportunidade.municipio.uf}`,
      oportunidade.missing.join(", "),
    ]);

    return {
      sections: [{
        title: "Oportunidades",
        headers: ["Cliente", "Municipio/UF", "Modulos sugeridos"],
        empty: "Nenhuma oportunidade identificada.",
        rows,
      }],
      filtersSummary: summary(),
    };
  }

  // -------------------------------------------------------------------------
  // 12. Documentos por Cliente
  // -------------------------------------------------------------------------
  if (tipo === "documentos-clientes") {
    const dConds = [];
    if (filters.clienteId) {
      dConds.push(eq(documentos.municipioId, filters.clienteId));
      const mun = await db.select().from(municipios).where(eq(municipios.id, filters.clienteId));
      if (mun[0]) addClientSummary(mun[0].clienteNome);
    }
    if (filters.tipoDocumento) {
      dConds.push(eq(documentos.tipo, filters.tipoDocumento));
    }
    if (filters.dataInicio) {
      dConds.push(gte(documentos.createdAt, new Date(filters.dataInicio)));
    }
    if (filters.dataFim) {
      dConds.push(lte(documentos.createdAt, new Date(`${filters.dataFim}T23:59:59`)));
    }

    const docs = await db.select().from(documentos).where(dConds.length ? and(...dConds) : undefined);

    if (docs.length === 0) {
      return {
        sections: [{ title: "Documentos", headers: ["Cliente", "Tipo", "Nome", "Contexto", "Criado em"], empty: "Nenhum documento cadastrado.", rows: [] }],
        filtersSummary: summary(),
      };
    }

    // Filtrar propostas excluídas se algum doc for de proposta
    const propIds = Array.from(new Set(docs.map((d) => d.propostaId).filter(Boolean))) as string[];
    const props = propIds.length
      ? await db.select().from(propostas).where(and(inArray(propostas.id, propIds), isNull(propostas.excluidaAt)))
      : [];
    const propostaById = new Map(props.map((p) => [p.id, p]));

    const visibleDocs = docs.filter((documento) => !documento.propostaId || propostaById.has(documento.propostaId));

    if (visibleDocs.length === 0) {
      return {
        sections: [{ title: "Documentos", headers: ["Cliente", "Tipo", "Nome", "Contexto", "Criado em"], empty: "Nenhum documento cadastrado.", rows: [] }],
        filtersSummary: summary(),
      };
    }

    const munIds = Array.from(new Set(visibleDocs.map((d) => d.municipioId).filter(Boolean))) as string[];
    const baseIds = Array.from(new Set(visibleDocs.map((d) => d.baseId).filter(Boolean))) as string[];
    const modIds = Array.from(new Set(visibleDocs.map((d) => d.baseModuleId).filter(Boolean))) as string[];
    const cIds = Array.from(new Set(visibleDocs.map((d) => d.contratoId).filter(Boolean))) as string[];
    const adtIds = Array.from(new Set(visibleDocs.map((d) => d.aditivoId).filter(Boolean))) as string[];

    const [ms, bs, mods, cs, adts] = await Promise.all([
      munIds.length ? db.select().from(municipios).where(inArray(municipios.id, munIds)) : [],
      baseIds.length ? db.select().from(bases).where(inArray(bases.id, baseIds)) : [],
      modIds.length ? db.select().from(baseModules).where(inArray(baseModules.id, modIds)) : [],
      cIds.length ? db.select().from(contratos).where(inArray(contratos.id, cIds)) : [],
      adtIds.length ? db.select().from(aditivos).where(inArray(aditivos.id, adtIds)) : [],
    ]);

    const munById = new Map(ms.map((m) => [m.id, m]));
    const baseById = new Map(bs.map((b) => [b.id, b]));
    const modById = new Map(mods.map((m) => [m.id, m]));
    const contratoById = new Map(cs.map((c) => [c.id, c]));
    const aditivoById = new Map(adts.map((a) => [a.id, a]));

    const rows = visibleDocs.map((documento) => {
      const modulo = documento.baseModuleId ? modById.get(documento.baseModuleId) : undefined;
      const base = documento.baseId ? baseById.get(documento.baseId) : modulo ? baseById.get(modulo.baseId) : undefined;
      const cliente = documento.municipioId ? munById.get(documento.municipioId) : base ? munById.get(base.municipioId) : undefined;
      const contrato = documento.contratoId ? contratoById.get(documento.contratoId) : undefined;
      const proposta = documento.propostaId ? propostaById.get(documento.propostaId) : undefined;
      const aditivo = documento.aditivoId ? aditivoById.get(documento.aditivoId) : undefined;
      return [
        cliente?.clienteNome,
        optLabel(documento.tipo),
        documento.nome,
        [
          base?.nome,
          modulo?.nome,
          contrato ? `Contrato ${contrato.numero}` : null,
          proposta ? `Proposta ${optLabel(proposta.tipo)}` : null,
          aditivo ? `Aditivo ${optLabel(aditivo.tipo)}` : null,
        ].filter(Boolean).join(" / "),
        formatDateTime(documento.createdAt),
      ].map(text);
    });

    return {
      sections: [{
        title: "Documentos",
        headers: ["Cliente", "Tipo", "Nome", "Contexto", "Criado em"],
        empty: "Nenhum documento cadastrado.",
        rows,
      }],
      filtersSummary: summary(),
    };
  }

  return { sections: [], filtersSummary: summary() };
}
