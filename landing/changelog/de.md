# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, `pnpm update:code` in your FluxBio folder brings its code to the newest release and shows the releases in between: read them before you deploy. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.4.9 - 2026-11-20

### Sicherheit
- Die Tageskennung eines Besuchers in den detaillierten Statistiken wird jetzt mit einem Zufallswert gesalzen, der täglich ersetzt wird, nicht mehr mit dem Admin-Passwort. Wer das Passwort kennt, kann damit nicht mehr prüfen, ob eine bestimmte Adresse zu Besuch war. Die Zahl der Besucher des Tages ist am Tag dieses Updates zu hoch. [#58](https://github.com/0t2/flux-bio/pull/58)

### Behoben
- Wird veröffentlicht, während jemand anderes den Entwurf speichert, enthält die Antwort jetzt die tatsächliche Version des Entwurfs und sagt, dass der Entwurf erhalten blieb (`draftKept`); das Dashboard übernimmt diesen Entwurf oder fragt, welcher bleiben soll. [#58](https://github.com/0t2/flux-bio/pull/58)
- Eine Seite, die im selben Moment veröffentlicht wird, in dem sie verschoben wird, einer ihrer Links eine andere Kurzadresse bekommt oder eine Einstellungsänderung ihre Schriften kopiert, behält keine alte Kopie, keine verwaiste Kurzadresse und keine falschen Schriftdateien mehr. [#58](https://github.com/0t2/flux-bio/pull/58)
- Werden beim Herunterladen der Statistiken alte Tage zu Monaten zusammengefasst, fehlen keine Zahlen mehr in der Datei: Der Download erfährt davon und beginnt von vorn. [#58](https://github.com/0t2/flux-bio/pull/58)

## 0.4.8 - 2026-11-20

### Behoben
- Das Abschalten der Seiten schlug auf einer Website mit mehr als etwa 800 veröffentlichten Seiten immer fehl. Jetzt werden sie pro Anfrage zu einigen Hundert offline genommen, und der Vorgang läuft von selbst weiter, bis alle offline sind. [#57](https://github.com/0t2/flux-bio/pull/57)
- Das Wiederherstellen einer Sicherung konnte auf einer Website mit mehr als etwa 400 Seiten und Kurzlinks fehlschlagen oder alte Adressen weiter antworten lassen. Jetzt werden sie pro Anfrage zu einigen Hundert entfernt. [#57](https://github.com/0t2/flux-bio/pull/57)
- Wurde das Laden der Schriften von der eigenen Website abgeschaltet, blieben auf einer Website mit vielen Seiten die meisten Schriftdateien zurück, und es konnte fehlschlagen. Jetzt werden sie pro Anfrage zu einigen Hundert gelöscht. [#57](https://github.com/0t2/flux-bio/pull/57)
- Eine Einstellungsänderung auf einer großen Website konnte mehr Arbeit anstoßen, als einer Anfrage erlaubt ist, und fehlschlagen. [#57](https://github.com/0t2/flux-bio/pull/57)

## 0.4.7 - 2026-11-20

### Sicherheit
- Ein falsches Admin-Passwort, das als bearer token an die API geschickt wird, wartet jetzt wie das Anmeldeformular. Über die API lässt es sich also nicht schneller erraten. [#56](https://github.com/0t2/flux-bio/pull/56)

### Behoben
- Eine Seite, deren Inhalt zu groß zum Veröffentlichen ist, wird beim Speichern abgelehnt, mit ihrer Größe und der Grenze von 950 KB. Bisher ließ sie sich speichern und scheiterte dann beim Veröffentlichen mit einem nichtssagenden Fehler. [#56](https://github.com/0t2/flux-bio/pull/56)
- Ohne Startseite bot die Adresse der Website eine gelöschte oder verschobene Seite an und eine gerade veröffentlichte nicht. [#56](https://github.com/0t2/flux-bio/pull/56)
- Eine Einstellungsänderung, die gespeichert wurde, aber die Besucher nicht erreichte, wird beim nächsten Öffnen des Dashboards gesendet, ohne erneutes Speichern. [#56](https://github.com/0t2/flux-bio/pull/56)

## 0.4.6 - 2026-11-20

### Sicherheit
- Der Vorschaulink eines Entwurfs zeigt nicht mehr die Adresse eines Links, der mit einem Passwort geschützt ist oder dessen Adresse verborgen ist. Ein solcher Button führt dort wie auf der veröffentlichten Seite über seinen Kurzlink. [#55](https://github.com/0t2/flux-bio/pull/55)
- Das Passwort eines Links lässt zehn falsche Versuche in 15 Minuten zu, danach keinen mehr, bis diese Zeit um ist. Bisher gab es keine Grenze. [#55](https://github.com/0t2/flux-bio/pull/55)
- Eine Adresse, die es nicht gibt, kostet nicht mehr umso mehr, je länger sie ist. Die Suche nach einer ähnlichen Adresse konnte auf einer großen Website ein Vielfaches des Zeitlimits einer Anfrage brauchen, und jeder konnte solche Adressen aufrufen. [#55](https://github.com/0t2/flux-bio/pull/55)

### Behoben
- Ein archivierter Kurzlink, eine gelöschte Seite oder die alte Adresse einer Seite konnten zurückkommen und bleiben, wenn jemand genau im Moment der Änderung zu Besuch kam. [#55](https://github.com/0t2/flux-bio/pull/55)
- Nach dem Wiederherstellen einer Sicherung leitet ein Link, den die Sicherung als archiviert führt, nicht mehr weiter. [#55](https://github.com/0t2/flux-bio/pull/55)
- Eine Einstellung, die gespeichert wurde, während etwas anderes gespeichert wurde, bleibt erhalten, und eine Änderung, die in der Datenbank ankam, aber nicht bei Ihren Besuchern, wird ihnen geschickt, wenn Sie sie erneut vornehmen. [#55](https://github.com/0t2/flux-bio/pull/55)
- Zwei Elemente mit derselben id auf einer Seite werden beim Veröffentlichen abgelehnt: Der Kurzlink eines der beiden hätte nicht funktioniert. [#55](https://github.com/0t2/flux-bio/pull/55)

## 0.4.5 - 2026-11-20

### Behoben
- Die Anleitung, die eine Testseite oder eine lokale Kopie ausliefert, nennt nicht mehr die Befehle der Live-Website: Ihre Bereitstellungen enthalten `--mode staging`, und sie weist Ihre KI nicht mehr an, diese Anleitung als Skill der Live-Website zu speichern. [#52](https://github.com/0t2/flux-bio/pull/52)
- Bei einem Worker mit mehreren Websites lässt „FluxBio entfernen“ in der Anleitung Ihre KI nicht mehr den ganzen Worker und die Datenbank der ersten Website löschen, um nur eine Website herauszunehmen. [#52](https://github.com/0t2/flux-bio/pull/52)
- `pnpm run deploy` richtet sich nach der Version Ihres Workers, die gerade läuft; nach einem Rollback im Cloudflare-Dashboard ist das nicht immer die neueste. `pnpm deploy:images` liest die Bilder einer zweiten Website mit deren eigenem Token, und `pnpm reset-password --mode staging` lässt die gespeicherten Token der Live-Website unberührt. [#52](https://github.com/0t2/flux-bio/pull/52)
- Eine Testseite auf Ihrem Computer auszuführen (`cf dev --mode staging`) erfordert keine Anmeldung bei Cloudflare mehr. [#52](https://github.com/0t2/flux-bio/pull/52)
- `GET /api/update` antwortet bei einer Version oder einem Änderungsprotokoll, die es nicht einordnen kann, dass es nichts weiß (`latest` ist null), statt die Website als aktuell zu melden. [#52](https://github.com/0t2/flux-bio/pull/52)

## 0.4.4 - 2026-11-20

### Behoben
- `pnpm reset-password` prüft jetzt, ob die angegebene Adresse von dem Worker ausgeliefert wird, den Ihr Ordner bereitstellt, bevor etwas geändert wird. Mit der Adresse einer Testseite oder einer lokalen Website ausgeführt, so wie deren Anmeldeseiten sie angaben, wurde das Passwort der Live-Website ersetzt. Außerdem wird die Liste der Websites vom laufenden Worker gelesen, das Passwort vor dem Setzen gespeichert und gemeldet, welche Website kein Token erhalten hat. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm run deploy` sieht sich alle Worker des Kontos an, bevor eine neue Website angelegt wird: Bisher wurden nur die ersten zehn gesehen, sodass ein FluxBio weiter unten in der Liste übersehen wurde. Der Befehl stoppt auch, wenn ein Worker nicht gelesen werden kann, und legt keine Testseite mehr für eine Live-Website an, die es nicht gibt. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm update:code` ersetzt keine eigene Datei mehr, wenn eine neue Version ihren Namen zu verwenden beginnt, verliert keine Datei mehr, die nur in der Groß- und Kleinschreibung umbenannt wurde, und bleibt nicht mehr mittendrin stehen, wenn aus einer Datei ein Ordner wird. [#51](https://github.com/0t2/flux-bio/pull/51)
- `worker.json` akzeptiert jeden Worker-Namen, den Cloudflare akzeptiert: mit Unterstrichen und bis zu 63 Zeichen. [#51](https://github.com/0t2/flux-bio/pull/51)

## 0.4.3 - 2026-11-20

### Neu
- `pnpm update:code` bringt den Code in Ihrem FluxBio-Ordner auf die neueste Version. Der Befehl zeigt, was das Update mitbringt, stoppt, wenn dort eine Datei von FluxBio geändert wurde, und lässt Ihre eigenen Dateien unberührt. Das Bereitstellen bleibt ein eigener Schritt. [#50](https://github.com/0t2/flux-bio/pull/50)

## 0.4.2 - 2026-11-20

### Neu
- Die FAQ auf fluxbio.link und die Anleitung Ihrer Website beantworten jetzt „Wie bekomme ich neue Versionen?“: Fragen Sie Ihre KI, sehen Sie in den Einstellungen des Dashboards nach oder beobachten Sie die Releases des Projekts auf GitHub, um bei jeder Version eine E-Mail zu erhalten. [#49](https://github.com/0t2/flux-bio/pull/49)

## 0.4.1 - 2026-11-20

### Neu
- Die Seite „Einstellungen“ im Dashboard zeigt, wenn eine neuere Version von FluxBio erschienen ist, nennt zuerst, ob sie eine Sicherheitskorrektur enthält, und gibt den Satz an, den Sie Ihrer KI zum Aktualisieren sagen. GitHub wird nur gefragt, wenn Sie diese Seite öffnen, und wenn Ihre Website aktuell ist, steht das unten neben der Version. [#48](https://github.com/0t2/flux-bio/pull/48)

## 0.4.0 - 2026-11-20

### Aktion erforderlich
- Wenn Sie `cloudflare.config.ts` geändert haben (ein anderer `WORKER_NAME`, eine eigene Domain oder `ANALYTICS` entfernt), tragen Sie das vor dem Bereitstellen dieser Version in `worker.json` in Ihrem FluxBio-Ordner ein, zum Beispiel `{ "name": "my-links", "domains": ["links.example.com"], "analytics": false }`. Diese Datei gehört nicht zum Code, Updates lassen sie also künftig unberührt. Wenn Sie es vergessen, stoppt die Bereitstellung und nennt Ihnen den Namen, den Sie eintragen müssen. [#45](https://github.com/0t2/flux-bio/pull/45)

### Neu
- `pnpm run deploy` fragt Cloudflare vor dem Hochladen, was gerade läuft, und stoppt eine Bereitstellung, die eine zweite, leere Website anlegen, eine Ihrer Websites offline nehmen, einen anderen Worker ersetzen oder Ihr Passwort ersetzen würde. Verwenden Sie es anstelle von `cf deploy`. [#45](https://github.com/0t2/flux-bio/pull/45)
- `pnpm reset-password` setzt ein neues Admin-Passwort und erstellt für jede Ihrer Websites ein neues API-Token, ohne eines davon anzuzeigen. „Passwort vergessen?“ auf der Anmeldeseite nennt jetzt diesen Befehl. [#45](https://github.com/0t2/flux-bio/pull/45)

## 0.3.2 - 2026-11-20

### Neu
- Wenn der Ordner, aus dem Sie bereitgestellt haben, nicht mehr da ist, weil er gelöscht wurde oder auf einem anderen Computer liegt, kann Ihre KI ihn wiederherstellen: Die Anleitung Ihrer Website enthält die Schritte unter `/api/guide/rebuild`, mit dem Namen Ihres Workers darin. Ihre Website läuft währenddessen weiter, und nichts darauf geht verloren. [#44](https://github.com/0t2/flux-bio/pull/44)

## 0.3.1 - 2026-11-20

### Neu
- `GET /api/update` sagt, ob es eine neuere Version von FluxBio gibt: wie viele Releases Ihre Website zurückliegt und ob eines davon ein Sicherheitsproblem behebt oder eine „Aktion erforderlich“ enthält. Dieses Änderungsprotokoll wird nur auf Anfrage von GitHub gelesen. Ihre KI fragt einmal pro Unterhaltung nach und sagt es Ihnen zuerst, wenn eine Sicherheitskorrektur wartet. [#43](https://github.com/0t2/flux-bio/pull/43)

## 0.3.0 - 2026-11-19

### Neu
- Releases haben jetzt Versionsnummern. Eine Website nennt ihre Version in `version` von `GET /api/state` und am Anfang von `/llms.txt`, und jede Überschrift auf dieser Seite ist eine Version. Die Nummer zeigt, was ein Update verlangt: Ändert sich die mittlere Zahl (0.3.4 auf 0.4.0), gibt es eine „Aktion erforderlich“, ändert sich nur die letzte, genügt das Bereitstellen. Eine Website, die noch 0.2.1 anzeigt, stammt aus der Zeit vor diesem Release: Richten Sie sich dann nach dem Tag des letzten Updates. [#41](https://github.com/0t2/flux-bio/pull/41)

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

