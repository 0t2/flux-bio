# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, you take `main`. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`, so after updating read the releases above that one. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.4.3 - 2026-11-20

### Nouveautés
- `pnpm update:code` met le code de votre dossier FluxBio à la dernière version. La commande montre ce que la mise à jour apporte, s’arrête si l’un des fichiers de FluxBio y a été modifié et ne touche pas à vos propres fichiers. Le déploiement reste une étape à part. [#50](https://github.com/0t2/flux-bio/pull/50)

## 0.4.2 - 2026-11-20

### Nouveautés
- La FAQ de fluxbio.link et le guide de votre site répondent désormais à « Comment obtenir les nouvelles versions ? » : demandez à votre IA, regardez les Paramètres du tableau de bord, ou suivez les versions du projet sur GitHub pour recevoir un e-mail à chacune. [#49](https://github.com/0t2/flux-bio/pull/49)

## 0.4.1 - 2026-11-20

### Nouveautés
- La page Paramètres du tableau de bord vous prévient quand une version plus récente de FluxBio est sortie, signale d’abord si elle contient un correctif de sécurité et donne la phrase à dire à votre IA pour mettre à jour. GitHub n’est consulté que lorsque vous ouvrez cette page, et quand votre site est à jour, c’est indiqué à côté de la version, en bas de page. [#48](https://github.com/0t2/flux-bio/pull/48)

## 0.4.0 - 2026-11-20

### Action requise
- Si vous avez modifié `cloudflare.config.ts` (un autre `WORKER_NAME`, un domaine personnalisé ou le retrait de `ANALYTICS`), mettez cela dans `worker.json`, dans votre dossier FluxBio, avant de déployer cette version ; par exemple `{ "name": "my-links" }`. Ce fichier ne fait pas partie du code : les mises à jour n’y touchent donc plus. En cas d’oubli, le déploiement s’arrête et vous indique le nom à écrire. [#45](https://github.com/0t2/flux-bio/pull/45)

### Nouveautés
- `pnpm run deploy` demande à Cloudflare ce qui tourne avant d’envoyer quoi que ce soit, et arrête un déploiement qui créerait un second site vide, mettrait l’un de vos sites hors ligne, remplacerait un autre Worker ou remplacerait votre mot de passe. Utilisez-le à la place de `cf deploy`. [#45](https://github.com/0t2/flux-bio/pull/45)
- `pnpm reset-password` définit un nouveau mot de passe d’administration et crée un nouveau jeton d’API pour chacun de vos sites, sans afficher ni l’un ni l’autre. Le lien « Mot de passe oublié ? » de la page de connexion donne désormais cette commande. [#45](https://github.com/0t2/flux-bio/pull/45)

## 0.3.2 - 2026-11-20

### Nouveautés
- Si le dossier depuis lequel vous avez déployé a disparu, supprimé ou resté sur un autre ordinateur, votre IA peut le reconstruire : le guide de votre site en donne les étapes à `/api/guide/rebuild`, avec le nom de votre Worker. Votre site continue de fonctionner pendant ce temps, et rien de ce qu’il contient n’est perdu. [#44](https://github.com/0t2/flux-bio/pull/44)

## 0.3.1 - 2026-11-20

### Nouveautés
- `GET /api/update` indique si une version plus récente de FluxBio est sortie : combien de versions votre site a de retard, et si l’une d’elles corrige un problème de sécurité ou comporte une « Action requise ». Ce journal des modifications n’est lu sur GitHub que lorsqu’on le demande. Votre IA le consulte une fois par conversation et vous prévient en premier lorsqu’un correctif de sécurité attend. [#43](https://github.com/0t2/flux-bio/pull/43)

## 0.3.0 - 2026-11-19

### Nouveautés
- Les versions ont désormais un numéro. Un site indique celle qu’il exécute dans `version` de `GET /api/state` et au début de `/llms.txt`, et chaque titre de cette page en est une. Le numéro dit ce que demande la mise à jour : quand le chiffre du milieu change (de 0.3.4 à 0.4.0), il y a une « Action requise », et quand seul le dernier change, il suffit de déployer. Un site qui affiche encore 0.2.1 date d’avant cette version : fiez-vous au jour de sa dernière mise à jour. [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### Nouveautés
- Ce changelog, ici et à [fluxbio.link](https://fluxbio.link/en/changelog/).

## 2026-11-11

### Action requise
- Mettez à jour et redéployez pour obtenir le correctif de mot de passe de lien ci-dessous. Rien d'autre sur votre site ne change. [#38](https://github.com/0t2/flux-bio/pull/38)

### Sécurité
- Un mot de passe sur le lien d'une page pouvait être ignoré : l'adresse `/_c/<handle>/<id>/link` de la page répondait avec la véritable adresse du lien. Un lien dont le bouton passe par son lien court (un mot de passe, une adresse cachée, des adresses d'appareils, des tags UTM) n'y est plus distribué ni comptabilisé. [#38](https://github.com/0t2/flux-bio/pull/38)

### Corrections
- Le mot de passe du bon lien n'a jamais atteint la destination dans Chromium. [#38](https://github.com/0t2/flux-bio/pull/38)
- La publication ne supprime plus ce qui a été tapé après le clic, et une sauvegarde automatique lors d'une publication n'est plus refusée. [#38](https://github.com/0t2/flux-bio/pull/38)
- Chaque commutateur de paramètres du tableau de bord envoie uniquement ce qu'il modifie. Avant, le basculement permettait d'annuler ce que l'IA du propriétaire avait défini depuis, y compris le domaine et le fuseau horaire. [#38](https://github.com/0t2/flux-bio/pull/38)
- L'effacement d'un site pouvait laisser une base de données sans tables lorsque KV refusait une suppression, et au-delà de 5 000 clés KV, il s'arrêtait et disait que c'était fait. [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### Modifications
- Le commutateur de paramètres est nommé Liens courts uniquement et activé signifie que les pages de biographie sont désactivées. Il a été nommé pour les pages de biographie, mais décrit ce que fait sa désactivation, donc un propriétaire d'un site contenant uniquement des liens courts l'a lu à l'envers. [#37](https://github.com/0t2/flux-bio/pull/37)

### Corrections
- `pnpm dev` n'a pas pu démarrer car `cloudflare.config.ts` a importé un module que le Worker importe également. [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### Action requise
- Si vous envoyez vos images sous forme de fichiers statiques avec `pnpm deploy:images`, déployez cette version puis exécutez-la à nouveau : elle lit désormais les images de chaque site via le nouveau `GET /api/media/{id}` et reconstruit le bundle à partir d'elles. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07), [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### Sécurité
- La vérification de domaine personnalisée est liée au nom d'hôte pour lequel elle a été demandée, de sorte qu'une vérification répondue pour un nom d'hôte ne peut pas être transmise à un autre. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- Sur un Worker qui contient plusieurs sites, les images de chaque site expédiées sous forme de fichiers statiques se trouvent désormais dans un dossier de ce site, et un site n'est servi que le sien à `/media/<id>`. Avant, tous les sites partageaient un seul dossier. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Nouveautés
- `GET /api/media/{id}` donne les octets actuels d'une image à un jeton, pour les sauvegardes et pour `pnpm deploy:images`. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Modifications
- `pnpm deploy:images` télécharge chaque image à chaque exécution, car un téléchargement ou une restauration peut écraser un identifiant, et vérifie quel site et quel mode il lit avant de le télécharger. [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- Le guide que l'IA du propriétaire lit sauvegarde avec `GET /api/media/{id}` dans un dossier d'instantanés qu'il n'écrase jamais et configure une première page dans un ordre défini. [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### Action requise
- Si votre base de données a été ouverte pour la dernière fois par une build antérieure à `7b0bad4` de ce jour, déployez d'abord la build juste avant le squash (`8d0c435`) et ouvrez le site une fois, puis déployez celle-ci. Les migrations ont été réduites en une seule, et une base de données qui a exécuté moins de dix des anciennes (`SELECT value FROM _meta WHERE key = 'schema_version'` inférieures à 10) est désormais traitée comme à jour, de sorte qu'elle manquerait de colonnes et d'index. Les nouvelles installations et bases de données à 10 ne sont pas affectées. [#27](https://github.com/0t2/flux-bio/pull/27)
- Utilisez pnpm 10.34.5 ou une version plus récente pour l'installation. Le projet nomme désormais pnpm 12.18.0 dans `package.json`, et un ancien pnpm s'arrête avec "Échec du changement de pnpm". Le programme d'installation dans `AGENTS.md` le remplace et ses étapes ont changé (`pnpm runtime set node 24 --global`, `bin` dans le dossier pnpm). Les paramètres de pnpm sont désormais en `pnpm-workspace.yaml`. [#19](https://github.com/0t2/flux-bio/pull/19)

### Sécurité
- Les pages de liens chargent des images uniquement à partir du site lui-même (plus des vignettes YouTube sur une page contenant une vidéo), où elles ont été chargées à partir de n'importe quelle adresse https. [#32](https://github.com/0t2/flux-bio/pull/32)
- Le CSS d'une page est lu comme un navigateur le lit avant d'être accepté et ne peut charger que les propres images du site. [#32](https://github.com/0t2/flux-bio/pull/32)

### Nouveautés
- Plusieurs sites dans un Worker, chacun avec sa propre base de données, KV, statistiques, paramètres et domaine, répertoriés dans `sites.json`. Sans ce fichier, un Worker est un seul site, comme avant. [#23](https://github.com/0t2/flux-bio/pull/23)
- Intégrez des blocs qui ouvrent le panneau de Ko-fi ou de Calendly sur la page en un seul clic, ainsi qu'un bouton flottant pour l'un ou l'autre. Rien ne leur sort avant le robinet. [#28](https://github.com/0t2/flux-bio/pull/28)
- L'IA du propriétaire peut donner à une page de liens son propre CSS (`appearance.css`), donc "faire ressembler ma page à cette image" conserve la page de liens. [#32](https://github.com/0t2/flux-bio/pull/32)
- Un arrière-plan de page peut se répéter à une taille définie, pour les motifs (`appearance.bgTile`). [#29](https://github.com/0t2/flux-bio/pull/29)
- Les icônes sociales peuvent suivre les liens (`appearance.socialPlace`), et le nom peut être masqué mais conservé comme en-tête de la page (`appearance.showName`). [#33](https://github.com/0t2/flux-bio/pull/33)
- Les images inutiles peuvent être répertoriées et supprimées : `GET` et `DELETE /api/media/unused`. [#8](https://github.com/0t2/flux-bio/pull/8)
- Les paramètres affichent le forfait, la taille de la base de données et l'utilisation quotidienne du quota gratuit, et `pnpm usage` le lit à partir du compte. [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7), [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- Les statistiques quotidiennes sont conservées pendant 13 mois, puis fusionnées en une seule ligne par mois, et chaque décompte peut être téléchargé au format CSV. [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images` envoie les images d'un site sous forme de fichiers statiques, qui ne coûtent aucune demande de travailleur ni lecture KV. [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- Un formulaire d'émission pour demander un nouveau bloc. [#31](https://github.com/0t2/flux-bio/pull/31)
- fluxbio.link dispose d’un estimateur de trafic et de coûts. [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### Modifications
- Aucune limite sur les pages ou les liens courts : rien qu'un visiteur ou le propriétaire attend ne lit un tableau entier, et le tableau de bord charge des liens courts un écran à la fois. [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- Moins cher à exécuter : une vue de page nécessite une lecture KV, les requêtes D1 qui ne dépendent pas les unes des autres vont de pair, le tableau de bord demande moins au Worker et une vue de page prend environ un tiers du processeur. [#6](https://github.com/0t2/flux-bio/pull/6), [#7](https://github.com/0t2/flux-bio/pull/7), [#17](https://github.com/0t2/flux-bio/pull/17), [#18](https://github.com/0t2/flux-bio/pull/18)
- Les pages et l'aperçu du tableau de bord demandent à Google une police chinoise avec uniquement les caractères qu'ils affichent, pas la police entière. [#9](https://github.com/0t2/flux-bio/pull/9), [#13](https://github.com/0t2/flux-bio/pull/13)
- Le code qui lisait les données enregistrées dans les anciennes formes a disparu : anciens paramètres et formes de page, anciens fichiers de sauvegarde, `ADMIN_TOKEN`, la page `/shorten` et les anciennes adresses du tableau de bord. [#27](https://github.com/0t2/flux-bio/pull/27)
- L'invite qui installe FluxBio télécharge d'abord le code et demande à l'agent de lire `AGENTS.md` à partir du dossier, dans les 13 langues. [#21](https://github.com/0t2/flux-bio/pull/21)
- Le guide lu par l'IA du propriétaire est divisé en un court guide principal et des sujets lus en cas de besoin, et indique comment chaque thème colore les boutons, comment les polices se chargent et comment créer un motif. [#30](https://github.com/0t2/flux-bio/pull/30), [#34](https://github.com/0t2/flux-bio/pull/34)
- Un déploiement depuis GitHub Actions d'un site FluxBio se produit uniquement dans ce référentiel et uniquement lorsqu'il nomme un site. Une copie ne déploie rien. [#14](https://github.com/0t2/flux-bio/pull/14)

### Corrections
- L'enregistrement d'un domaine personnalisé a échoué avec 522 pour chaque domaine qu'il était censé confirmer. [#35](https://github.com/0t2/flux-bio/pull/35)
- Une page publiée avant l'existence de `appearance.css` répondait à 500 jusqu'à ce qu'elle soit à nouveau publiée. [#32](https://github.com/0t2/flux-bio/pull/32)
- Le tableau de bord n'affiche plus une violation CSP dans la console du navigateur à chaque chargement. [#20](https://github.com/0t2/flux-bio/pull/20)
- Correctifs pour une IA reconstruisant une page à partir de captures d'écran : sélecteurs d'attributs CSS sur les adresses, `null` pour les images de couverture et d'arrière-plan en `POST /api/themes` et noms de thèmes dans la langue du propriétaire à partir de `GET /api/themes/community?lang=`. [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### Nouveautés
- Première version publique : lien dans la bio, liens courts et suivi des clics sur un Cloudflare Worker, géré par l'IA du propriétaire. [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

