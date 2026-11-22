# GOING-MERRY 1.3 — Asuntos y consultas permitidas por usuario

## Cómo usarlo

1. Entra en Administrar con tu administrador habitual.
2. Debajo de Buzones aparece Asuntos de códigos. Agrega asuntos uno por línea, separados por coma o punto y coma, o como lista JSON. Puedes editar y eliminar los existentes. Para conservar una coma dentro de un asunto, escríbelo entre comillas dobles o utiliza una lista JSON.
3. En Usuarios existentes aparece la columna Consultas permitidas. Haz clic en Todos habilitados · editar o Ver / editar permisos.
4. Aparecen los asuntos de códigos y de enlaces, sin duplicados. Marcado significa permitido. Desmarca los que quieras bloquear para ese usuario y pulsa Guardar permisos.
5. Habilitar todos y Deshabilitar todos sirven para marcar o desmarcar en conjunto. Siempre pulsa Guardar permisos después.
6. Un usuario diferente conserva su propia selección. Al crear usuarios, todos los asuntos están habilitados; los usuarios antiguos también comienzan así.

Los cambios de asuntos se guardan en `lib/mail-rules.js` de GitHub y necesitan que Cloudflare termine el despliegue para incorporarse a las búsquedas. El panel distingue asuntos publicados y pendientes. El editor modifica `codeSubjects`; conserva `linkSubjects` sin cambios. Los asuntos de enlaces también están disponibles en las casillas de cada usuario.

Los permisos se guardan como `disabledSubjects` dentro del usuario en `const USERS` de `script.js`, sin tocar el resto del archivo. La ausencia del campo o una lista vacía significa que todo está permitido. Se conservan usuario, contraseña, vencimiento y correos autorizados. Un asunto nuevo, o uno renombrado a un nombre distinto, está habilitado por defecto. Los nombres se comparan exactamente, incluidos acentos y mayúsculas.

El servidor lee los permisos actuales de GitHub en cada consulta: no hay que esperar otro despliegue para bloquear o habilitar asuntos existentes. Se comprueban sesión, vencimiento y correos permitidos. Una sesión dura hasta 8 horas; si vence, vuelve a cargar la página e inicia sesión. Cambiar la contraseña o eliminar el usuario invalida su sesión. Una lista de correos vacía mantiene el comportamiento anterior: permite cualquier dirección.

Se conserva la búsqueda IMAP, los reenvíos, alias y extensiones Gmail, la prioridad de códigos y el formato de resultados: cuerpo del mensaje en el modal o redirección al enlace. Un mensaje cuyo asunto coincida con una regla deshabilitada no se muestra; esa restricción tiene prioridad si también coincide con una regla general habilitada. Si un correo reenviado/adjunto contiene un mensaje bloqueado para ese destinatario, se omite el correo completo para no mostrarlo a través del mensaje exterior.

## Actualizar el repositorio que ya está funcionando

Primero descarga una copia de tu repositorio actual. Copia estos archivos del ZIP respetando las carpetas:

- `admin.html`
- `index.html` (solo añade la carga de `user-session.js`; conserva tus cambios visuales si modificaste tu copia)
- `subjects-admin.js`
- `user-permissions.js`
- `user-session.js`
- `functions/api/subjects.js`
- `functions/api/login.js`
- `functions/api/updateusers.js`
- `lib/subjects-store.js`
- `lib/subjects-handler.js`
- `lib/user-auth.js`
- `lib/users.js`
- `lib/consult-handler.js`
- `lib/imap-mail.js`
- `build.mjs`
- `_headers`
- `package.json`
- `package-lock.json`

**Conserva tu `script.js` actual:** no hace falta reemplazarlo; contiene tus usuarios más recientes. El nuevo archivo `user-session.js` se conecta al formulario existente. Conserva también tu `mailboxes.json` actual, `lib/mail-rules.js`, imágenes y estilos. El ZIP incluye los datos de la versión que compartiste, no los cambios posteriores que hayas hecho en tu repositorio.

Si cambiaste tu administrador o su vencimiento, conserva tus valores actuales de `FIXED_ADMIN` al actualizar `functions/api/updateusers.js`. No reemplaces buzones reales por el `mailboxes.json` vacío del ZIP.

No subas `node_modules`, `dist`, `.env` ni `.dev.vars`. Mantén Pages conectado al repositorio, `npm run build` y salida `dist`. Espera a que el despliegue termine y recarga la página.

## Variables: las mismas cinco

- `GITHUB_TOKEN`: secreto, permiso Contents: Read and write para este repositorio.
- `GITHUB_REPO`: propietario/repositorio de GOING-MERRY.
- `GITHUB_FILE_PATH`: `script.js`.
- `GITHUB_BRANCH`: `main` o tu rama real.
- `MAILBOX_ENCRYPTION_KEY`: conserva exactamente tu clave actual.

No hay variables nuevas. La clave de cifrado existente también firma las sesiones del usuario con un contexto separado; no tienes que escribirla en el proyecto ni en el panel.

## Comprobación después de subir

1. Inicia sesión con un usuario y consulta un correo que ya funcionaba.
2. En el administrador, desmarca uno de sus asuntos y guarda.
3. Vuelve a consultarlo con ese usuario: el mensaje bloqueado no debe aparecer. Prueba también otro asunto permitido.
4. Comprueba que otro usuario con ese asunto habilitado sigue recibiendo su resultado.
5. Vuelve a habilitarlo y guarda; debería aparecer de nuevo si el mensaje sigue dentro de los diez minutos originales.
6. Agrega un asunto, espera el despliegue y comprueba que aparece habilitado por defecto en las listas.

Validación incluida: CRUD de usuarios y buzones, conservación de los usuarios de origen, MIME/reenvíos/alias, prioridades y enlaces, edición de asuntos, permisos independientes y persistentes, sesiones firmadas, protección contra guardados simultáneos y prueba DOM del desplegable real del administrador. Compilación de Functions con Wrangler. No se han usado tus credenciales reales ni modificado tu repositorio desde aquí; la conexión real se comprueba después del despliegue.
