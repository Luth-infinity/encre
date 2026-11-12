/**
 * Le journal des versions, écrit à la main. Les notes des releases GitHub
 * étaient vides ou techniques : la page n'affichait que des numéros. Ici,
 * chaque version dit ce qui change pour la personne qui utilise Encre.
 *
 * À compléter à chaque publication (voir « Publier une version » dans le
 * CLAUDE.md du dépôt). Une version absente d'ici reste lisible sur GitHub.
 */

export type Entree = {
  version: string;
  /** AAAA-MM-JJ. */
  date: string;
  titre: string;
  /** Une ou deux phrases : pourquoi ça compte. */
  texte: string;
  points: string[];
  /** Les versions marquantes s'affichent en grand. */
  majeure?: boolean;
};

export const JOURNAL: Entree[] = [
  {
    version: '0.5.3',
    date: '2026-11-12',
    titre: 'Jetons partagés par les sujets',
    texte: 'Un jeton ajouté depuis un sujet restait sur le sujet et Claude ne le recevait jamais. Jetons et comptes Figma vivent maintenant sur le projet, visibles et utilisés depuis tous ses sujets.',
    points: [
      'La page Outils d’un sujet montre les jetons de son projet.',
      'Les jetons et comptes Figma déjà rangés sur un sujet remontent sur le projet au démarrage.'
    ]
  },
  {
    version: '0.5.2',
    date: '2026-11-12',
    titre: 'Un logo à Encre',
    texte: 'Encre a maintenant son propre logo : un carré violet avec un tentacule et ses ventouses. Tako reste le personnage du chat.',
    points: [
      'Nouvelle icône dans le Dock et sur le site.',
      'Le logo remplace la photo de Tako en haut du panneau.'
    ]
  },
  {
    version: '0.5.1',
    date: '2026-11-12',
    titre: 'Une petite bulle pour chaque réponse',
    texte: 'Répondre à un passage ne passe plus par le champ du bas : une petite bulle s’ouvre près du passage, tu écris ta réponse et tu l’ajoutes. Le champ reste libre pour le reste.',
    points: [
      '« Répondre » ouvre une bulle d’écriture juste au-dessus du passage choisi.',
      '« Ajouter » pose ta réponse au-dessus du champ, comme une image jointe. Un clic pour la corriger, ✕ pour la retirer.',
      'Le champ du bas sert à ce qui ne répond à rien de précis, et tout part dans le même message.'
    ]
  },
  {
    version: '0.5.0',
    date: '2026-11-12',
    titre: 'Réponds à plusieurs passages d’un coup',
    texte: 'Quand Tako pose plusieurs questions, tu peux maintenant répondre à chacune dans le même message : tu sélectionnes la première, tu réponds, tu sélectionnes la suivante, et tout part ensemble.',
    points: [
      'Chaque « Répondre » s’ajoute aux précédents au lieu de les remplacer.',
      'Ta réponse reste rangée sous son passage, au-dessus de la saisie, avant l’envoi.',
      'Dans le fil, chaque passage s’affiche suivi de ta réponse.'
    ]
  },
  {
    version: '0.4.9',
    date: '2026-11-12',
    titre: 'La fenêtre de connexion s’ouvre enfin',
    texte: 'En 0.4.8, « Connecter » ne faisait rien : une apostrophe dans un message empêchait la fenêtre de démarrer. C’est réparé, Notion et les autres se connectent pour de vrai.',
    points: [
      'Le bouton « Connecter » de la page Outils ouvre bien sa fenêtre.',
      'Quand tu demandes à Tako de connecter un outil, la fenêtre s’ouvre aussi.'
    ]
  },
  {
    version: '0.4.8',
    date: '2026-11-12',
    titre: 'Tes outils, connectés en un clic',
    texte: 'Notion, Linear, Sentry et les autres se branchent maintenant depuis Encre : un bouton « Connecter », et c’est fait. Tako peut aussi le proposer lui-même au lieu de t’envoyer dans un terminal.',
    points: [
      'Page Outils : chaque outil que Claude Code connaît pour le projet, avec son état (connecté, à connecter) et un bouton « Connecter ».',
      'Ajouter un outil : Notion, Linear, Jira et Confluence, Sentry, Vercel, Stripe, Canva, ou n’importe quel autre par son adresse.',
      'Tako sait connecter un outil quand tu le lui demandes.',
      'Figma et les jetons sont rangés sur la même page.'
    ]
  },
  {
    version: '0.4.7',
    date: '2026-11-10',
    titre: 'Des sujets, des réponses mises en forme',
    texte: 'Un projet se range maintenant en sujets, un par ticket ou par chantier : chacun a sa conversation, et Tako ne relit plus tout le reste à chaque action. Ça consomme beaucoup moins. Les réponses, elles, arrivent enfin mises en forme.',
    majeure: true,
    points: [
      'Sujets : une rangée sous le nom du projet, « ＋ Sujet » pour en ouvrir un. Même dossier, mêmes outils, conversation à part. Tako en ouvre un tout seul quand tu passes à autre chose.',
      'Une longue conversation est rangée d’elle-même : Tako écrit ses notes et repart léger. Un bouton « Ranger » le fait à la demande.',
      'Réponses mises en forme : titres, listes de cases à cocher, tableaux, citations, code à copier, et les images s’affichent dans le fil.',
      'Nouvelle police, Bricolage Grotesque, au choix dans les réglages.',
      'Plein écran : le bord en biais en haut à droite a disparu.'
    ]
  },
  {
    version: '0.4.6',
    date: '2026-11-09',
    titre: 'Des voix bien rangées',
    texte: 'Avec ElevenLabs, l’onglet Voix affichait des dizaines de voix d’un coup. Elles sont maintenant rangées par famille, et la tienne reste en haut.',
    points: [
      'La voix choisie en haut, avec le bouton Tester.',
      'Une famille à la fois : tes voix, ElevenLabs, Gemini, Microsoft.',
      'Recherche et filtre Femmes ou Hommes, six voix visibles puis « Voir les autres ».'
    ]
  },
  {
    version: '0.4.5',
    date: '2026-11-09',
    titre: 'Une voix par avatar',
    texte: 'Tako, Nori et Momo n’ont plus la même voix : chacun garde la sienne, et la voix suit l’avatar du compte connecté.',
    points: [
      'Choix de la voix pour chaque avatar, dans Réglages → Voix.',
      'Deux qualités ElevenLabs : Rapide (réponse quasi immédiate) ou Naturel (plus expressif).',
      'Les nombres sont écrits en toutes lettres sans tirets : « vingt-six » n’est plus lu de travers.'
    ]
  },
  {
    version: '0.4.4',
    date: '2026-11-09',
    titre: 'Il parle vraiment français',
    texte: 'Les voix lisaient « 14:30 » ou « 3e » comme un robot. Tako dit maintenant les chiffres comme toi.',
    points: [
      'Heures, dates, nombres, ordinaux et unités dits à la française (« quatorze heures trente », « troisième »).',
      'Sigles épelés à la française, abréviations développées, accords au féminin.'
    ]
  },
  {
    version: '0.4.3',
    date: '2026-11-09',
    titre: 'Une voix plus douce',
    texte: 'Certaines voix arrivaient trop fort. Le son est maintenant égalisé.',
    points: ['Un compresseur léger sur toutes les voix, y compris l’essai dans les réglages.']
  },
  {
    version: '0.4.2',
    date: '2026-11-09',
    titre: 'Moins d’attente avant la voix',
    texte: 'Les phrases sont préparées en même temps au lieu de l’une après l’autre : la réponse dite suit le texte de près.',
    points: ['Synthèse ElevenLabs en parallèle, rendue dans l’ordre.']
  },
  {
    version: '0.4.1',
    date: '2026-11-09',
    titre: 'Les voix ElevenLabs',
    texte: 'Colle ta clé ElevenLabs : les voix de ton compte (ajoutées, créées, clonées) deviennent celles de Tako.',
    majeure: true,
    points: [
      'Clé vérifiée, voix du compte listées en tête des réglages.',
      'Modèle rapide pour une latence basse, en français.',
      'Crédits épuisés : Tako répond par écrit, jamais avec une voix de rechange.',
      'Le réveil au mot « Tako » est coupé par défaut : il se déclenchait dès qu’on prononçait son nom.'
    ]
  },
  {
    version: '0.4.0',
    date: '2026-11-09',
    titre: 'Tako prend des notes, l’interface respire',
    texte: 'Un projet laissé de côté ne coûte plus cher à reprendre : Tako résume où vous en êtes, puis repart d’une page blanche avec ses notes.',
    majeure: true,
    points: [
      'Nouvelle humeur « notes » : un carnet, un crayon, des lignes d’encre qui s’écrivent.',
      'En-tête réduit à trois boutons (＋, ⋯, ✕) ; plein écran, outils et réglages dans le menu ⋯.',
      'Réglages en trois onglets : Général, Voix, Comptes.'
    ]
  },
  {
    version: '0.3.9',
    date: '2026-11-09',
    titre: 'Économie de tokens',
    texte: 'Une conversation reprise toute la journée finissait par relire des centaines de milliers de tokens à chaque action. Encre surveille maintenant ce que coûte chaque tour.',
    majeure: true,
    points: [
      'Sous chaque réponse : la taille du fil que Claude relit, et le coût estimé du tour.',
      'Un long fil encore en cache garde son modèle (changer de modèle repaierait tout l’historique).',
      'Après 45 minutes sans message, Claude écrit ses notes de reprise et la session suivante part de là.'
    ]
  },
  {
    version: '0.3.8',
    date: '2026-11-09',
    titre: 'Un tri des modèles plus juste',
    texte: 'Un simple « je teste » au milieu d’un gros chantier partait sur Opus. Le tri juge désormais la demande elle-même.',
    points: ['Douze demandes types : douze bons tris sur douze.']
  },
  {
    version: '0.3.7',
    date: '2026-11-09',
    titre: 'Le bon modèle pour chaque demande',
    texte: 'En mode Auto, une question simple part sur Sonnet et un vrai problème sur Opus, sans que tu aies à choisir.',
    majeure: true,
    points: [
      'Réglages → Modèle : Auto, Sonnet, Opus, ou le réglage de Claude Code.',
      'Les suites (« vas-y », « continue ») gardent le modèle d’avant ; pièces jointes et longs messages vont à Opus.',
      'Le reste est tranché en un mot par Haiku, pendant que Claude Code démarre.',
      'Le modèle qui a répondu s’affiche sous la réponse : « Fait en 6 s · Opus ».'
    ]
  },
  {
    version: '0.3.6',
    date: '2026-11-09',
    titre: 'Nori et Momo arrivent',
    texte: 'Chaque compte Claude a son avatar : Tako le poulpe, Nori la méduse ou Momo l’axolotl. Créature, couleurs, nom et ton changent avec lui.',
    majeure: true,
    points: [
      'Choix dans Réglages → Comptes, à droite de chaque compte.',
      'Mêmes humeurs et mêmes gestes pour les trois ; le ton de la réponse suit l’avatar.'
    ]
  },
  {
    version: '0.3.5',
    date: '2026-11-09',
    titre: 'Des réponses toutes prêtes',
    texte: 'Sous chaque réponse, trois choses que tu pourrais lui dire ensuite. Un clic, c’est envoyé.',
    points: ['Proposées par Claude dans la même réponse : aucun appel en plus.']
  },
  {
    version: '0.3.4',
    date: '2026-11-09',
    titre: 'Connecter un autre compte, vraiment',
    texte: 'Le navigateur restait sur le compte de tous les jours. La connexion d’un nouveau compte s’ouvre maintenant dans une fenêtre vierge.',
    points: ['Le code de connexion est lu tout seul, plus de console ni de copier-coller.']
  },
  {
    version: '0.3.3',
    date: '2026-11-08',
    titre: 'Mettre à jour en un clic',
    texte: 'Les mises à jour attendaient qu’on quitte Encre, ce que personne ne fait. Un bouton les installe tout de suite.',
    points: ['Dans les réglages et le menu de l’icône près de l’horloge. Encre se ferme et se rouvre seul.']
  },
  {
    version: '0.3.2',
    date: '2026-11-08',
    titre: 'Plusieurs projets en même temps',
    texte: 'Lance un travail, passe à un autre projet, lances-en un deuxième : rien ne s’arrête. Un point coloré te dit qui travaille et qui attend ton accord.',
    majeure: true,
    points: [
      'Un Claude Code par projet, en parallèle.',
      'Au survol des jauges : ce qui reste, l’heure de remise à zéro, et si ton rythme tiendra.',
      'Plusieurs comptes Claude, on passe de l’un à l’autre sans perdre les conversations.'
    ]
  },
  {
    version: '0.3.1',
    date: '2026-11-07',
    titre: 'Des liens cliquables',
    texte: 'En mode voix, Tako épelait les adresses. Il les donne maintenant en liens, et la voix ne lit que leur nom.',
    points: ['Une adresse écrite seule devient cliquable dans le fil.']
  },
  {
    version: '0.3.0',
    date: '2026-11-07',
    titre: 'Écrire pendant qu’il travaille',
    texte: 'Une idée en route ? Envoie-la sans tout arrêter : Tako la prend entre deux étapes, comme un collègue.',
    majeure: true,
    points: [
      'Répondre à un passage : sélectionne un bout de réponse, clique « Répondre ».',
      'Les jauges des 5 heures et de la semaine sous la saisie.',
      'Première version macOS, et ce site.'
    ]
  },
  {
    version: '0.2.9',
    date: '2026-11-07',
    titre: 'Des voix gratuites et illimitées',
    texte: 'Les voix Microsoft restent proposées même avec une clé Gemini, pour ne jamais tomber à court.',
    points: []
  },
  {
    version: '0.2.4',
    date: '2026-11-06',
    titre: 'Une vraie voix pour Tako',
    texte: 'Avec une clé Google gratuite, Tako parle avec une voix naturelle. Depuis la 0.2.7, on peut même la décrire pour créer la sienne.',
    points: ['Bouton « Tester la voix », création d’une voix sur mesure, respect du quota gratuit.']
  },
  {
    version: '0.2.2',
    date: '2026-11-06',
    titre: 'L’encre qui s’étale',
    texte: 'Le panneau s’ouvre comme une tache d’encre qui part de la bulle. La bulle rebondit, éclabousse, et Tako saute de joie quand c’est fini.',
    points: []
  },
  {
    version: '0.2.0',
    date: '2026-11-06',
    titre: 'Tako a un nom',
    texte: 'Le poulpe vit sa vie au repos : il regarde ailleurs, s’étire, fait coucou. Et le mode Parler arrive : Alt+Maj+E de n’importe où.',
    majeure: true,
    points: [
      'Libre : un brouillon pour les questions rapides, qui crée un projet dès qu’il y a du travail.',
      'Fil gardé, commandes « / », pièces jointes, outils par projet (Figma, jetons).',
      'Installeur Windows, démarrage avec Windows, mises à jour automatiques.'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-11-06',
    titre: 'La première bulle',
    texte: 'Un poulpe qui flotte sur le bureau. Un clic, et c’est Claude Code qui travaille dans ton projet, en te demandant avant chaque action.',
    majeure: true,
    points: ['Projets, hub, carte d’autorisation avec le diff, trois modes (Demander, Modifs auto, Auto).']
  }
];

/** « 9 novembre 2026 ». */
export function dateLisible(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
