'use client';

import { dateOnly, presentationLabel, statusTone, text } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';
import type { DocumentFolder, LibraryItem, SelectedLibraryRef } from './document-types';
import { typeIcon } from './document-types';

export function DocumentLibrary({
  folders,
  items,
  selected,
  folderId,
  onSelectFolder,
  onSelectItem,
  onCreateFolder,
  canManageFolders,
}: {
  folders: DocumentFolder[];
  items: LibraryItem[];
  selected: SelectedLibraryRef;
  folderId: string | 'all';
  onSelectFolder: (id: string | 'all') => void;
  onSelectItem: (item: LibraryItem) => void;
  onCreateFolder: () => void;
  canManageFolders: boolean;
}) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.folderId) counts.set(item.folderId, (counts.get(item.folderId) ?? 0) + 1);
  }

  return (
    <div className="document-library">
      <div className="document-folders">
        <button
          type="button"
          className={`folder ${folderId === 'all' ? 'active' : ''}`}
          onClick={() => onSelectFolder('all')}
        >
          <span>▦</span>
          <span>Todos</span>
          <span>{items.length}</span>
        </button>
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className={`folder ${folderId === folder.id ? 'active' : ''}`}
            onClick={() => onSelectFolder(folder.id)}
          >
            <span>▱</span>
            <span>{text(folder.name)}</span>
            <span>{counts.get(folder.id) ?? 0}</span>
          </button>
        ))}
        {canManageFolders ? (
          <button type="button" className="button soft small folder-create" onClick={onCreateFolder}>
            ＋ Pasta
          </button>
        ) : null}
      </div>

      <div className="document-list">
        {items.length === 0 ? (
          <EmptyState title="Nenhum arquivo encontrado" description="Ajuste os filtros ou gere um novo documento." />
        ) : (
          items.map((item) => {
            const active = selected?.id === item.id && selected.source === item.source;
            return (
              <button
                key={`${item.source}:${item.id}`}
                type="button"
                className={`doc-row ${active ? 'active' : ''}`}
                onClick={() => onSelectItem(item)}
              >
                <div className="doc-row-head">
                  <span className="doc-type-icon">{typeIcon(item.type, item.source)}</span>
                  <strong>{text(item.name)}</strong>
                  <StatusBadge tone={statusTone(item.status)}>{presentationLabel(item.status)}</StatusBadge>
                </div>
                <p>
                  {dateOnly(item.date)}
                  {item.folderName ? ` · ${item.folderName}` : ''}
                  {item.antivirusStatus ? ` · AV ${presentationLabel(item.antivirusStatus)}` : ''}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
