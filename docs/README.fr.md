<div align="center">

<img src="../public/favicon.svg" width="72" height="72" alt="">

# FluxBio

**Un seul lien vers tout votre univers**

Pages bio et liens courts en open source, qui tournent entièrement sur votre propre compte Cloudflare. L’offre gratuite suffit.

<a href="../README.md"><kbd>&nbsp;English&nbsp;</kbd></a>
<a href="README.zh-TW.md"><kbd>&nbsp;繁體中文&nbsp;</kbd></a>
<a href="README.zh-CN.md"><kbd>&nbsp;简体中文&nbsp;</kbd></a>
<a href="README.ja.md"><kbd>&nbsp;日本語&nbsp;</kbd></a>
<a href="README.ko.md"><kbd>&nbsp;한국어&nbsp;</kbd></a>
<a href="README.es.md"><kbd>&nbsp;Español&nbsp;</kbd></a>
<a href="README.pt-BR.md"><kbd>&nbsp;Português&nbsp;</kbd></a>
<a href="README.fr.md"><kbd>&nbsp;<b>Français</b>&nbsp;</kbd></a>
<a href="README.de.md"><kbd>&nbsp;Deutsch&nbsp;</kbd></a>
<a href="README.id.md"><kbd>&nbsp;Bahasa Indonesia&nbsp;</kbd></a>
<a href="README.th.md"><kbd>&nbsp;ไทย&nbsp;</kbd></a>
<a href="README.vi.md"><kbd>&nbsp;Tiếng Việt&nbsp;</kbd></a>
<a href="README.ar.md"><kbd>&nbsp;العربية&nbsp;</kbd></a>

[Site de présentation](https://fluxbio.link) · [Installer le vôtre](#installer-le-vôtre) · [Guide pour les agents IA](../AGENTS.md)

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](../LICENSE)
[![Runs on Cloudflare Workers](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

</div>

<br>

**TL;DR**

- Des pages Link-in-bio et des liens courts avec statistiques de clics, dans un seul outil.
- Il tourne sur votre propre compte Cloudflare. L’offre gratuite suffit, et vos données restent les vôtres.
- [Collez un message dans votre IA](#installer-le-vôtre) et elle installe tout. Ensuite, modifiez dans le tableau de bord ou demandez simplement à votre IA.

<img src="https://fluxbio.link/fr/dash-links.webp" alt="Le tableau de bord FluxBio : modifier une page bio à côté de son aperçu en direct">

Créez des pages bio à votre image : choisissez un thème et ses couleurs, ou demandez à votre IA d’en créer un avec vos images, et ajoutez-y des vidéos, des produits et vos horaires d’ouverture. Chaque lien de la page a aussi son lien court, et vous voyez sur quoi on clique, et si les visites viennent d’IG, de Threads ou de LINE.

## Fonctionnalités

### Géré par votre IA

- Créez un jeton d’API dans Réglages et collez l’invite affichée à l’écran dans Claude Code, Codex ou Cursor. Ensuite, demandez-lui simplement de modifier des pages, de créer des liens courts, de consulter les statistiques ou de changer le domaine et le fuseau horaire.
- Chaque déploiement inclut un guide pour l’IA (`/llms.txt`, `/skill.md`) et la spécification de l’API (`/api/openapi.json`). Avant de publier, de supprimer ou de changer une adresse, l’IA vous prévient des risques, et elle vous fait aussi des suggestions.

### Pages bio

- Un seul déploiement gère plusieurs pages, chacune avec son adresse, son thème et ses statistiques.
- 24 thèmes, chacun avec sa mise en page et quelques jeux de couleurs : Néon, Panorama, Tuiles, Bonbon, Aéré, Aurore, Carte, Givre, Couchant, Ciel, Pop, Portrait, Volet, Rail, Bicolore, Relief, Bento, Points, Pastel, Lettre, Obsidienne, Lune, Pastilles et Pistes.
- Besoin de liens courts uniquement ? Désactivez les pages dans le tableau de bord : les pages publiques sont hors ligne, les liens courts continuent de marcher et rien n’est supprimé.
- Pas besoin d’une page de liens ? N’importe quelle page peut être votre propre HTML ou rediriger vers une autre adresse, et chacune peut servir de page d’accueil.
- Polices : les polices de chaque thème se chargent depuis Google Fonts sans consommer votre quota. Un interrupteur dans Apparence les sert depuis votre propre Worker, les visiteurs ne se connectent alors jamais à Google (utile si vous avez des visiteurs dans l’UE). Pour toute autre police Google Fonts, demandez à votre IA ; la FAQ dit ce qu’elles consomment.
- Votre propre thème : demandez à votre IA d’en créer un avec vos couleurs, vos polices, une image de couverture et un fond. Les [fichiers de thème](../themes/) partagés par d’autres, votre IA les applique aussi.
- Blocs de contenu : liens, titres, vidéos (YouTube ou Vimeo), carrousels de photos, fiches produit, horaires d’ouverture et carte.
- Les liens peuvent être mis en vedette, masqués ou programmés.
- Modèles : créateur, boutique, événement, indépendant ou association, pour démarrer en un clic.
- L’image d’aperçu affichée quand la page est partagée sur LINE ou Facebook est générée automatiquement d’après le thème. Elle est générée lors d’une publication depuis le tableau de bord ; votre IA peut aussi utiliser une capture de la page.
- Un bouton LINE peut rester en bas à droite, pour qu’on vous ajoute d’un seul geste.

### Liens courts

- Chaque lien de votre page bio devient un lien court à la publication, et vous pouvez aussi en créer à part. Pour en créer beaucoup d’un coup, avec des UTM par plateforme, demandez à votre IA. Les boutons de la page affichent l’adresse réelle ; un interrupteur leur fait utiliser le lien court, pour ce que vous préférez ne pas montrer, comme les liens d’affiliation.
- Les slugs acceptent les lettres de toutes les langues, accents, thaï et hindi compris.
- QR codes personnalisables : couleurs, forme des points, icône centrale et texte du cadre, à télécharger en PNG, SVG ou PDF.
- Date d’ouverture, date d’expiration, protection par mot de passe, UTM.
- Redirection intelligente : ouverture dans le navigateur externe depuis LINE, invitation à quitter le navigateur intégré d’IG et de FB, redirections distinctes pour iPhone et Android.

### Statistiques

- Vues, clics, taux de clic et sources : comptage exact (D1), par jour pendant 13 mois, puis par mois.
- Visiteurs uniques, régions, carte des visiteurs, opérateurs, appareils, navigateurs, langues, sites référents, UTM, heures des clics et activité récente : conservés 90 jours (Cloudflare Analytics Engine, sans configuration).
- Comparaison avec la période précédente, page de statistiques propre à chaque lien court, export CSV.
- Pas de cookies, pas d’adresse IP, pas de chaîne User-Agent complète, et une localisation limitée à la ville ; l’identifiant visiteur est un hachage à sens unique renouvelé chaque jour. Les robots ne sont pas comptés.

<table>
  <tr>
    <td width="50%"><img src="https://fluxbio.link/fr/dash-stats.webp" alt="Statistiques : vues, clics, taux de clic et visiteurs uniques sur 30 jours"></td>
    <td width="50%"><img src="https://fluxbio.link/fr/dash-qr.webp" alt="Créer un QR code pour un lien court"></td>
  </tr>
  <tr>
    <td align="center"><sub>Les statistiques, comparées à la période précédente</sub></td>
    <td align="center"><sub>Un QR code pour chaque lien court</sub></td>
  </tr>
</table>

### Langues et hébergement

- **13 langues** : le tableau de bord et les pages publiques existent en 繁體中文, 简体中文, English, 日本語, 한국어, Español, Português, Français, Deutsch, Bahasa Indonesia, ไทย, Tiếng Việt et العربية. Les pages publiques s’affichent dans la langue choisie, et vous pouvez en activer d’autres pour les visiteurs dont le navigateur les utilise. Votre IA peut aussi traduire vos propres textes dans ces langues.
- **Presque pas de JavaScript sur les pages publiques** : du HTML pur, servi directement depuis le réseau edge de Cloudflare, donc rapide. Un seul petit script compte les clics, et la page fonctionne sans lui. Vidéos et cartes ne se chargent que lorsque le visiteur appuie dessus.
- **Auto-hébergé** : uniquement Workers, D1, KV et Analytics Engine de Cloudflare, sans configuration manuelle ni autre service à souscrire (les polices viennent de Google Fonts par défaut, et c’est désactivable). Demandez à votre IA d’exporter puis d’importer tout le contenu pour faire une sauvegarde ou passer à un autre déploiement.
- **Plusieurs sites dans une seule installation** : deux domaines peuvent être deux sites indépendants dans le même FluxBio, par exemple vos pages sur l’un et un raccourcisseur de liens sur l’autre. Chacun a ses propres pages, liens courts et statistiques, et vous passez de l’un à l’autre depuis le menu en haut à gauche du tableau de bord. L’ajout d’un site se fait par votre IA : il n’est pas possible d’en ajouter un à la main depuis le tableau de bord.

## Installer le vôtre

Votre IA installe les outils dont elle a besoin. Pour essayer, il vous suffit de Claude Code ; pour mettre en ligne, il faut aussi un compte Cloudflare gratuit. Pour le faire vous-même, il faut Node.js 22.23+, 24.22+ ou 26.12+ et pnpm.

### Le plus simple : confiez-le à votre IA

Collez ceci dans votre IA. Nous recommandons [Claude Code](https://code.claude.com/docs/en/quickstart) sur votre propre ordinateur, mais Codex, OpenCode, Cursor et les autres outils capables d’exécuter des commandes avec un accès à Internet conviennent aussi :

```text
Suivez le fichier AGENTS.md de https://github.com/0t2/flux-bio pour m’aider à essayer FluxBio.
Utilisez le français (fr) comme langue de la page.
```

Elle vous propose d’abord une page d’exemple sur votre ordinateur, sans compte. Quand elle vous plaît, elle vous demande de vous connecter à Cloudflare, la met en ligne et se connecte. Vous décidez quand elle devient publique, et ensuite il suffit de dire ce qu’il faut changer. ChatGPT et Claude dans un navigateur ne peuvent pas le faire, car ils ne peuvent rien exécuter sur votre ordinateur.

> [!NOTE]
> En chemin, on vous demandera plusieurs autorisations : votre IA demande avant de lancer des commandes (télécharger le code, installer les paquets, déployer), Cloudflare vous fait approuver la connexion dans votre navigateur, et votre IA redemande avant d’enregistrer son jeton sur votre ordinateur. Vérifiez ce que fait chaque étape, puis autorisez-la.

### À la main

```sh
git clone https://github.com/0t2/flux-bio.git
cd flux-bio
pnpm install
pnpm exec cf auth login          # la première fois, connectez-vous à Cloudflare

# Générer le mot de passe du tableau de bord (ADMIN_PASSWORD, 12 caractères minimum), puis déployer
printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)" > .secrets.env
pnpm exec cf deploy --secrets-file .secrets.env
cat .secrets.env && rm .secrets.env   # notez bien le mot de passe
```

Une fois le déploiement terminé, ouvrez `https://<votre-site>/admin/` et connectez-vous avec le mot de passe. La configuration initiale vous guide pour créer votre première page. Connectez ensuite votre IA dans « Paramètres ». Après cela, pour le domaine, le fuseau horaire, les sauvegardes ou le changement de mot de passe, il suffit de lui demander. Le premier déploiement crée automatiquement la base de données D1 et l’espace KV.

## Savoir d’où viennent vos visiteurs

FluxBio enregistre d’où vient chaque visite, sans cookies. Dans « Statistiques », « Plateformes » indique combien de personnes ont ouvert votre page bio depuis chaque plateforme et combien de liens ont été cliqués ensuite, et « Campagnes UTM » détaille le tout selon les balises de vos liens.

### Reconnu automatiquement

- **Navigateurs intégrés aux applications :** Instagram, Threads, Facebook (Messenger compris), LINE, X, TikTok, WeChat, Weibo, KakaoTalk, NAVER, Zalo, Snapchat, Pinterest et LinkedIn.
- **Sites qui renvoient vers vous :** X (t.co), YouTube, Reddit, les moteurs de recherche comme Google, Bing, Yahoo et Baidu, et tout autre site, affiché par son domaine.
- Les **QR codes** créés dans FluxBio portent `?s=qr`.
- Les liens de votre page bio transmettent la source : un clic compte pour la plateforme d’où venait le visiteur.

### À baliser vous-même

Certains endroits n’indiquent pas d’où vient la visite, qui compte alors comme « Direct / autre » :

- WhatsApp, Telegram, Discord, iMessage et SMS
- e-mails, newsletters et PDF
- affiches, cartes de visite et autres imprimés (utilisez un QR code FluxBio)

Ajoutez `?s=` et un nom au lien que vous y partagez, par exemple `https://links.example.com/?s=whatsapp`, ou `https://links.example.com/talk?s=email` pour un lien court. Les abréviations `ig`, `fb`, `x`, `th`, `wa`, `tg`, `mail` et `qr` fonctionnent aussi. Une balise `?s=` l’emporte sur la détection automatique.

### Plusieurs endroits sur une même plateforme : `utm_content`

Le lien de votre bio Instagram, vos stories et vos publications comptent tous comme Instagram. Pour les comparer, donnez à chaque endroit sa propre adresse :

- dans votre bio Instagram : `https://links.example.com/?utm_content=bio`
- dans une story : `https://links.example.com/?utm_content=story`

Chacun a sa propre ligne dans « Campagnes UTM », avec les vues et les clics comptés séparément, et les visiteurs gardent la balise quand ils touchent un lien de votre page. Les liens courts acceptent aussi `utm_source`, `utm_medium`, `utm_campaign` et `utm_content` (« Liens courts » → « Réglages avancés »). Ils sont ajoutés à la destination : le site vers lequel vous pointez les voit donc aussi.

> [!TIP]
> Ou demandez simplement à votre IA : « Crée des liens de suivi pour ma bio Instagram, mes stories et mes publications. »

### Bon à savoir

- Vous voyez d’où viennent les visiteurs, pas qui ils sont. Instagram, Facebook et X n’indiquent jamais aux autres sites quel compte a touché un lien, et FluxBio n’enregistre rien qui permette d’identifier une personne.
- Les noms `?s=` acceptent les lettres sans accent, les chiffres, `-` et `_`, et sont mis en minuscules ; les autres caractères sont supprimés. Les balises UTM sont gardées telles quelles : `story` et `Story` comptent comme deux lignes, écrivez-les toujours de la même façon.
- La localisation est la ville estimée par Cloudflare à partir de l’adresse IP du visiteur. Un VPN, le Relais privé iCloud ou un réseau d’entreprise peuvent placer quelqu’un ailleurs.
- Les vues, les clics et les sources sont exacts. Chaque jour est gardé 13 mois, puis chaque mois devient un total conservé sans limite ; tout se télécharge depuis les Réglages. Les régions, la carte, les réseaux, les appareils, les langues et le détail UTM sont conservés 90 jours, et les nouvelles visites apparaissent au bout d’une minute environ. À vous de choisir si les icônes sociales comptent aussi. Les boutons qui affichent l’adresse réelle sont comptés par un petit script sur la page : un bloqueur peut masquer un clic ; les liens courts sont toujours comptés.
- Les visiteurs uniques sont comptés par jour : la même personne deux jours différents, ou sur son téléphone puis sur son ordinateur, compte deux fois.
- Les robots et les aperçus de liens (la requête que fait une messagerie quand on y colle un lien) ne sont pas comptés : les chiffres peuvent être plus bas qu’avec d’autres outils.
- Les balises UTM d’un lien court ne vont qu’à sa destination principale, pas aux adresses séparées pour iPhone ou Android, et ne remplacent jamais une balise déjà présente dans la destination. Les modifier ne compte que pour les clics suivants.
- Les applications sont reconnues à la façon dont leur navigateur intégré s’identifie. Si une application change cela, ses visites peuvent compter comme « Direct / autre » jusqu’à une mise à jour de FluxBio.

## Questions fréquentes

<details>
<summary><b>C’est payant ?</b></summary>

FluxBio est gratuit et open source. Il fonctionne sur votre propre compte Cloudflare, dont l’offre gratuite couvre de dix mille à plusieurs dizaines de milliers de vues de page par jour, selon les images de votre page, et plusieurs centaines de modifications. C’est généralement plus qu’il n’en faut aux particuliers et aux petites boutiques. Les abonnements à des IA comme Claude ou ChatGPT sont à part, et Claude Code demande un abonnement Claude payant.

</details>

<details>
<summary><b>Puis-je essayer sans compte Cloudflare ?</b></summary>

Oui. Votre IA crée une page d’exemple sur votre ordinateur, sans aucun compte. Son adresse ne s’ouvre que sur votre ordinateur : vous ne pouvez pas l’envoyer à un ami, et après un redémarrage, demandez à votre IA de la rouvrir, rien n’est perdu. Quand elle vous plaît, créez un compte Cloudflare gratuit pour la mettre en ligne, et ce que vous avez fait suit. Sinon, demandez à votre IA de supprimer le dossier.

</details>

<details>
<summary><b>Puis-je m’en servir sans page de liens ?</b></summary>

Oui. N’importe quelle page peut être votre propre HTML ou rediriger vers une autre adresse, et chacune peut servir de page d’accueil : demandez à votre IA ou choisissez dans l’onglet Contenu de la page. Vous pouvez aussi désactiver les pages et n’utiliser que des liens courts.

</details>

<details>
<summary><b>Que se passe-t-il si j’épuise l’offre gratuite ? Serai-je facturé ?</b></summary>

Vous ne serez pas facturé. L’offre gratuite ne demande pas de carte. Si le quota du jour est épuisé, les visiteurs voient une erreur jusqu’à sa remise à zéro à minuit UTC. Si votre IA tourne sur votre ordinateur, elle peut vous dire ce qu’il reste aujourd’hui.

</details>

<details>
<summary><b>Mon IA demande sans cesse si elle peut exécuter des choses. Sur quoi appuyer ?</b></summary>

C’est normal : elle demande avant de faire quoi que ce soit sur votre ordinateur. S’il s’agit de télécharger FluxBio, d’installer des outils ou de déployer, autorisez-la. Si vous ne comprenez pas ce qu’elle veut faire, demandez-lui d’abord de l’expliquer.

</details>

<details>
<summary><b>Mon site reste-t-il en ligne si j’éteins mon ordinateur ? Comment le modifier demain ?</b></summary>

Une fois en ligne, oui. Votre site est sur Cloudflare, pas sur votre ordinateur. Pour le modifier, ouvrez votre outil d’IA et dites ce que vous voulez, par exemple « Ajoute ma chaîne YouTube à ma page FluxBio ». Claude Code se souvient de votre site ; dans les autres outils, collez de nouveau le prompt des Paramètres.

</details>

<details>
<summary><b>Ai-je besoin de mon propre domaine ?</b></summary>

Non. Vous obtenez une adresse workers.dev gratuite qui fonctionne dès le déploiement et n’expire pas. Elle est juste plus longue. Si vous avez plus tard un domaine sur Cloudflare, vous pourrez l’ajouter, et les liens déjà partagés continuent de fonctionner.

</details>

<details>
<summary><b>Et si je l’essaie et n’en veux plus ?</b></summary>

Vous pouvez simplement le laisser : cela ne coûte rien. Pour tout supprimer, dites à votre IA « Supprime tout mon FluxBio ». Elle propose de garder une sauvegarde et vous demande confirmation avant de supprimer quoi que ce soit.

</details>

<details>
<summary><b>Puis-je utiliser d’autres polices ?</b></summary>

Chaque thème a ses polices. Pour n’importe quelle police Google Fonts, demandez-le à votre IA, par exemple « Mets les titres en Playfair Display » : elle trouve la police, vous dit ce qu’elle consomme et publie la page. Par défaut, les polices se chargent depuis Google Fonts, sans consommer votre quota, mais le navigateur des visiteurs se connecte à Google ; en 2022, un tribunal allemand a jugé qu’au regard du RGPD cela demande leur consentement. Si vous avez des visiteurs dans l’UE, activez « Charger les polices depuis votre site » dans Apparence : à la publication, seuls les caractères utilisés par la page sont copiés sur votre propre Worker, et chaque fichier de police coûte une requête et une lecture KV par nouveau visiteur (une page en a déjà deux ou trois pour sa police intégrée). C’est largement suffisant pour la plupart des pages ; une page très visitée avec des polices en plus atteint plus vite la limite quotidienne, mieux vaut donc en ajouter une au plus, pour les titres. Si vous gérez le code de FluxBio avec une IA capable de le modifier, comme Claude Code, elle peut réduire encore la consommation (AGENTS.md explique comment).

</details>

<details>
<summary><b>Où sont stockées les données ?</b></summary>

Tout reste sur votre compte Cloudflare : pages, liens courts et statistiques dans D1, images dans KV. Il n’y a pas de serveur central, et l’auteur n’a aucun accès à vos données. Les pages publiées et les liens courts sont publics. Les brouillons ne sont visibles que par vous et les personnes ayant un lien d’aperçu ; les statistiques et le tableau de bord demandent une connexion.

</details>

<details>
<summary><b>Mot de passe du tableau de bord, token API, clé Cloudflare : quelle différence ?</b></summary>

Le **mot de passe du tableau de bord** sert à vous y connecter : il est créé pour vous au déploiement et modifiable à tout moment. Les **tokens API** sont pour les IA et les outils : un par IA, avec au besoin le seul droit « Créer un lien court », et chacun se révoque séparément, sans toucher aux autres. Les **identifiants Cloudflare** servent à ce que seul Cloudflare permet, comme déployer ou connecter un domaine. Ils donnent accès à tout votre compte Cloudflare, alors ne les collez jamais dans un chat.

</details>

<details>
<summary><b>Que faire si un token a fuité ?</b></summary>

Révoquez-le dans « Paramètres » et générez-en un nouveau. Si c’est le mot de passe du tableau de bord qui a fuité, demandez à votre IA de le changer : tout le monde devra se reconnecter, et tous les tokens seront révoqués.

</details>

<details>
<summary><b>Et si l’IA se trompe ?</b></summary>

Les modifications d’une page vont dans un brouillon, et les visiteurs ne voient rien tant qu’il n’est pas publié. Les paramètres et les liens courts indépendants changent tout de suite. Le guide de FluxBio demande à votre IA d’expliquer ce qui va changer et de vous demander d’abord, de vous demander s’il faut publier tout de suite ou prévisualiser d’abord, et d’enregistrer une sauvegarde avant de commencer. En cas de problème, elle peut remettre l’une des 20 dernières versions publiées d’une page, ou restaurer une sauvegarde. Un outil qui ne lit pas le guide ne fera rien de tout cela : ne donnez l’accès complet qu’à une IA de confiance.

</details>

<details>
<summary><b>Peut-on l’utiliser sans IA ?</b></summary>

Oui. Pages, apparence, liens courts, QR codes, statistiques et téléchargement des sauvegardes se gèrent dans le tableau de bord. Le domaine, le fuseau horaire et une apparence avec vos propres couleurs et images n’ont pas d’écran : ils se règlent via l’API, documentée dans le `/llms.txt` de chaque FluxBio.

</details>

<details>
<summary><b>Quelles IA sont compatibles ?</b></summary>

Pour déployer : nous recommandons Claude Code sur votre propre ordinateur, mais les autres outils de code capables d’exécuter des commandes avec un accès à Internet conviennent aussi, comme Codex, OpenCode, Cursor, Cline, Roo Code, Kilo Code, Droid, Crush, Goose, Pi, TRAE, Qoder, ZCode, Eigent, Gemini CLI, GitHub Copilot ou Windsurf. Au quotidien : ceux-ci et tout outil capable d’appeler une API, comme l’app Claude, Claude Cowork, ChatGPT (via un GPT personnalisé) ou n8n. La page « Paramètres » du tableau de bord donne un prompt à coller dans Claude Code, Codex ou Cursor ; pour tout autre outil, indiquez-lui le /llms.txt de votre site.

</details>

<details>
<summary><b>Comment changer de domaine ou de mot de passe, ou migrer le site ?</b></summary>

Demandez-le simplement à votre IA : « Remplacez le domaine par links.example.com », « Changez le mot de passe du tableau de bord », « Transférez le site vers un autre FluxBio ». Le domaine doit d’abord être relié à ce Worker dans Cloudflare ; votre IA vous guide pas à pas.

</details>

<details>
<summary><b>Les visiteurs sont-ils pistés ?</b></summary>

FluxBio n’utilise pas de cookies et ne stocke ni adresse IP ni chaîne User-Agent complète. Pour chaque visite, il garde pendant 90 jours l’heure, la provenance du visiteur, son appareil, son navigateur, sa langue, son réseau et sa position approximative (environ 10 km au mieux), avec un hachage à sens unique renouvelé chaque jour. Les totaux sont conservés pour toujours. Les robots connus et les aperçus de liens ne comptent pas. Deux choses atteignent Google : les polices se chargent depuis Google Fonts, sauf si vous le désactivez dans Apparence, et une page avec une vidéo YouTube y charge sa miniature.

</details>

## Développement

```sh
cp .dev.vars.example .dev.vars   # définir ADMIN_PASSWORD en local
pnpm dev                         # http://localhost:5173 (tableau de bord sur /admin/)
pnpm test                        # lance les tests dans le runtime Workers
pnpm typecheck
```

Architecture, arborescence et conventions de développement : tout est dans [AGENTS.md](../AGENTS.md).

Technologies : Cloudflare Workers, D1, KV, Analytics Engine, Hono, React 19, Vite et le [CLI `cf`](https://www.npmjs.com/package/cf).

## Licence

- Application principale : [AGPL-3.0-only](../LICENSE). Vous pouvez l’auto-héberger et la modifier librement ; si vous l’utilisez pour proposer un service public, le code source modifié doit lui aussi être publié.
- `src/templates/` (thèmes et moteur de rendu des pages publiques) et `themes/` (jeux de couleurs des thèmes) : [MIT](../src/templates/LICENSE), pour faciliter la réutilisation.
