import {
  EVENTO_TIPOS,
  PENDENCIA_TIPOS,
  optLabel,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { ReportFilters } from "./types";

export function buildFiltersSummary(
  filters: ReportFilters = {},
  clienteNome?: string,
): string[] {
  const summary: string[] = [];

  if (clienteNome) {
    summary.push(`Cliente: ${clienteNome}`);
  }
  if (filters.situacaoCliente) {
    summary.push(`Situação: ${optLabel(filters.situacaoCliente)}`);
  }
  if (filters.modulo) {
    summary.push(`Módulo: ${filters.modulo}`);
  }
  if (filters.modalidadeContrato) {
    summary.push(`Modalidade: ${filters.modalidadeContrato}`);
  }
  if (filters.situacaoContrato) {
    summary.push(`Situação Contrato: ${optLabel(filters.situacaoContrato)}`);
  }
  if (filters.situacaoPendencia && filters.situacaoPendencia !== "todas") {
    summary.push(`Pendências: ${filters.situacaoPendencia === "aberta" ? "Abertas" : "Resolvidas"}`);
  }
  if (filters.tipoPendencia) {
    summary.push(`Tipo Pendência: ${PENDENCIA_TIPOS[filters.tipoPendencia]?.label ?? filters.tipoPendencia}`);
  }
  if (filters.tipoEvento) {
    summary.push(`Tipo Evento: ${EVENTO_TIPOS[filters.tipoEvento] ?? filters.tipoEvento}`);
  }
  if (filters.tipoDocumento) {
    summary.push(`Tipo Doc: ${filters.tipoDocumento}`);
  }
  if (filters.tipoBase) {
    summary.push(`Tipo Base: ${filters.tipoBase}`);
  }
  if (filters.dataInicio || filters.dataFim) {
    const inicio = filters.dataInicio ? formatDate(filters.dataInicio) : "Início";
    const fim = filters.dataFim ? formatDate(filters.dataFim) : "Atual";
    summary.push(`Período: ${inicio} a ${fim}`);
  }

  return summary;
}
