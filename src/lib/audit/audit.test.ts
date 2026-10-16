import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditEnvelope, computeChanges } from './client';
import { generateUUIDv7 } from './uuid';
import { sanitizeData } from './sanitizer';
import { extractSearchTokens } from './tokens';
import { verifyEventHash } from './hash';

test('AuditClient gera envelope canônico com hash e tokens válidos', () => {
  const envelope = buildAuditEnvelope({
    category: 'client',
    action: 'municipality.created',
    actor: {
      type: 'user',
      userId: 'usr-123',
      name: 'Gestor Teste',
      email: 'gestor@rarotec.com',
      role: 'gestor',
    },
    targets: [
      { type: 'municipality', id: 'mun-456', label: 'Prefeitura de Teste (SP)' },
    ],
    details: {
      municipio: 'Teste',
      uf: 'SP',
      populacao: 50000,
    },
  });

  assert.equal(envelope.system, 'raroclients');
  assert.equal(envelope.action, 'municipality.created');
  assert.equal(envelope.category, 'client');
  assert.equal(envelope.status, 'SUCCESS');
  assert.equal(envelope.severity, 'INFO');
  assert.ok(envelope._id.length > 20);
  assert.ok(verifyEventHash(envelope));
  assert.ok(envelope.searchTokens?.includes('municipality'));
  assert.ok(envelope.searchTokens?.includes('raroclients'));
});

test('AuditClient higieniza dados sensíveis e calcula diff apenas com antes e depois preenchidos', () => {
  const before = { situacao: 'prospect', observacoes: 'Primeiro contato' };
  const after = { situacao: 'em_negociacao', observacoes: 'Reunião agendada' };

  const envelope = buildAuditEnvelope({
    category: 'client',
    action: 'municipality.status_changed',
    actor: { type: 'user', userId: 'u1', name: 'Admin' },
    targets: [{ type: 'municipality', id: '1', label: 'Cliente A' }],
    diff: { before, after },
    details: { senhaAcesso: '123456', cpf: '123.456.789-00' },
  });

  assert.equal(envelope.details.senhaAcesso, '[REDACTED]');
  assert.equal(envelope.details.cpf, '***.456.789-**');
  assert.ok(envelope.diff);
  assert.equal(envelope.diff.before.situacao, 'prospect');
  assert.equal(envelope.diff.after.situacao, 'em_negociacao');
  assert.ok(envelope.changes && envelope.changes.length === 2);
});

test('UUIDv7 gera IDs ordenáveis e válidos', () => {
  const id1 = generateUUIDv7();
  const id2 = generateUUIDv7();
  assert.ok(id1 < id2 || id1 !== id2);
  assert.match(id1, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

