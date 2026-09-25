import { describe, expect, it } from 'vitest';
import {
  alignIdsToCatalog,
  buildNiboNameMap,
  lookupNiboName,
  niboFallbackLabel,
  niboIdList,
  niboNameMap,
  niboOptions,
  readNiboSelectedAccountIds,
} from './nibo-integration-form';

describe('nibo-integration-form', () => {
  const uuid = 'baf4f408-cd3d-4ccb-838f-ffd6f0567df4';

  it('lê listas e mapas de nomes do configuration', () => {
    expect(niboIdList({ receivableCategoryIds: ['a', 'b'] }, 'receivableCategoryIds', 'receivableCategoryId')).toEqual([
      'a',
      'b',
    ]);
    expect(niboIdList({ receivableCategoryId: 'x' }, 'receivableCategoryIds', 'receivableCategoryId')).toEqual(['x']);
    expect(niboNameMap({ receivableCategoryNames: { [uuid]: 'Receitas clínicas' } }, 'receivableCategoryNames')).toEqual({
      [uuid]: 'Receitas clínicas',
    });
    expect(niboNameMap({ receivableCategoryNames: { [uuid]: uuid } }, 'receivableCategoryNames')).toEqual({});
  });

  it('nunca usa UUID cru como label quando falta catálogo/nome', () => {
    expect(niboFallbackLabel(uuid)).toBe('Seleção salva (catálogo indisponível)');
    expect(lookupNiboName(uuid, [], {})).toBe('Seleção salva (catálogo indisponível)');
  });

  it('prioriza catálogo, depois nome salvo (case-insensitive)', () => {
    expect(
      lookupNiboName(uuid.toUpperCase(), [{ id: uuid, name: 'Receitas' }], {}),
    ).toBe('Receitas');
    expect(
      lookupNiboName(uuid, [], { [uuid.toUpperCase()]: 'Salvo' }),
    ).toBe('Salvo');
  });

  it('niboOptions usa nome salvo quando catálogo não carrega', () => {
    const options = niboOptions([], [uuid], { [uuid]: 'Centro Odontologia' });
    expect(options).toEqual([{ value: uuid, label: 'Centro Odontologia' }]);
  });

  it('buildNiboNameMap persiste nome do catálogo e reusa o salvo', () => {
    expect(
      buildNiboNameMap([uuid], [{ id: uuid, name: 'Aluguel' }], {}),
    ).toEqual({ [uuid]: 'Aluguel' });
    expect(
      buildNiboNameMap([uuid], [], { [uuid]: 'Aluguel' }),
    ).toEqual({ [uuid]: 'Aluguel' });
    // Sem catálogo nem nome anterior: não grava o fallback como "nome".
    expect(buildNiboNameMap([uuid], [], {})).toEqual({});
  });

  it('alignIdsToCatalog normaliza casing', () => {
    expect(alignIdsToCatalog([uuid.toUpperCase()], [{ id: uuid, name: 'X' }])).toEqual([uuid]);
  });

  it('readNiboSelectedAccountIds: vazio, uma, várias e legado singular', () => {
    expect(readNiboSelectedAccountIds(undefined)).toEqual([]);
    expect(readNiboSelectedAccountIds({})).toEqual([]);
    expect(readNiboSelectedAccountIds({ accountIds: ['a'] })).toEqual(['a']);
    expect(readNiboSelectedAccountIds({ accountIds: ['a', 'b', 'c'] })).toEqual(['a', 'b', 'c']);
    expect(readNiboSelectedAccountIds({ accountId: 'legado' })).toEqual(['legado']);
    expect(readNiboSelectedAccountIds({ niboAccountId: 'nibo-only' })).toEqual(['nibo-only']);
    expect(readNiboSelectedAccountIds({ niboAccountIds: ['n1', 'n2'] })).toEqual(['n1', 'n2']);
    expect(readNiboSelectedAccountIds({ defaultAccountId: 'def' })).toEqual(['def']);
    // Lista accountIds tem prioridade sobre singular legado.
    expect(readNiboSelectedAccountIds({ accountIds: ['a', 'b'], accountId: 'legado' })).toEqual(['a', 'b']);
  });
});
