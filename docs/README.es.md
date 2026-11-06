<div align="center">

<img src="../public/favicon.svg" width="72" height="72" alt="">

# FluxBio

**Un solo enlace para todo lo que haces**

Link en bio y enlaces cortos de código abierto que corren por completo en tu propia cuenta de Cloudflare. El plan gratuito alcanza.

<a href="../README.md"><kbd>&nbsp;English&nbsp;</kbd></a>
<a href="README.zh-TW.md"><kbd>&nbsp;繁體中文&nbsp;</kbd></a>
<a href="README.zh-CN.md"><kbd>&nbsp;简体中文&nbsp;</kbd></a>
<a href="README.ja.md"><kbd>&nbsp;日本語&nbsp;</kbd></a>
<a href="README.ko.md"><kbd>&nbsp;한국어&nbsp;</kbd></a>
<a href="README.es.md"><kbd>&nbsp;<b>Español</b>&nbsp;</kbd></a>
<a href="README.pt-BR.md"><kbd>&nbsp;Português&nbsp;</kbd></a>
<a href="README.fr.md"><kbd>&nbsp;Français&nbsp;</kbd></a>
<a href="README.de.md"><kbd>&nbsp;Deutsch&nbsp;</kbd></a>
<a href="README.id.md"><kbd>&nbsp;Bahasa Indonesia&nbsp;</kbd></a>
<a href="README.th.md"><kbd>&nbsp;ไทย&nbsp;</kbd></a>
<a href="README.vi.md"><kbd>&nbsp;Tiếng Việt&nbsp;</kbd></a>
<a href="README.ar.md"><kbd>&nbsp;العربية&nbsp;</kbd></a>

[Página de presentación](https://fluxbio.link) · [Instala el tuyo](#instala-el-tuyo) · [Guía para agentes de IA](../AGENTS.md)

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](../LICENSE)
[![Runs on Cloudflare Workers](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

</div>

<br>

**TL;DR**

- Páginas Link-in-bio y enlaces cortos con estadísticas de clics, en una sola herramienta.
- Funciona en tu propia cuenta de Cloudflare. El plan gratuito basta y tus datos siguen siendo tuyos.
- [Pega un mensaje en tu IA](#instala-el-tuyo) y lo deja todo listo. Después, edita en el panel o simplemente díselo a tu IA.

<img src="https://fluxbio.link/es/dash-links.webp" alt="El panel de FluxBio: editar una página bio junto a su vista previa en vivo">

Crea páginas bio con tu estilo: elige un tema y sus colores, o pídele a tu IA uno con tus imágenes, y agrega videos, productos y tu horario de atención. Cada enlace de la página también tiene su enlace corto, y ves qué recibe clics y si la gente llega desde IG, Threads o LINE.

## Funciones

### Tu IA lo administra

- Crea un token de API en Ajustes y pega la instrucción que aparece en pantalla en Claude Code, Codex o Cursor. A partir de ahí, solo pídele que edite páginas, cree enlaces cortos, consulte estadísticas o cambie el dominio y la zona horaria.
- Cada instalación incluye una guía para la IA (`/llms.txt`, `/skill.md`) y la especificación de la API (`/api/openapi.json`). La IA te avisa de los riesgos antes de publicar, borrar o cambiar una dirección, y también te da sugerencias.

### Páginas bio

- Una instalación puede tener varias páginas, cada una con su propia dirección, tema y estadísticas.
- 24 temas, cada uno con su propio diseño y varias combinaciones de color: Neón, Panorama, Mosaicos, Caramelo, Aire, Aurora, Tarjeta, Escarcha, Atardecer, Cielo, Pop, Retrato, Hoja, Riel, Bicolor, Relieve, Bento, Puntos, Pastel, Carta, Obsidiana, Luna, Etiquetas y Pistas.
- ¿Solo necesitas enlaces cortos? Desactiva las páginas en el panel: las páginas públicas dejan de verse, los enlaces cortos siguen funcionando y no se borra nada.
- ¿No quieres una página de enlaces? Cualquier página puede ser tu propio HTML o redirigir a otra dirección, y ambas pueden ser tu página de inicio.
- Fuentes: las de cada tema se cargan desde Google Fonts sin consumir tu cuota. Un interruptor en Apariencia las sirve desde tu propio Worker, así los visitantes nunca se conectan a Google (útil si tienes visitantes en la UE). Para cualquier otra fuente de Google Fonts, pídeselo a tu IA; en las preguntas frecuentes verás cuánto consumen.
- Tu propio tema: pídele a tu IA uno con tus colores, fuentes, imagen de portada y fondo. Los [archivos de tema](../themes/) que otros comparten también los aplica tu IA.
- Bloques de contenido: enlaces, títulos, videos (YouTube/Vimeo), carrusel de fotos, tarjetas de productos, horario de atención y mapa.
- Los enlaces se pueden destacar, ocultar o programar para que aparezcan y desaparezcan solos.
- Plantillas para creadores, tiendas, eventos, profesionales y organizaciones: empieza con un clic.
- La imagen de vista previa que se ve al compartir en LINE o Facebook se genera automáticamente según el tema. Se genera al publicar desde el panel; tu IA también puede usar una captura de la página.
- Puedes poner un botón de LINE abajo a la derecha, para que te agreguen con un toque.

### Enlaces cortos

- Al publicar, cada enlace de la página bio se convierte en un enlace corto, y también puedes crearlos aparte. Para crear muchos de una vez, con UTM para cada plataforma, pídeselo a tu IA. Los botones de la página muestran la dirección real; con un interruptor usan el enlace corto, para lo que prefieras no mostrar, como enlaces de afiliados.
- El alias puede usar letras de cualquier idioma, con tildes y ñ, y también en tailandés o hindi.
- Códigos QR con colores, forma de los puntos, ícono central y texto del marco a tu gusto; descárgalos en PNG, SVG o PDF.
- Fecha de inicio, fecha de caducidad, protección con contraseña y UTM.
- Redirección inteligente: dentro de LINE abre el navegador externo, en los navegadores integrados de IG y FB muestra antes un aviso para salir, y iPhone y Android pueden ir a destinos distintos.

### Estadísticas

- Visitas, clics, tasa de clics y origen: conteo exacto (D1), por día durante 13 meses y por mes después.
- Visitantes únicos, regiones, mapa de visitantes, operadores, dispositivos, navegadores, idiomas, sitios externos, UTM, clics por hora y actividad reciente: se guardan 90 días (Cloudflare Analytics Engine, sin configurar nada).
- Comparación con el período anterior, una página de estadísticas para cada enlace corto y exportación a CSV.
- Sin cookies y sin guardar IPs ni el user agent completo del navegador, y la ubicación no pasa de la ciudad; el ID de visitante es un hash unidireccional que cambia cada día. Los bots tampoco se cuentan.

<table>
  <tr>
    <td width="50%"><img src="https://fluxbio.link/es/dash-stats.webp" alt="Estadísticas: visitas, clics, tasa de clics y visitantes únicos en 30 días"></td>
    <td width="50%"><img src="https://fluxbio.link/es/dash-qr.webp" alt="Diseñar un código QR para un enlace corto"></td>
  </tr>
  <tr>
    <td align="center"><sub>Estadísticas comparadas con el periodo anterior</sub></td>
    <td align="center"><sub>Un código QR para cada enlace corto</sub></td>
  </tr>
</table>

### Idiomas y alojamiento

- **13 idiomas**: el panel y las páginas públicas están en chino tradicional, chino simplificado, inglés, japonés, coreano, español, portugués, francés, alemán, indonesio, tailandés, vietnamita y árabe. Las páginas públicas usan el idioma que elijas, y puedes activar más para quien tenga el navegador en ellos. Tu IA también puede traducir tus propios textos a esos idiomas.
- **Casi nada de JavaScript en las páginas públicas**: HTML puro servido directamente desde el edge de Cloudflare, así que cargan rápido. Solo hay un script mínimo que cuenta los clics, y la página funciona sin él. Los videos y mapas solo se cargan cuando el visitante los toca.
- **Autoalojado**: solo usa Workers, D1, KV y Analytics Engine de Cloudflare, nada requiere configuración manual y no hay que contratar ningún otro servicio (las fuentes se cargan de Google Fonts por defecto, y se puede desactivar). Pídele a tu IA que exporte o importe todo tu contenido para hacer una copia de seguridad o pasarlo a otra instalación.
- **Varios sitios en una sola instalación**: dos dominios pueden ser dos sitios independientes dentro del mismo FluxBio, por ejemplo tus páginas en uno y un acortador de enlaces en el otro. Cada uno tiene sus propias páginas, enlaces cortos y estadísticas, y cambias de uno a otro desde el menú de arriba a la izquierda del panel. Añadir un sitio es tarea de tu IA: no se puede añadir a mano desde el panel.

## Instala el tuyo

Tu IA instala las herramientas que necesita. Para probarlo solo te hace falta Claude Code; para ponerlo en línea, también una cuenta gratuita de Cloudflare. Si lo haces por tu cuenta, necesitas Node.js 22.23+, 24.22+ o 26.12+ y pnpm.

### Lo más fácil: pídeselo a tu IA

Pégalo en tu IA. Recomendamos [Claude Code](https://code.claude.com/docs/en/quickstart) en tu propia computadora, pero también sirven Codex, OpenCode, Cursor y otras que puedan ejecutar comandos y conectarse a internet:

```text
Sigue el AGENTS.md de https://github.com/0t2/flux-bio y ayúdame a probar FluxBio.
Usa español (es) como idioma de la página.
```

Primero te pregunta si quieres ver una página de muestra en tu computadora, sin necesidad de cuenta. Cuando te guste, te pide iniciar sesión en Cloudflare, la pone en línea y se conecta. Tú decides cuándo se hace pública, y después basta con decirle qué cambiar. ChatGPT y Claude en el navegador no pueden hacerlo, porque no pueden ejecutar nada en tu computadora.

> [!NOTE]
> Por el camino te pedirá permiso varias veces: tu IA pregunta antes de ejecutar comandos (descargar el código, instalar paquetes, desplegar), Cloudflare te pide aprobar el inicio de sesión en el navegador y tu IA vuelve a preguntar antes de guardar su token en tu computadora. Revisa qué hace cada paso y luego permítelo.

### Hazlo tú mismo

```sh
git clone https://github.com/0t2/flux-bio.git
cd flux-bio
pnpm install
pnpm exec cf auth login          # la primera vez, inicia sesión en Cloudflare

# genera la contraseña del panel (ADMIN_PASSWORD, al menos 12 caracteres) y despliega
printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)" > .secrets.env
pnpm exec cf deploy --secrets-file .secrets.env
cat .secrets.env && rm .secrets.env   # guarda bien la contraseña
```

Cuando termine el despliegue, abre `https://<tu-sitio>/admin/` e inicia sesión con la contraseña. La configuración inicial te guía para crear tu primera página. Luego conecta tu IA en “Configuración”; después, el dominio, la zona horaria, las copias de seguridad y el cambio de contraseña se los pides directamente a ella. El primer despliegue crea la base de datos D1 y el KV automáticamente.

## Saber de dónde vienen tus visitantes

FluxBio registra de dónde viene cada visita, sin cookies. En “Estadísticas”, “Plataformas de origen” muestra cuántas personas abrieron tu página bio desde cada plataforma y cuántos enlaces tocaron después, y “Campañas UTM” lo desglosa según las etiquetas de tus enlaces.

### Lo que se reconoce solo

- **Navegadores integrados en apps:** Instagram, Threads, Facebook (incluido Messenger), LINE, X, TikTok, WeChat, Weibo, KakaoTalk, NAVER, Zalo, Snapchat, Pinterest y LinkedIn.
- **Sitios que enlazan a ti:** X (t.co), YouTube, Reddit, buscadores como Google, Bing, Yahoo y Baidu, y cualquier otro sitio, que aparece con su dominio.
- Los **códigos QR** creados en FluxBio llevan `?s=qr`.
- Los enlaces de tu página bio conservan el origen, así que cada clic cuenta para la plataforma de la que vino el visitante.

### Lo que tienes que etiquetar tú

Algunos lugares no indican de dónde viene la visita, y esta cuenta como “Directo / otros”:

- WhatsApp, Telegram, Discord, iMessage y SMS
- correos, boletines y PDF
- carteles, tarjetas de visita y otros impresos (usa un código QR de FluxBio)

Añade `?s=` y un nombre al enlace que compartas ahí, por ejemplo `https://links.example.com/?s=whatsapp`, o `https://links.example.com/talk?s=email` para un enlace corto. También sirven las abreviaturas `ig`, `fb`, `x`, `th`, `wa`, `tg`, `mail` y `qr`. Una etiqueta `?s=` tiene prioridad sobre la detección automática.

### Varios lugares en una misma plataforma: `utm_content`

El enlace de tu biografía de Instagram, tus historias y tus publicaciones cuentan todos como Instagram. Para compararlos, da a cada lugar su propia dirección:

- en la biografía de Instagram: `https://links.example.com/?utm_content=bio`
- en una historia: `https://links.example.com/?utm_content=story`

Cada uno tiene su propia fila en “Campañas UTM”, con visitas y clics por separado, y los visitantes conservan la etiqueta al tocar un enlace de tu página. Los enlaces cortos también admiten `utm_source`, `utm_medium`, `utm_campaign` y `utm_content` (“Enlaces cortos” → “Opciones avanzadas”). Se añaden al destino, así que el sitio al que enlazas también los ve.

> [!TIP]
> O pídeselo a tu IA: “Crea enlaces de seguimiento para mi biografía de Instagram, mis historias y mis publicaciones”.

### Ten en cuenta

- Ves de dónde vienen los visitantes, no quiénes son. Instagram, Facebook y X nunca dicen a otros sitios qué cuenta tocó un enlace, y FluxBio no guarda nada que identifique a una persona.
- Los nombres de `?s=` admiten letras sin tilde, números, `-` y `_`, y se pasan a minúsculas; los demás caracteres se eliminan. Las etiquetas UTM se guardan tal cual, así que `story` y `Story` cuentan como dos filas: escríbelas siempre igual.
- La ubicación es la ciudad que Cloudflare estima a partir de la IP del visitante. Las VPN, el Relay privado de iCloud y las redes de empresa pueden situar a alguien en otro lugar.
- Las visitas, los clics y los orígenes son exactos. Cada día se guarda 13 meses y después cada mes queda como un total, para siempre; desde Ajustes puedes descargarlo todo. Las regiones, el mapa, las redes, los dispositivos, los idiomas y el detalle de UTM se guardan 90 días, y las visitas nuevas tardan alrededor de un minuto en aparecer. Tú eliges si los íconos sociales también cuentan. Los botones que muestran la dirección real se cuentan con un script mínimo en la página, así que un bloqueador puede ocultar algún clic; los enlaces cortos siempre se cuentan.
- Los visitantes únicos se cuentan por día: la misma persona en dos días distintos, o en el móvil y luego en el ordenador, cuenta dos veces.
- Los bots y las vistas previas de enlaces (la petición que hace una app de chat cuando alguien pega un enlace) no se cuentan, así que las cifras pueden ser menores que en otras herramientas.
- Las etiquetas UTM de un enlace corto van solo a su destino principal, no a las direcciones aparte para iPhone o Android, y nunca sustituyen una etiqueta que el destino ya tenga. Cambiarlas solo afecta a los clics posteriores.
- Las apps se reconocen por cómo se identifican sus navegadores integrados. Si una app cambia eso, sus visitas pueden contar como “Directo / otros” hasta que FluxBio se actualice.

## Preguntas frecuentes

<details>
<summary><b>¿Cuesta algo?</b></summary>

FluxBio es gratuito y de código abierto. Funciona en tu propia cuenta de Cloudflare, cuyo plan gratuito cubre de diez mil a varias decenas de miles de visitas a la página al día, según las imágenes de tu página, y varios cientos de cambios. Suele ser más de lo que necesitan las personas y las tiendas pequeñas. Las suscripciones a IA como Claude o ChatGPT van aparte, y Claude Code requiere un plan de pago de Claude.

</details>

<details>
<summary><b>¿Puedo probarlo sin una cuenta de Cloudflare?</b></summary>

Sí. Tu IA crea una página de muestra en tu computadora, sin ninguna cuenta. Su dirección solo se abre en tu computadora, así que no puedes enviársela a nadie, y tras reiniciar le pides a tu IA que la abra de nuevo, sin perder nada. Cuando te guste, crea una cuenta gratuita de Cloudflare para ponerla en línea, y lo que hiciste se va con ella. Si prefieres dejarlo, pídele a tu IA que borre la carpeta.

</details>

<details>
<summary><b>¿Puedo usarlo sin una página de enlaces?</b></summary>

Sí. Cualquier página puede ser tu propio HTML o redirigir a otra dirección, y ambas pueden ser tu página de inicio: pídeselo a tu IA o elígelo en la pestaña Contenido de la página. También puedes desactivar las páginas y usar solo enlaces cortos.

</details>

<details>
<summary><b>¿Qué pasa si agoto el plan gratuito? ¿Me cobrarán?</b></summary>

No te cobrarán. El plan gratuito no necesita tarjeta. Si se acaba el cupo del día, los visitantes verán un error hasta que se reinicie a medianoche UTC. Si tu IA funciona en tu ordenador, puede decirte cuánto queda hoy.

</details>

<details>
<summary><b>Mi IA no deja de preguntar si puede ejecutar cosas. ¿Qué pulso?</b></summary>

Es normal: pregunta antes de hacer algo en tu ordenador. Si va a descargar FluxBio, instalar herramientas o desplegar, permítelo. Si no entiendes lo que quiere hacer, pídele primero que te lo explique.

</details>

<details>
<summary><b>¿Mi sitio sigue ahí si apago el ordenador? ¿Cómo lo cambio mañana?</b></summary>

Una vez en línea, sí. Tu sitio está en Cloudflare, no en tu ordenador. Para cambiarlo, abre tu herramienta de IA y di lo que quieres, por ejemplo «Añade mi canal de YouTube a mi página de FluxBio». Claude Code recuerda tu sitio; en otras herramientas, vuelve a pegar el mensaje de Configuración.

</details>

<details>
<summary><b>¿Necesito un dominio propio?</b></summary>

No. Tienes una dirección gratuita de workers.dev que funciona en cuanto se despliega y no caduca. Solo es más larga. Si más adelante tienes un dominio en Cloudflare, puedes añadirlo, y los enlaces que ya compartiste siguen funcionando.

</details>

<details>
<summary><b>¿Y si lo pruebo y no lo quiero?</b></summary>

Puedes dejarlo sin más: no cuesta nada. Para borrarlo todo, dile a tu IA «Borra todo mi FluxBio». Te ofrecerá guardar una copia y te lo confirmará antes de borrar nada.

</details>

<details>
<summary><b>¿Puedo usar otras fuentes?</b></summary>

Cada tema trae sus fuentes. Para cualquier fuente de Google Fonts, díselo a tu IA, por ejemplo «Cambia los títulos a Playfair Display»: busca la fuente, te dice cuánto consume y publica la página. Por defecto las fuentes se cargan desde Google Fonts, sin consumir tu cuota, pero los navegadores de los visitantes se conectan a Google; en 2022 un tribunal alemán resolvió que, según el RGPD, eso requiere su consentimiento. Si tienes visitantes en la UE, activa «Cargar las fuentes desde tu sitio» en Apariencia: al publicar, solo los caracteres que usa tu página se copian a tu propio Worker, y cada archivo de fuente cuesta una solicitud y una lectura de KV por visitante nuevo (una página ya tiene dos o tres por su fuente integrada). Para la mayoría de las páginas sobra; una página con mucho tráfico y fuentes extra llega antes al límite diario, así que conviene añadir como mucho una, para los títulos. Si gestionas el código de FluxBio con una IA que puede cambiarlo, como Claude Code, puede reducir aún más el consumo (AGENTS.md explica cómo).

</details>

<details>
<summary><b>¿Dónde se guardan los datos?</b></summary>

Todo queda en tu cuenta de Cloudflare: las páginas, los enlaces cortos y las estadísticas en D1, y las imágenes en KV. No hay un servidor central y el autor no puede ver tus datos. Las páginas publicadas y los enlaces cortos son públicos. Los borradores solo los ves tú y quien tenga un enlace de vista previa; las estadísticas y el panel requieren iniciar sesión.

</details>

<details>
<summary><b>¿Qué diferencia hay entre la contraseña del panel, un token de API y la clave de Cloudflare?</b></summary>

La **contraseña del panel** es para que tú inicies sesión en el panel: se crea por ti al desplegar y puedes cambiarla cuando quieras. Los **tokens de API** son para las IA y otras herramientas: crea uno por cada IA, limita uno a crear enlaces cortos si quieres y revócalos por separado sin afectar a los demás. Las **credenciales de Cloudflare** sirven para lo que solo Cloudflare puede hacer, como desplegar o conectar un dominio. Controlan toda tu cuenta de Cloudflare, así que nunca las pegues en un chat.

</details>

<details>
<summary><b>¿Y si se filtra un token?</b></summary>

Revócalo en “Configuración” y crea uno nuevo. Si lo que se filtró es la contraseña del panel, pídele a tu IA que la cambie; después todos tendrán que volver a iniciar sesión y todos los tokens dejarán de funcionar.

</details>

<details>
<summary><b>¿Y si la IA se equivoca?</b></summary>

Los cambios en la página van a un borrador, y los visitantes no ven nada hasta que se publica. La configuración y los enlaces cortos independientes cambian al instante. La guía de FluxBio le indica a tu IA que te explique qué va a cambiar y te pregunte antes, que te pregunte si publicar directamente o ver antes una vista previa, y que guarde una copia de seguridad antes de empezar. Si algo sale mal, puede recuperar una de las últimas 20 versiones publicadas de una página o restaurar una copia de seguridad. Una herramienta que no lee la guía no hará nada de esto, así que da acceso total solo a una IA en la que confíes.

</details>

<details>
<summary><b>¿Puedo usarlo sin IA?</b></summary>

Sí. Las páginas, la apariencia, los enlaces cortos, los códigos QR, las estadísticas y la descarga de copias de seguridad se manejan en el panel. El dominio, la zona horaria y una apariencia con tus propios colores e imágenes no tienen pantalla propia y se cambian por API; las instrucciones están en `/llms.txt` de cada FluxBio.

</details>

<details>
<summary><b>¿Con qué IA funciona?</b></summary>

Para desplegar: recomendamos Claude Code en tu propia computadora, pero también sirven otras herramientas de programación que puedan ejecutar comandos y conectarse a internet, como Codex, OpenCode, Cursor, Cline, Roo Code, Kilo Code, Droid, Crush, Goose, Pi, TRAE, Qoder, ZCode, Eigent, Gemini CLI, GitHub Copilot o Windsurf. Para el día a día: esas y cualquier herramienta que pueda llamar a una API, como la app de Claude, Claude Cowork, ChatGPT (con un GPT personalizado) o n8n. En “Configuración” del panel hay un mensaje para pegar en Claude Code, Codex o Cursor; para cualquier otra herramienta, indícale el /llms.txt de tu sitio.

</details>

<details>
<summary><b>¿Cómo cambio el dominio o la contraseña, o me mudo a otro FluxBio?</b></summary>

Pídeselo a tu IA: “Cambia el dominio a links.example.com”, “Cambia la contraseña del panel”, “Mueve el sitio a otro FluxBio”. Primero hay que conectar el dominio a este Worker en Cloudflare; tu IA te guía paso a paso.

</details>

<details>
<summary><b>¿Rastrea a los visitantes?</b></summary>

FluxBio no usa cookies y no guarda direcciones IP ni cadenas completas de user agent. De cada visita guarda durante 90 días la hora, de dónde vino el visitante, su dispositivo, navegador, idioma, red y ubicación aproximada (unos 10 km en el mejor de los casos), junto con un hash unidireccional que cambia cada día. Los totales se conservan para siempre. Los bots conocidos y las vistas previas de enlaces no cuentan. Hay dos cosas que sí llegan a Google: las fuentes se cargan desde Google Fonts salvo que lo desactives en Apariencia, y una página con un video de YouTube carga su miniatura desde allí.

</details>

## Desarrollo

```sh
cp .dev.vars.example .dev.vars   # define ADMIN_PASSWORD para desarrollo local
pnpm dev                         # http://localhost:5173 , el panel está en /admin/
pnpm test                        # ejecuta las pruebas en el runtime de Workers
pnpm typecheck
```

La arquitectura, la estructura de carpetas y las convenciones de desarrollo están en [AGENTS.md](../AGENTS.md).

Tecnología: Cloudflare Workers, D1, KV, Analytics Engine, Hono, React 19, Vite y la [CLI `cf`](https://www.npmjs.com/package/cf).

## Licencia

- Programa principal: [AGPL-3.0-only](../LICENSE). Puedes alojarlo y modificarlo libremente; si lo usas para ofrecer un servicio público, también tienes que publicar el código fuente modificado.
- `src/templates/` (los temas y el renderizador de las páginas públicas) y `themes/` (las combinaciones de color de los temas): [MIT](../src/templates/LICENSE), para que sea fácil reutilizarlos.
