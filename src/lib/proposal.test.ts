import assert from "node:assert/strict";
import test from "node:test";
import { assertPropostaTransition, assertProposalCancelAllowed, assertProposalDeletionAllowed, assertProposalEditAllowed, assertProposalIdentityUnchanged, assertUniqueProposalScope, canonicalProposalBaseType, canonicalProposalModuleName, formatProposalPopulation, hasProposalBaseType, hideProposalIds, parseProposalOriginNote, parseProposalPopulation, propostaHistoricoAcaoLabel, proposalClientsByIbge, requireProposalCancellationReason, selectProposalClientCandidate } from "./proposal";

test("aceita somente transições orientadas pelas ações da proposta", () => {
  assert.doesNotThrow(() => assertPropostaTransition("solicitada", "gerada"));
  assert.doesNotThrow(() => assertPropostaTransition("solicitada", "cancelada"));
  assert.doesNotThrow(() => assertPropostaTransition("gerada", "enviada"));
  assert.doesNotThrow(() => assertPropostaTransition("gerada", "em_retificacao"));
  assert.doesNotThrow(() => assertPropostaTransition("enviada", "em_retificacao"));
  assert.doesNotThrow(() => assertPropostaTransition("em_retificacao", "gerada"));
  assert.throws(() => assertPropostaTransition("solicitada", "aceita"), /inválida/);
  assert.throws(() => assertPropostaTransition("aceita", "gerada"), /inválida/);
  for (const status of ["gerada", "enviada", "aceita", "recusada", "em_retificacao", "cancelada"]) {
    assert.throws(() => assertPropostaTransition(status, "cancelada"), /inválida/);
  }
});

test("permite excluir somente proposta cancelada ainda não excluída", () => {
  assert.doesNotThrow(() => assertProposalDeletionAllowed("cancelada", null));
  assert.throws(() => assertProposalDeletionAllowed("solicitada", null), /Somente propostas canceladas/);
  assert.throws(() => assertProposalDeletionAllowed("cancelada", new Date()), /já foi excluída/);
});

test("exige motivo preenchido para cancelar a proposta", () => {
  assert.equal(requireProposalCancellationReason("  Mudança de prioridade  "), "Mudança de prioridade");
  assert.throws(() => requireProposalCancellationReason("   "), /motivo do cancelamento/);
  assert.throws(() => requireProposalCancellationReason(null), /motivo do cancelamento/);
});

test("traduz eventos do histórico e preserva eventos desconhecidos", () => {
  assert.equal(propostaHistoricoAcaoLabel("solicitada"), "Proposta solicitada");
  assert.equal(propostaHistoricoAcaoLabel("documento_gerado"), "Proposta gerada");
  assert.equal(propostaHistoricoAcaoLabel("falha_documento"), "Falha ao gerar proposta");
  assert.equal(propostaHistoricoAcaoLabel("enviada"), "Proposta enviada");
  assert.equal(propostaHistoricoAcaoLabel("envio_falhou"), "Falha no envio da proposta");
  assert.equal(propostaHistoricoAcaoLabel("aceita"), "Proposta aceita");
  assert.equal(propostaHistoricoAcaoLabel("recusada"), "Proposta recusada");
  assert.equal(propostaHistoricoAcaoLabel("em_retificacao"), "Proposta em retificação");
  assert.equal(propostaHistoricoAcaoLabel("editada"), "Proposta editada");
  assert.equal(propostaHistoricoAcaoLabel("enviada_manualmente"), "Proposta marcada como enviada manualmente");
  assert.equal(propostaHistoricoAcaoLabel("cadastros_criados"), "Cadastros da proposta criados");
  assert.equal(propostaHistoricoAcaoLabel("cadastros_criacao_falhou"), "Falha ao criar cadastros da proposta");
  assert.equal(propostaHistoricoAcaoLabel("cancelada"), "Proposta cancelada");
  assert.equal(propostaHistoricoAcaoLabel("excluida"), "Proposta excluída");
  assert.equal(propostaHistoricoAcaoLabel("evento_futuro"), "evento_futuro");
});

test("normaliza apenas módulos e tipos disponíveis no catálogo", () => {
  assert.equal(canonicalProposalModuleName("  contabilidade "), "Contabilidade");
  assert.equal(canonicalProposalModuleName("módulo inventado"), null);
  assert.equal(canonicalProposalBaseType(" saude "), "Saúde");
  assert.equal(canonicalProposalBaseType("tipo inventado"), null);
});

test("identifica duplicidade de base exclusivamente pelo tipo normalizado", () => {
  const bases = [{ tipo: "Saúde" }, { tipo: "Prefeitura" }];
  assert.equal(hasProposalBaseType(" saude ", bases), true);
  assert.equal(hasProposalBaseType("Saúde", [{ tipo: "Saúde" }]), true);
  assert.equal(hasProposalBaseType("Câmara", bases), false);
  assert.equal(hasProposalBaseType(null, bases), false);
});

test("localiza clientes cadastrados pelo código IBGE", () => {
  const clients = [
    { id: "carpina-1", codigoIbge: "2604007" },
    { id: "carpina-2", codigoIbge: "2604007" },
    { id: "recife", codigoIbge: "2611606" },
    { id: "sem-codigo", codigoIbge: null },
  ];
  assert.deepEqual(proposalClientsByIbge("2604007", clients).map((client) => client.id), ["carpina-1", "carpina-2"]);
  assert.deepEqual(proposalClientsByIbge("", clients), []);
});

test("rejeita bases e módulos duplicados no escopo", () => {
  assert.doesNotThrow(() => assertUniqueProposalScope([{ nome: "Prefeitura", modulos: [{ nome: "RH" }] }]));
  assert.throws(() => assertUniqueProposalScope([
    { nome: "Saúde", modulos: [{ nome: "RH" }] },
    { nome: "saude", modulos: [{ nome: "Portal" }] },
  ]), /mesma base/);
  assert.throws(() => assertUniqueProposalScope([{ nome: "Prefeitura", modulos: [{ nome: "RH" }, { nome: "rh" }] }]), /repetido/);
});

test("seleciona cliente único para a conversão e rejeita ambiguidades ou encerrados", () => {
  const active = { id: "ativo", situacao: "em_negociacao" };
  assert.equal(selectProposalClientCandidate([]), null);
  assert.equal(selectProposalClientCandidate([active]), active);
  assert.throws(() => selectProposalClientCandidate([active, { id: "outro", situacao: "prospect" }]), /mais de um cliente/);
  assert.throws(() => selectProposalClientCandidate([{ id: "encerrado", situacao: "cliente_encerrado" }]), /encerrado/);
});

test("preserva cliente e modalidade durante a edição", () => {
  const identity = {
    tipo: "implantacao_sistema",
    municipioId: "cliente-1",
    clienteNomeSnapshot: "Prefeitura de Carpina",
    municipioNome: "Carpina",
    uf: "PE",
    codigoIbge: "2604007",
  };
  assert.doesNotThrow(() => assertProposalIdentityUnchanged(identity, { ...identity }));
  assert.throws(() => assertProposalIdentityUnchanged(identity, { ...identity, municipioId: "cliente-2" }), /não podem ser alterados/);
  assert.throws(() => assertProposalIdentityUnchanged(identity, { ...identity, tipo: "consultoria" }), /não podem ser alterados/);
  assert.throws(() => assertProposalIdentityUnchanged(identity, { ...identity, municipioNome: "Recife" }), /não podem ser alterados/);
});

test("extrai a proposta da observação automática sem expor o identificador", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(parseProposalOriginNote(`Cliente criado automaticamente a partir da proposta aceita ${id}.`), {
    before: "Cliente criado automaticamente a partir da ",
    label: "proposta",
    after: " aceita.",
    proposalId: id,
  });
  assert.equal(parseProposalOriginNote("Observação preenchida manualmente."), null);
});

test("remove identificadores de proposta de descrições legadas", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(hideProposalIds(`Base Saúde criada a partir da proposta aceita ${id}.`), "Base Saúde criada a partir da proposta aceita.");
  assert.equal(hideProposalIds(`2 versões do documento da proposta ${id} vinculadas ao cliente.`), "2 versões do documento da proposta vinculadas ao cliente.");
  assert.equal(hideProposalIds("Evento sem proposta vinculada."), "Evento sem proposta vinculada.");
});

test("permite edição de proposta conforme o perfil e status", () => {
  // Autor pode editar enquanto solicitada
  assert.doesNotThrow(() => assertProposalEditAllowed("solicitada", false, true));
  // Autor não pode editar em outros status
  assert.throws(() => assertProposalEditAllowed("gerada", false, true), /status atual/);
  assert.throws(() => assertProposalEditAllowed("em_retificacao", false, true), /status atual/);
  assert.throws(() => assertProposalEditAllowed("enviada", false, true), /status atual/);
  assert.throws(() => assertProposalEditAllowed("aceita", false, true), /status atual/);

  // Usuário que não é autor não pode editar
  assert.throws(() => assertProposalEditAllowed("solicitada", false, false), /não autorizado/);

  // Gestor pode editar em solicitada e em_retificacao
  assert.doesNotThrow(() => assertProposalEditAllowed("solicitada", true, false));
  assert.doesNotThrow(() => assertProposalEditAllowed("em_retificacao", true, false));
  // Gestor não pode editar em gerada, enviada, aceita
  assert.throws(() => assertProposalEditAllowed("gerada", true, false), /status atual/);
  assert.throws(() => assertProposalEditAllowed("enviada", true, false), /status atual/);
  assert.throws(() => assertProposalEditAllowed("aceita", true, false), /status atual/);
});

test("permite cancelamento de proposta conforme o perfil e status", () => {
  // Autor pode cancelar em solicitada
  assert.doesNotThrow(() => assertProposalCancelAllowed("solicitada", false, true));
  // Gestor pode cancelar em solicitada
  assert.doesNotThrow(() => assertProposalCancelAllowed("solicitada", true, false));

  // Não autor não pode cancelar
  assert.throws(() => assertProposalCancelAllowed("solicitada", false, false), /não autorizado/);

  // Não pode cancelar em outros status
  assert.throws(() => assertProposalCancelAllowed("gerada", false, true), /status solicitada/);
  assert.throws(() => assertProposalCancelAllowed("gerada", true, false), /status solicitada/);
  assert.throws(() => assertProposalCancelAllowed("enviada", true, false), /status solicitada/);
});

test("valida e normaliza a população estimada da proposta", () => {
  assert.equal(parseProposalPopulation(null), null);
  assert.equal(parseProposalPopulation(undefined), null);
  assert.equal(parseProposalPopulation("   "), null);
  assert.equal(parseProposalPopulation("0"), 0);
  assert.equal(parseProposalPopulation(" 24151 "), 24151);
  assert.throws(() => parseProposalPopulation("-10"), /população estimada válida/);
  assert.throws(() => parseProposalPopulation("12.5"), /população estimada válida/);
  assert.throws(() => parseProposalPopulation("abc"), /população estimada válida/);
  assert.throws(() => parseProposalPopulation("999999999999"), /população estimada válida/);
});

test("formata a população estimada da proposta para exibição", () => {
  assert.equal(formatProposalPopulation(86241), `${(86241).toLocaleString("pt-BR")} hab.`);
  assert.equal(formatProposalPopulation(0), "0 hab.");
  assert.equal(formatProposalPopulation(null), "não informada");
  assert.equal(formatProposalPopulation(undefined), "não informada");
});
