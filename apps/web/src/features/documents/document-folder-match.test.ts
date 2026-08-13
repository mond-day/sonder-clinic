import { describe, expect, it } from 'vitest';
import {
  canonicalFolderName,
  countItemsInFolder,
  isProfilePhoto,
  itemMatchesFolder,
} from './document-folder-match';
import type { DocumentFolder, LibraryItem } from './document-types';

function item(partial: Partial<LibraryItem> & Pick<LibraryItem, 'id' | 'name' | 'type' | 'source'>): LibraryItem {
  return {
    status: 'SIGNED',
    date: '2026-08-13',
    folderId: 'clinical',
    folderName: 'Documentos clínicos',
    ...partial,
  };
}

const atestados: DocumentFolder = { id: 'atestados', name: 'Atestados' };
const clinical: DocumentFolder = { id: 'clinical', name: 'Documentos clínicos' };
const receitas: DocumentFolder = { id: 'receitas', name: 'Receitas' };

describe('document-folder-match', () => {
  it('não trata foto de perfil como arquivo da biblioteca', () => {
    expect(isProfilePhoto({ type: 'PROFILE_PHOTO' })).toBe(true);
    expect(isProfilePhoto({ type: 'PHOTO' })).toBe(false);
  });

  it('coloca atestado legado CERTIFICATE e nome Atestado odontológico em Atestados', () => {
    const certificate = item({
      id: '1',
      source: 'generated',
      name: 'Atestado odontológico',
      type: 'CERTIFICATE',
      folderId: 'clinical',
    });
    const attestation = item({
      id: '2',
      source: 'generated',
      name: 'Atestado',
      type: 'ATTESTATION',
      folderId: 'atestados',
    });
    const other = item({
      id: '3',
      source: 'generated',
      name: 'Termo de consentimento',
      type: 'CONSENT',
      folderId: 'clinical',
    });

    expect(canonicalFolderName(certificate)).toBe('Atestados');
    expect(itemMatchesFolder(certificate, atestados)).toBe(true);
    expect(itemMatchesFolder(certificate, clinical)).toBe(false);
    expect(itemMatchesFolder(attestation, atestados)).toBe(true);
    expect(itemMatchesFolder(other, atestados)).toBe(false);

    const docs = [certificate, attestation, other, item({
      id: '4',
      source: 'generated',
      name: 'Receita simples',
      type: 'PRESCRIPTION',
      folderId: 'receitas',
    })];
    expect(docs).toHaveLength(4);
    expect(countItemsInFolder(docs, atestados)).toBe(2);
    expect(countItemsInFolder(docs, receitas)).toBe(1);
  });
});
