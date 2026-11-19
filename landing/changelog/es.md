# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, you take `main`. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`, so after updating read the releases above that one. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.3.0 - 2026-11-19

### Novedades
- Las versiones ya tienen número. Un sitio dice cuál ejecuta en `version` de `GET /api/state` y al principio de `/llms.txt`, y cada título de esta página es una versión. El número indica qué hace falta para actualizar: cuando cambia el número del medio (de 0.3.4 a 0.4.0) hay una «Acción necesaria», y cuando solo cambia el último basta con desplegar. Un sitio que todavía dice 0.2.1 es anterior a esta versión, así que guíate por el día en que se actualizó por última vez.

## 2026-11-17

### Novedades
- Este registro de cambios, aquí y en [fluxbio.link](https://fluxbio.link/en/changelog/).

## 2026-11-11

### Acción necesaria
- Actualice y vuelva a implementar para obtener la corrección de contraseña de enlace a continuación. Nada más sobre su sitio cambia. [#38](https://github.com/0t2/flux-bio/pull/38)

### Seguridad
- Se podría omitir una contraseña en el enlace de una página: la dirección `/_c/<handle>/<id>/link` de la página respondió con la dirección real del enlace. Un enlace cuyo botón pasa por su enlace corto (una contraseña, una dirección oculta, direcciones de dispositivos, etiquetas UTM) ya no se entrega ni se cuenta allí. [#38](https://github.com/0t2/flux-bio/pull/38)

### Correcciones
- La contraseña del enlace correcto nunca llegó al destino en Chromium. [#38](https://github.com/0t2/flux-bio/pull/38)
- La publicación ya no elimina lo que se escribió después del clic y ya no se rechaza el guardado automático durante una publicación. [#38](https://github.com/0t2/flux-bio/pull/38)
- Cada interruptor de configuración en el panel envía solo lo que cambia. Antes, alternar uno podía deshacer lo que la IA del propietario había configurado desde entonces, incluido el dominio y la zona horaria. [#38](https://github.com/0t2/flux-bio/pull/38)
- Limpiar un sitio podría dejar una base de datos sin tablas cuando KV se negó a eliminarlo y, después de 5000 claves de KV, se detuvo y dijo que ya estaba hecho. [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### Cambios
- El interruptor de configuración se llama Solo enlaces cortos y está activado significa que las páginas de biografía están desactivadas. Llevaba el nombre de las páginas de biografía, pero describía lo que significa desactivarlo, por lo que el propietario de un sitio de enlaces cortos lo leyó al revés. [#37](https://github.com/0t2/flux-bio/pull/37)

### Correcciones
- `pnpm dev` no pudo iniciarse porque `cloudflare.config.ts` importó un módulo que el trabajador también importa. [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### Acción necesaria
- Si envía sus imágenes como archivos estáticos con `pnpm deploy:images`, implemente esta versión y luego ejecútela una vez más: ahora lee las imágenes de cada sitio a través del nuevo `GET /api/media/{id}` y reconstruye el paquete a partir de ellas. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07), [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### Seguridad
- La verificación de dominio personalizada está vinculada al nombre de host sobre el que se le preguntó, por lo que una verificación respondida para un nombre de host no se puede pasar por otro. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- En un Worker que posee más de un sitio, las imágenes de cada sitio enviadas como archivos estáticos ahora se encuentran en una carpeta de ese sitio, y un sitio recibe solo el suyo en `/media/<id>`. Antes, todos los sitios compartían una carpeta. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Novedades
- `GET /api/media/{id}` proporciona los bytes actuales de una imagen a un token, para copias de seguridad y para `pnpm deploy:images`. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Cambios
- `pnpm deploy:images` descarga todas las imágenes en cada ejecución, ya que una carga o restauración puede sobrescribir una identificación, y verifica qué sitio y qué modo está leyendo antes de descargar. [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- La guía que lee la IA del propietario realiza una copia de seguridad con `GET /api/media/{id}` en una carpeta de instantáneas que nunca sobrescribe y configura una primera página en un orden definido. [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### Acción necesaria
- Si su base de datos fue abierta por última vez por una compilación anterior al `7b0bad4` de este día, primero implemente la compilación justo antes del squash (`8d0c435`) y abra el sitio una vez, luego implemente este. Las migraciones se agruparon en una sola, y una base de datos que ha ejecutado menos de diez de las antiguas (`SELECT value FROM _meta WHERE key = 'schema_version'` menos de 10) ahora se trata como actualizada, por lo que omitiría columnas e índices. Las nuevas instalaciones y bases de datos en 10 no se ven afectadas. [#27](https://github.com/0t2/flux-bio/pull/27)
- Utilice pnpm 10.34.5 o posterior para instalar. El proyecto ahora nombra pnpm 12.18.0 en `package.json`, y un pnpm anterior se detiene con "Error al cambiar pnpm". El instalador en `AGENTS.md` lo reemplaza y sus pasos cambiaron (`pnpm runtime set node 24 --global`, `bin` en la carpeta pnpm). La configuración de pnpm ahora está en `pnpm-workspace.yaml`. [#19](https://github.com/0t2/flux-bio/pull/19)

### Seguridad
- Las páginas de enlaces cargan imágenes solo desde el sitio mismo (más las miniaturas de YouTube en una página con un video), donde se cargaron desde cualquier dirección https. [#32](https://github.com/0t2/flux-bio/pull/32)
- El CSS propio de una página se lee tal como lo lee un navegador antes de aceptarlo, y puede cargar sólo las imágenes del sitio. [#32](https://github.com/0t2/flux-bio/pull/32)

### Novedades
- Varios sitios en un Trabajador, cada uno con su propia base de datos, KV, estadísticas, configuración y dominio, listados en `sites.json`. Sin ese archivo, un trabajador es un sitio, como antes. [#23](https://github.com/0t2/flux-bio/pull/23)
- Incruste bloques que abren el panel de Ko-fi o Calendly sobre la página con un toque, y un botón flotante para cualquiera de ellos. No se carga nada de ellos antes del grifo. [#28](https://github.com/0t2/flux-bio/pull/28)
- La IA del propietario puede proporcionar CSS propio a una página de enlaces (`appearance.css`), por lo que "hacer que mi página se vea como esta imagen" mantiene la página de enlaces. [#32](https://github.com/0t2/flux-bio/pull/32)
- El fondo de una página puede repetirse en un tamaño establecido, para patrones (`appearance.bgTile`). [#29](https://github.com/0t2/flux-bio/pull/29)
- Los íconos sociales pueden ir después de los enlaces (`appearance.socialPlace`), y el nombre puede ocultarse pero mantenerse como encabezado de la página (`appearance.showName`). [#33](https://github.com/0t2/flux-bio/pull/33)
- Las imágenes que no se usan se pueden enumerar y eliminar: `GET` y `DELETE /api/media/unused`. [#8](https://github.com/0t2/flux-bio/pull/8)
- La configuración muestra el plan, el tamaño de la base de datos y el uso diario de la cuota gratuita, y `pnpm usage` lo lee de la cuenta. [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7), [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- Las estadísticas diarias se conservan durante 13 meses, luego se combinan en una fila por mes y cada recuento se puede descargar como CSV. [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images` envía las imágenes de un sitio como archivos estáticos, que no cuestan ninguna solicitud de trabajador ni lectura de KV. [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- Un formulario de emisión para solicitar un nuevo bloque. [#31](https://github.com/0t2/flux-bio/pull/31)
- fluxbio.link tiene un estimador de tráfico y costos. [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### Cambios
- Sin límite de páginas o enlaces cortos: nada de lo que un visitante o propietario espera lee una tabla completa, y el panel carga enlaces cortos pantalla completa a la vez. [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- Es más económico de ejecutar: una vista de página requiere una lectura de KV, las consultas D1 que no dependen entre sí van juntas, el panel le pide menos al trabajador y una vista de página requiere aproximadamente un tercio de la CPU. [#6](https://github.com/0t2/flux-bio/pull/6), [#7](https://github.com/0t2/flux-bio/pull/7), [#17](https://github.com/0t2/flux-bio/pull/17), [#18](https://github.com/0t2/flux-bio/pull/18)
- Las páginas y la vista previa del tablero solicitan a Google una fuente china con solo los caracteres que muestran, no toda la fuente. [#9](https://github.com/0t2/flux-bio/pull/9), [#13](https://github.com/0t2/flux-bio/pull/13)
- El código que leía los datos guardados en formas antiguas ya no existe: configuraciones y formas de página antiguas, archivos de copia de seguridad antiguos, `ADMIN_TOKEN`, la página `/shorten` y direcciones antiguas del panel. [#27](https://github.com/0t2/flux-bio/pull/27)
- El mensaje que instala FluxBio descarga el código primero y hace que el agente lea `AGENTS.md` de la carpeta, en los 13 idiomas. [#21](https://github.com/0t2/flux-bio/pull/21)
- La guía que lee la IA del propietario se divide en una breve guía principal y temas que se leen cuando es necesario, y dice cómo cada tema colorea los botones, cómo se cargan las fuentes y cómo hacer un patrón. [#30](https://github.com/0t2/flux-bio/pull/30), [#34](https://github.com/0t2/flux-bio/pull/34)
- Una implementación desde GitHub Actions de un sitio FluxBio ocurre solo en este repositorio y solo cuando nombra un sitio. Una copia no implementa nada. [#14](https://github.com/0t2/flux-bio/pull/14)

### Correcciones
- Al guardar un dominio personalizado falló con 522 por cada dominio que debía confirmar. [#35](https://github.com/0t2/flux-bio/pull/35)
- Una página publicada antes de que existiera `appearance.css` respondió 500 hasta que se volvió a publicar. [#32](https://github.com/0t2/flux-bio/pull/32)
- El panel ya no incluye una infracción de CSP en la consola del navegador en cada carga. [#20](https://github.com/0t2/flux-bio/pull/20)
- Correcciones para una IA que reconstruye una página a partir de capturas de pantalla: selectores de atributos CSS en direcciones, `null` para imágenes de portada y fondo en `POST /api/themes` y nombres de temas en el idioma del propietario de `GET /api/themes/community?lang=`. [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### Novedades
- Primer lanzamiento público: enlace en la biografía, enlaces cortos y seguimiento de clics en un trabajador de Cloudflare, administrado por la IA del propietario. [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

