# GOING-MERRY — Cloudflare Pages e IMAP

Lee **ACTUALIZAR-ASUNTOS-Y-PERMISOS.md** antes de actualizar una instalación existente. Allí encontrarás los archivos exactos y los datos que debes conservar.

Se conserva la configuración propia de este proyecto: diseño, usuarios si existen, administrador, asuntos, buzones, ventana de búsqueda, límites de mensajes y salida de cuerpos/enlaces. No reemplaces datos actuales por archivos iniciales del ZIP.

Build: `npm run build`. Salida: `dist`. Variables: `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_FILE_PATH`, `GITHUB_BRANCH` y `MAILBOX_ENCRYPTION_KEY`. Conserva exactamente la clave de cifrado de Cloudflare. El token debe tener Contents: Read and write para el repositorio de este proyecto.

Los cambios de asuntos se guardan en `lib/mail-rules.js` mediante GitHub y necesitan terminar el despliegue para aplicarse a las búsquedas. El editor administra `codeSubjects` y conserva `linkSubjects`.

La tabla de usuarios incluye Consultas permitidas para códigos y enlaces, con todos habilitados por defecto. Los permisos individuales se guardan en `disabledSubjects` de `script.js` y se comprueban en el servidor en cada consulta. Las sesiones duran ocho horas; vuelve a iniciar sesión cuando venzan. Se conservan los correos autorizados donde el proyecto ya los tenía.

Pruebas: `npm test`. No se han usado credenciales reales ni modificado tu repositorio desde aquí. Comprueba tus consultas reales después de desplegar. No subas node_modules, dist ni secretos al repositorio.
