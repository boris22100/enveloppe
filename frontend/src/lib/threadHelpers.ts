export interface ThreadMessageMeta {
  id: string;
  isUnread?: boolean;
  attachmentCount?: number;
}

export function pickReplyTargetId(messages: ThreadMessageMeta[], fallbackId = ''): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.isUnread) {
      return messages[i].id;
    }
  }
  return messages[messages.length - 1]?.id ?? fallbackId;
}

export function countThreadAttachments(messages: ThreadMessageMeta[]): number {
  return messages.reduce((sum, m) => sum + Math.max(0, m.attachmentCount ?? 0), 0);
}

export interface TaskLike {
  id: string;
  progress?: string;
  title?: string;
}

export function toggleTaskProgressValue(current?: string): 'completed' | 'needs-action' {
  return current === 'completed' ? 'needs-action' : 'completed';
}

export function filterTasksByStatus<T extends TaskLike>(
  tasks: T[],
  filter: 'all' | 'todo' | 'completed'
): T[] {
  if (filter === 'all') return tasks;
  if (filter === 'completed') return tasks.filter((t) => t.progress === 'completed');
  return tasks.filter((t) => t.progress !== 'completed');
}
