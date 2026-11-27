import { describe, expect, it } from 'vitest';
import {
  countThreadAttachments,
  filterTasksByStatus,
  pickReplyTargetId,
  toggleTaskProgressValue
} from '../threadHelpers';

describe('threadHelpers — fils de discussion et tâches', () => {
  it('cible le dernier message non lu du fil et cumule les pièces jointes', () => {
    const msgs = [
      { id: 'm1', isUnread: true, attachmentCount: 1 },
      { id: 'm2', isUnread: true, attachmentCount: 2 },
      { id: 'm3', isUnread: false, attachmentCount: 0 }
    ];
    expect(pickReplyTargetId(msgs, 'm0')).toBe('m2');
    expect(countThreadAttachments(msgs)).toBe(3);
  });

  it('bascule l’état d’avancement d’une tâche et filtre par statut', () => {
    expect(toggleTaskProgressValue('needs-action')).toBe('completed');
    expect(toggleTaskProgressValue('completed')).toBe('needs-action');

    const tasks = [
      { id: 't1', progress: 'needs-action', title: 'Sauvegarde' },
      { id: 't2', progress: 'completed', title: 'Tag v0.8.8' }
    ];
    expect(filterTasksByStatus(tasks, 'todo')).toHaveLength(1);
    expect(filterTasksByStatus(tasks, 'completed')).toHaveLength(1);
    expect(filterTasksByStatus(tasks, 'all')).toHaveLength(2);
  });
});
