import type { TranslationDictionary } from './fr';

export const en: TranslationDictionary = {
  common: {
    appName: 'enveloppe',
    protocol: 'jmap',
    loading: 'Loading...',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    refresh: 'Refresh',
    search: 'Search',
    language: 'Language'
  },
  nav: {
    sidebarLabel: 'Main navigation',
    mail: 'Mail',
    contacts: 'Contacts',
    calendar: 'Calendar',
    sieve: 'Sieve filters',
    security: 'Security',
    logout: 'Sign out',
    themeBowiz: 'BoWiz Theme',
    themeDark: 'Dark Theme',
    themeLight: 'Light Theme'
  },
  mail: {
    compose: 'New message',
    inbox: 'Inbox',
    sent: 'Sent',
    drafts: 'Drafts',
    trash: 'Trash',
    junk: 'Junk',
    archive: 'Archive',
    blockedImages: 'External images blocked',
    showImages: 'Show images',
    attachments: 'Attachments',
    noSelection: 'Select a message to read it.'
  },
  calendar: {
    title: 'Calendar',
    newEvent: 'New event',
    deleteEvent: 'Delete event',
    cancelError: 'Failed to send cancellation (.ics).'
  }
};
