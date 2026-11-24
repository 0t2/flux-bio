# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, `pnpm update:code` in your FluxBio folder brings its code to the newest release and shows the releases in between: read them before you deploy. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.4.12 - 2026-11-24

### Nouveautés
- Le tableau de bord suit le mode sombre de votre appareil. [#61](https://github.com/0t2/flux-bio/pull/61)
- Dans l’éditeur de page, le profil est tout en haut, replié sur une ligne avec le nom et l’adresse jusqu’à ce que vous l’ouvriez. [#61](https://github.com/0t2/flux-bio/pull/61)
- Chaque lien court de la liste a un bouton qui copie son adresse, et la phrase à dire à votre IA se copie en un clic. [#61](https://github.com/0t2/flux-bio/pull/61)

### Corrections
- Un GIF animé qui tient déjà dans la taille à laquelle il est affiché est envoyé tel quel et reste animé. Avant, il devenait une image fixe. [#61](https://github.com/0t2/flux-bio/pull/61)
- Un PNG garde sa transparence dans un navigateur qui ne sait pas créer de WebP, où elle devenait noire. [#61](https://github.com/0t2/flux-bio/pull/61)
- Un menu qui dépassait du bord sur un écran étroit est déplacé pour tenir. Fermer un menu rend le clavier à son bouton, et choisir un bloc dans « Ajouter un bloc » l’amène à l’éditeur du nouveau bloc. [#61](https://github.com/0t2/flux-bio/pull/61)
- Les lecteurs d’écran lisent désormais à chaque fois les messages courts du tableau de bord. [#61](https://github.com/0t2/flux-bio/pull/61)
- En arabe, l’espacement de plusieurs cadres et des graphiques de statistiques était du mauvais côté. [#61](https://github.com/0t2/flux-bio/pull/61)

## 0.4.11 - 2026-11-24

### Sécurité
- Les essais erronés du mot de passe d’administration sont désormais comptés par visiteur, dans le formulaire de connexion comme en bearer token de l’API : après dix en 15 minutes, ce visiteur reçoit `429` `rate-limited` jusqu’à la fin du délai, et personne d’autre n’est bloqué. Un nouveau mot de passe repart sans aucun essai compté. [#60](https://github.com/0t2/flux-bio/pull/60)
- Le contenu de chaque image envoyée est désormais vérifié : un fichier qui n’est pas une image PNG, JPEG, WebP, GIF ou AVIF est refusé avec `415`, quel que soit le type annoncé, et une image est conservée sous le type qui est vraiment le sien. [#60](https://github.com/0t2/flux-bio/pull/60)
- `POST /api/themes/fetch` ne suit plus les redirections et lit au plus 512 Ko d’un fichier de thème. [#60](https://github.com/0t2/flux-bio/pull/60)

### Modifications
- Les statistiques détaillées sont gardées en mémoire une minute : passer d’une page ou d’une période à l’autre ne les redemande plus. Elles peuvent avoir jusqu’à une minute de retard. [#60](https://github.com/0t2/flux-bio/pull/60)

### Corrections
- Un brouillon qui n’a pas pu être enregistré est renvoyé automatiquement, puis de nouveau au retour de la connexion. L’éditeur a aussi un bouton pour réessayer. [#60](https://github.com/0t2/flux-bio/pull/60)
- Une erreur pendant l’affichage d’un écran du tableau de bord ne laisse plus la fenêtre vide : elle est signalée, avec un bouton pour recharger. [#60](https://github.com/0t2/flux-bio/pull/60)
- Changer la langue du tableau de bord conserve ce qui est ouvert et ne recharge plus tout. [#60](https://github.com/0t2/flux-bio/pull/60)
- Se reconnecter après la fin d’une session ramène à l’écran qui était ouvert. [#60](https://github.com/0t2/flux-bio/pull/60)
- Une erreur survenue au chargement d’une page ne reste plus à l’écran après le passage à une autre. [#60](https://github.com/0t2/flux-bio/pull/60)

## 0.4.10 - 2026-11-20

### Modifications
- Les essais erronés sur le mot de passe d’un lien sont désormais comptés par visiteur : dix en 15 minutes bloquent celui qui les a faits, et personne d’autre. Le lien garde son propre compteur, de cinquante pour tous les visiteurs réunis. Un visiteur est distingué par quatre caractères tirés de son adresse avec un sel remplacé chaque jour ; l’adresse elle-même n’est pas enregistrée. [#59](https://github.com/0t2/flux-bio/pull/59)

## 0.4.9 - 2026-11-20

### Sécurité
- L’identifiant journalier d’un visiteur dans les statistiques détaillées est désormais salé avec une valeur aléatoire remplacée chaque jour, et non avec le mot de passe d’administration. Connaître le mot de passe ne permet plus de vérifier si une adresse donnée est venue. Le nombre de visiteurs du jour est trop élevé le jour de cette mise à jour. [#58](https://github.com/0t2/flux-bio/pull/58)

### Corrections
- Publier pendant que quelqu’un d’autre enregistre le brouillon répond désormais avec la vraie version du brouillon et indique que le brouillon a été conservé (`draftKept`) ; le tableau de bord prend ce brouillon ou demande lequel garder. [#58](https://github.com/0t2/flux-bio/pull/58)
- Une page publiée au moment même où elle est déplacée, où l’un de ses liens reçoit une autre adresse courte ou où un changement de réglages copie ses polices ne garde plus une ancienne copie, une adresse courte orpheline ou de mauvais fichiers de police. [#58](https://github.com/0t2/flux-bio/pull/58)
- Télécharger les statistiques pendant que d’anciens jours sont fusionnés en mois ne laisse plus de décomptes hors du fichier : le téléchargement en est averti et recommence. [#58](https://github.com/0t2/flux-bio/pull/58)

## 0.4.8 - 2026-11-20

### Corrections
- Désactiver les pages sur un site de plus de 800 pages publiées environ échouait toujours. Elles sont désormais mises hors ligne quelques centaines par requête, et l’opération continue seule jusqu’au bout. [#57](https://github.com/0t2/flux-bio/pull/57)
- Restaurer une sauvegarde sur un site de plus de 400 pages et liens courts environ pouvait échouer ou laisser d’anciennes adresses répondre. Elles sont désormais effacées quelques centaines par requête. [#57](https://github.com/0t2/flux-bio/pull/57)
- Désactiver le chargement des polices depuis votre propre site laissait la plupart des fichiers de police sur un site comptant beaucoup de pages, et pouvait échouer. Ils sont désormais supprimés quelques centaines par requête. [#57](https://github.com/0t2/flux-bio/pull/57)
- Un changement de réglages sur un grand site pouvait lancer plus de travail qu’une requête n’en autorise, et échouer. [#57](https://github.com/0t2/flux-bio/pull/57)

## 0.4.7 - 2026-11-20

### Sécurité
- Un mot de passe d’administration erroné envoyé comme bearer token de l’API attend désormais comme le formulaire de connexion : l’API n’est plus un endroit plus rapide pour le deviner. [#56](https://github.com/0t2/flux-bio/pull/56)

### Corrections
- Une page dont le contenu est trop volumineux pour être publié est refusée à l’enregistrement, avec sa taille et la limite de 950 Ko. Auparavant, elle s’enregistrait puis échouait à la publication avec une erreur qui ne disait rien. [#56](https://github.com/0t2/flux-bio/pull/56)
- Sans page d’accueil, l’adresse du site proposait une page supprimée ou déplacée, et pas celle qui venait d’être publiée. [#56](https://github.com/0t2/flux-bio/pull/56)
- Un changement de réglages enregistré mais non parvenu aux visiteurs est envoyé à la prochaine ouverture du tableau de bord, sans enregistrer de nouveau. [#56](https://github.com/0t2/flux-bio/pull/56)

## 0.4.6 - 2026-11-20

### Sécurité
- Le lien d’aperçu d’un brouillon ne montre plus l’adresse d’un lien protégé par un mot de passe ou dont l’adresse est masquée. Ce bouton passe là aussi par son lien court, comme sur la page publiée. [#55](https://github.com/0t2/flux-bio/pull/55)
- Le mot de passe d’un lien accepte dix essais erronés en 15 minutes, puis plus aucun jusqu’à la fin de ce délai. Il n’y avait pas de limite auparavant. [#55](https://github.com/0t2/flux-bio/pull/55)
- Une adresse qui n’existe pas ne coûte plus davantage quand elle est longue. Chercher une adresse proche pouvait prendre plusieurs fois la limite de temps d’une requête sur un grand site, et n’importe qui pouvait demander de telles adresses. [#55](https://github.com/0t2/flux-bio/pull/55)

### Corrections
- Un lien court archivé, une page supprimée ou l’ancienne adresse d’une page pouvaient revenir, et rester, si quelqu’un visitait au moment précis du changement. [#55](https://github.com/0t2/flux-bio/pull/55)
- La restauration d’une sauvegarde ne laisse plus rediriger un lien que la sauvegarde a archivé. [#55](https://github.com/0t2/flux-bio/pull/55)
- Un réglage enregistré pendant qu’autre chose s’enregistrait est conservé, et un changement arrivé dans la base de données mais pas jusqu’à vos visiteurs leur est envoyé quand vous le refaites. [#55](https://github.com/0t2/flux-bio/pull/55)
- Deux éléments portant le même id sur une page sont refusés à la publication : le lien court de l’un d’eux n’aurait pas fonctionné. [#55](https://github.com/0t2/flux-bio/pull/55)

## 0.4.5 - 2026-11-20

### Corrections
- Le guide servi par un site de test ou par une copie locale ne donne plus les commandes du site réel : ses déploiements portent `--mode staging`, et il ne demande plus à votre IA d’enregistrer ce guide comme la skill du site réel. [#52](https://github.com/0t2/flux-bio/pull/52)
- Sur un Worker qui contient plusieurs sites, « Supprimer FluxBio » dans le guide ne fait plus supprimer à votre IA le Worker entier et la base de données du premier site pour n’en retirer qu’un. [#52](https://github.com/0t2/flux-bio/pull/52)
- `pnpm run deploy` se fie à la version de votre Worker qui est en service, qui n’est pas toujours la plus récente après un retour en arrière dans le tableau de bord Cloudflare. `pnpm deploy:images` lit les images d’un second site avec le jeton de ce site, et `pnpm reset-password --mode staging` ne touche plus aux jetons enregistrés du site réel. [#52](https://github.com/0t2/flux-bio/pull/52)
- Lancer un site de test sur votre ordinateur (`cf dev --mode staging`) ne demande plus de se connecter à Cloudflare. [#52](https://github.com/0t2/flux-bio/pull/52)
- `GET /api/update` répond qu’il ne sait pas (`latest` vaut null) face à une version ou à un journal des modifications qu’il ne peut pas situer, au lieu d’indiquer que le site est à jour. [#52](https://github.com/0t2/flux-bio/pull/52)

## 0.4.4 - 2026-11-20

### Corrections
- `pnpm reset-password` vérifie désormais que l’adresse indiquée est bien servie par le Worker que déploie votre dossier avant de modifier quoi que ce soit. Lancée avec l’adresse d’un site de test ou d’un site local, telle que la donnait leur page de connexion, la commande remplaçait le mot de passe du site réel. Elle prend aussi la liste des sites auprès du Worker en service, enregistre le mot de passe avant de le définir et indique quel site n’a pas reçu de jeton. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm run deploy` examine tous les Workers du compte avant de créer un nouveau site : seuls les dix premiers étaient vus, et un FluxBio placé plus loin dans la liste passait inaperçu. La commande s’arrête aussi lorsqu’un Worker ne peut pas être lu, et ne crée plus de site de test pour un site réel qui n’existe pas. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm update:code` ne remplace plus un fichier à vous lorsqu’une nouvelle version se met à utiliser son nom, ne perd plus un fichier renommé seulement par ses majuscules et ne s’arrête plus en cours de route lorsqu’un fichier devient un dossier. [#51](https://github.com/0t2/flux-bio/pull/51)
- `worker.json` accepte tout nom de Worker que Cloudflare accepte : avec des tirets bas et jusqu’à 63 caractères. [#51](https://github.com/0t2/flux-bio/pull/51)

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
- Si vous avez modifié `cloudflare.config.ts` (un autre `WORKER_NAME`, un domaine personnalisé ou le retrait de `ANALYTICS`), mettez cela dans `worker.json`, dans votre dossier FluxBio, avant de déployer cette version ; par exemple `{ "name": "my-links", "domains": ["links.example.com"], "analytics": false }`. Ce fichier ne fait pas partie du code : les mises à jour n’y touchent donc plus. En cas d’oubli, le déploiement s’arrête et vous indique le nom à écrire. [#45](https://github.com/0t2/flux-bio/pull/45)

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

