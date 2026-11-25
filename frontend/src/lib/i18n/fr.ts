export const fr = {
  common: {
    appName: 'enveloppe',
    protocol: 'jmap',
    loading: 'Chargement...',
    cancel: 'Annuler',
    save: 'Enregistrer',
    delete: 'Supprimer',
    edit: 'Modifier',
    close: 'Fermer',
    refresh: 'Actualiser',
    search: 'Rechercher',
    language: 'Langue'
  },
  nav: {
    sidebarLabel: 'Navigation principale',
    mail: 'Messagerie',
    contacts: 'Contacts',
    calendar: 'Agenda',
    sieve: 'Filtres Sieve',
    security: 'Sécurité',
    logout: 'Déconnexion',
    themeBowiz: 'Thème BoWiz',
    themeDark: 'Thème Sombre',
    themeLight: 'Thème Clair'
  },
  mail: {
    compose: 'Nouveau message',
    inbox: 'Boîte de réception',
    sent: 'Envoyés',
    drafts: 'Brouillons',
    trash: 'Corbeille',
    junk: 'Indésirables',
    archive: 'Archives',
    blockedImages: 'Images externes bloquées',
    showImages: 'Afficher les images',
    attachments: 'Pièces jointes',
    noSelection: 'Sélectionnez un message pour le lire.'
  },
  calendar: {
    title: 'Agenda',
    newEvent: 'Nouvel événement',
    deleteEvent: 'Supprimer l’événement',
    cancelError: 'Échec de l’envoi de l’annulation (.ics).'
  }
};

export type TranslationDictionary = {
  [K in keyof typeof fr]: {
    [P in keyof (typeof fr)[K]]: string;
  };
};
