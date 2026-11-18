# Changelog

What changed in FluxBio, a day at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
There are no version numbers: if you host your own, you take `main`, so read the days since you last updated and look for "Action needed".

The format is narrow because a script reads it: `## YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. Add an entry in the same pull request as any change someone using FluxBio would see; leave purely internal work out. The date is the day the change reaches `main`.

## 2026-11-17

### Neu
- Dieses Changelog, hier und bei [fluxbio.link](https://fluxbio.link/en/changelog/).

## 2026-11-11

### Aktion erforderlich
- Aktualisieren und erneut bereitstellen, um die unten stehende Link-Passwort-Korrektur zu erhalten. Sonst gibt es keine Änderungen an Ihrer Website. [#38](https://github.com/0t2/flux-bio/pull/38)

### Sicherheit
- Ein Passwort für den Link einer Seite könnte übersprungen werden: Die `/_c/<handle>/<id>/link`-Adresse der Seite wird mit der tatsächlichen Adresse des Links beantwortet. Ein Link, dessen Button über seinen Kurzlink (ein Passwort, eine versteckte Adresse, Geräteadressen, UTM-Tags) führt, wird dort nicht mehr ausgegeben oder gezählt. [#38](https://github.com/0t2/flux-bio/pull/38)

### Behoben
- Das richtige Link-Passwort hat das Ziel in Chromium nie erreicht. [#38](https://github.com/0t2/flux-bio/pull/38)
- Beim Veröffentlichen wird nicht mehr gelöscht, was nach dem Klick eingegeben wurde, und eine automatische Speicherung während einer Veröffentlichung wird nicht mehr abgelehnt. [#38](https://github.com/0t2/flux-bio/pull/38)
- Jeder Einstellungsschalter im Dashboard sendet nur das, was er ändert. Zuvor konnte man durch Umschalten alles rückgängig machen, was die KI des Besitzers seitdem festgelegt hatte, einschließlich der Domain und der Zeitzone. [#38](https://github.com/0t2/flux-bio/pull/38)
- Das Löschen einer Site konnte dazu führen, dass eine Datenbank ohne Tabellen zurückblieb, wenn KV einen Löschvorgang ablehnte, und nach 5.000 KV-Schlüsseln wurde der Vorgang gestoppt und gemeldet, dass er erledigt sei. [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### Geändert
- Der Einstellungsschalter heißt „Nur kurze Links“ und bedeutet „Ein“, dass Biografieseiten deaktiviert sind. Es wurde nach Biografieseiten benannt, beschrieb jedoch, was das Deaktivieren bewirkt, sodass ein Besitzer einer Website, die nur Kurzlinks enthält, es rückwärts las. [#37](https://github.com/0t2/flux-bio/pull/37)

### Behoben
- `pnpm dev` konnte nicht gestartet werden, weil `cloudflare.config.ts` ein Modul importiert hat, das auch der Worker importiert. [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### Aktion erforderlich
- Wenn Sie Ihre Bilder als statische Dateien mit `pnpm deploy:images` versenden, stellen Sie diese Version bereit und führen Sie sie dann noch einmal aus: Sie liest nun die Bilder jeder Site über das neue `GET /api/media/{id}` und erstellt das Paket daraus neu. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07), [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### Sicherheit
- Die benutzerdefinierte Domänenprüfung ist an den Hostnamen gebunden, nach dem sie gefragt wurde, sodass eine für einen Hostnamen beantwortete Prüfung nicht für einen anderen Hostnamen weitergegeben werden kann. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- Auf einem Worker, der mehr als eine Site enthält, befinden sich die als statische Dateien versendeten Bilder jeder Site jetzt in einem Ordner dieser Site, und eine Site wird nur für ihre eigene Site unter `/media/<id>` bereitgestellt. Zuvor hatten alle Websites einen gemeinsamen Ordner. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Neu
- `GET /api/media/{id}` übergibt die aktuellen Bytes eines Bildes an einen Token, für Backups und für `pnpm deploy:images`. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Geändert
- `pnpm deploy:images` lädt jedes Bild bei jedem Durchlauf herunter, da ein Upload oder eine Wiederherstellung eine ID überschreiben kann, und prüft vor dem Herunterladen, welche Site und welchen Modus es liest. [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- Die Anleitung, die die KI des Eigentümers liest, sichert `GET /api/media/{id}` in einen Snapshot-Ordner, der nie überschrieben wird, und richtet eine erste Seite in einer definierten Reihenfolge ein. [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### Aktion erforderlich
- Wenn Ihre Datenbank zuletzt von einem Build vor `7b0bad4` dieses Tages geöffnet wurde, stellen Sie zuerst den Build direkt vor dem Squash (`8d0c435`) bereit, öffnen Sie die Site einmal und stellen Sie dann diesen Build bereit. Migrationen wurden auf eine einzige gequetscht, und eine Datenbank, die weniger als zehn der alten ausgeführt hat (`SELECT value FROM _meta WHERE key = 'schema_version'` unter 10), wird jetzt als aktuell behandelt, sodass Spalten und Indizes fehlen würden. Neuinstallationen und Datenbanken unter 10 sind nicht betroffen. [#27](https://github.com/0t2/flux-bio/pull/27)
- Verwenden Sie zur Installation pnpm 10.34.5 oder neuer. Das Projekt benennt jetzt pnpm 12.18.0 in `package.json` und ein älteres pnpm stoppt mit „Failed to switch pnpm“. Das Installationsprogramm in `AGENTS.md` ersetzt es und seine Schritte wurden geändert (`pnpm runtime set node 24 --global`, `bin` im pnpm-Ordner). Die Einstellungen von pnpm befinden sich jetzt in `pnpm-workspace.yaml`. [#19](https://github.com/0t2/flux-bio/pull/19)

### Sicherheit
- Seiten mit Links laden Bilder nur von der Website selbst (plus YouTube-Miniaturansichten auf einer Seite mit einem Video), wo sie von einer beliebigen https-Adresse geladen werden. [#32](https://github.com/0t2/flux-bio/pull/32)
- Das eigene CSS einer Seite wird so gelesen, wie ein Browser es liest, bevor es akzeptiert wird, und lädt möglicherweise nur die eigenen Bilder der Website. [#32](https://github.com/0t2/flux-bio/pull/32)

### Neu
- Mehrere Sites in einem Worker, jede mit eigener Datenbank, KV, Statistiken, Einstellungen und Domäne, aufgelistet in `sites.json`. Ohne diese Datei ist ein Worker wie zuvor eine Site. [#23](https://github.com/0t2/flux-bio/pull/23)
- Betten Sie Blöcke ein, die mit einem Fingertipp das Bedienfeld von Ko-fi oder Calendly über der Seite öffnen, sowie eine schwebende Schaltfläche für beide. Vor dem Tippen wird nichts von ihnen geladen. [#28](https://github.com/0t2/flux-bio/pull/28)
- Die KI des Eigentümers kann einer Seite mit Links ein eigenes CSS (`appearance.css`) geben, sodass „meine Seite wie dieses Bild aussehen lässt“ die Seite mit Links beibehalten wird. [#32](https://github.com/0t2/flux-bio/pull/32)
- Ein Seitenhintergrund kann sich für Muster (`appearance.bgTile`) in einer festgelegten Größe wiederholen. [#29](https://github.com/0t2/flux-bio/pull/29)
- Soziale Symbole können den Links folgen (`appearance.socialPlace`) und der Name kann ausgeblendet, aber als Überschrift der Seite beibehalten werden (`appearance.showName`). [#33](https://github.com/0t2/flux-bio/pull/33)
- Bilder, die nicht verwendet werden, können aufgelistet und gelöscht werden: `GET` und `DELETE /api/media/unused`. [#8](https://github.com/0t2/flux-bio/pull/8)
- Die Einstellungen zeigen den Plan, die Datenbankgröße und die tägliche Nutzung des kostenlosen Kontingents an und `pnpm usage` liest es aus dem Konto. [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7), [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- Tägliche Statistiken werden 13 Monate lang gespeichert, dann in einer Zeile pro Monat zusammengeführt und jede Zählung kann als CSV heruntergeladen werden. [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images` versendet die Bilder einer Site als statische Dateien, die keine Worker-Anfrage oder KV-Lesung erfordern. [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- Ein Ausgabeformular für die Beantragung eines neuen Blocks. [#31](https://github.com/0t2/flux-bio/pull/31)
- flowbio.link verfügt über einen Verkehrs- und Kostenschätzer. [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### Geändert
- Keine Beschränkung der Seiten oder Kurzlinks: Nichts, worauf ein Besucher oder der Eigentümer wartet, liest eine ganze Tabelle, und das Dashboard lädt bildschirmweise Kurzlinks. [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- Günstiger in der Ausführung: Ein Seitenaufruf erfordert einen KV-Lesevorgang, D1-Abfragen, die nicht voneinander abhängig sind, gehen zusammen, das Dashboard verlangt vom Worker weniger und ein Seitenaufruf beansprucht etwa ein Drittel der CPU. [#6](https://github.com/0t2/flux-bio/pull/6), [#7](https://github.com/0t2/flux-bio/pull/7), [#17](https://github.com/0t2/flux-bio/pull/17), [#18](https://github.com/0t2/flux-bio/pull/18)
- Seiten und die Vorschau des Dashboards fragen Google nach einer chinesischen Schriftart, die nur die angezeigten Zeichen enthält, nicht die gesamte Schriftart. [#9](https://github.com/0t2/flux-bio/pull/9), [#13](https://github.com/0t2/flux-bio/pull/13)
- Der Code, der in älteren Formen gespeicherte Daten las, ist verschwunden: alte Einstellungen und Seitenformen, alte Sicherungsdateien, `ADMIN_TOKEN`, die Seite `/shorten` und alte Dashboard-Adressen. [#27](https://github.com/0t2/flux-bio/pull/27)
- Die Eingabeaufforderung, die FluxBio installiert, lädt zuerst den Code herunter und veranlasst den Agenten, `AGENTS.md` aus dem Ordner in allen 13 Sprachen zu lesen. [#21](https://github.com/0t2/flux-bio/pull/21)
- Der Leitfaden, den die KI des Besitzers vorliest, ist in einen kurzen Hauptleitfaden und bei Bedarf vorgelesene Themen unterteilt und erklärt, wie jedes Thema die Tasten färbt, wie Schriftarten geladen werden und wie man ein Muster erstellt. [#30](https://github.com/0t2/flux-bio/pull/30), [#34](https://github.com/0t2/flux-bio/pull/34)
- Eine Bereitstellung über GitHub-Aktionen einer FluxBio-Site erfolgt nur in diesem Repository und nur, wenn eine Site benannt wird. Eine Kopie stellt nichts bereit. [#14](https://github.com/0t2/flux-bio/pull/14)

### Behoben
- Das Speichern einer benutzerdefinierten Domäne schlug mit 522 für jede Domäne fehl, die bestätigt werden sollte. [#35](https://github.com/0t2/flux-bio/pull/35)
- Eine Seite, die vor der Existenz von `appearance.css` veröffentlicht wurde, antwortete mit 500, bis sie erneut veröffentlicht wurde. [#32](https://github.com/0t2/flux-bio/pull/32)
- Das Dashboard meldet nicht mehr bei jedem Ladevorgang eine CSP-Verletzung in der Browserkonsole. [#20](https://github.com/0t2/flux-bio/pull/20)
- Korrekturen für eine KI, die eine Seite aus Screenshots neu erstellt: CSS-Attributselektoren für Adressen, `null` für Cover- und Hintergrundbilder in `POST /api/themes` und Themennamen in der Sprache des Eigentümers von `GET /api/themes/community?lang=`. [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### Neu
- Erste öffentliche Veröffentlichung: Link in der Biografie, Kurzlinks und Klickverfolgung auf einem Cloudflare-Worker, ausgeführt von der KI des Eigentümers. [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

