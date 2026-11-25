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
    language: 'Langue',
    import: 'Importer',
    export: 'Exporter',
    add: 'Ajouter',
    active: 'Actif'
  },
  nav: {
    sidebarLabel: 'Navigation principale',
    mail: 'Messagerie',
    contacts: 'Contacts',
    calendar: 'Agenda',
    sieve: 'Filtres Sieve',
    security: 'Sécurité',
    logout: 'Déconnexion',
    notifications: 'Notifications',
    storage: 'Stockage',
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
    noSelection: 'Sélectionnez un message pour le lire.',
    markAllRead: 'Tout marquer lu',
    searchPlaceholder: 'Rechercher (expéditeur, objet, texte)...',
    unread: 'Non lus',
    withAttachments: 'PJ',
    threads: 'Fils',
    reply: 'Répondre',
    replyAll: 'Tous',
    forward: 'Transférer'
  },
  calendar: {
    title: 'Agenda',
    today: "Aujourd'hui",
    month: 'Mois',
    week: 'Semaine',
    day: 'Jour',
    newEvent: 'Nouvel événement',
    newShort: '+ Nouveau',
    deleteEvent: "Supprimer l'événement",
    cancelError: "Échec de l'envoi de l'annulation (.ics)."
  },
  contacts: {
    title: 'Contacts',
    newContact: '+ Contact',
    searchPlaceholder: 'Filtrer par nom, mail, tél...',
    exportVcf: 'Export .vcf'
  },
  sieve: {
    title: 'Filtres serveur (Sieve)',
    subtitle: 'Éditeur visuel & code Sieve synchronisé avec Stalwart',
    scripts: 'Scripts Sieve',
    newScript: '+ Script',
    visualRules: 'Règles visuelles',
    sieveCode: 'Code Sieve',
    validateSyntax: 'Valider la syntaxe',
    saveToServer: 'Enregistrer sur Stalwart',
    rules: 'Règles de filtrage',
    addRule: '+ Ajouter une règle',
    allConditions: 'Si TOUTES les conditions sont vraies',
    anyConditions: 'Si AU MOINS UNE condition est vraie',
    conditions: 'CONDITIONS',
    addCondition: '+ Condition',
    actions: 'ACTIONS',
    addAction: '+ Action',
    moveToFolder: 'Déplacer vers le dossier',
    contains: 'contient',
    fromHeader: 'De (From)',
    subjectHeader: 'Objet (Subject)',
    vacation: 'Répondeur automatique (Absence du bureau)',
    vacationHint: 'Extension Sieve vacation',
    singleActiveNote: 'Un seul script Sieve peut être actif à la fois sur Stalwart. Les règles sont exécutées côté serveur dès réception d’un message.'
  },
  security: {
    title: 'Sécurité & Signatures'
  }
};

export type TranslationDictionary = {
  [K in keyof typeof fr]: {
    [P in keyof (typeof fr)[K]]: string;
  };
};
