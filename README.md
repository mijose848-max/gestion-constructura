# Gestión Constructora · V25 con Google Drive

Aplicación HTML para gestionar obras, presupuestos, materiales, partes diarios, facturas y tesorería.

La versión actual está en `index.html`. Mantiene las mejoras de V25 y añade sincronización con Google Drive.

## Interfaz simplificada

La V25 organiza las secciones en un menú lateral por áreas. Cada pantalla muestra primero sus registros: el botón principal abre el formulario de alta y **Otras acciones** agrupa importación e impresión. Los formularios de edición se abren al pulsar Editar en una fila.

El resumen incluye accesos a Nueva obra, Nuevo parte y Nueva factura. Los listados de obras, clientes, proveedores, materiales y equipo incorporan búsqueda. En pantallas pequeñas, el menú se abre con el botón superior izquierdo.

**Conectar Drive** sigue en la barra superior. **Copias y opciones** reúne Exportar copia, Importar copia, Recuperar versión, Sincronizar ahora y las demás opciones de Drive. El rediseño mantiene los datos V25 existentes y la sincronización.

## Conectar Google Drive

1. Abre la aplicación publicada por HTTPS. Con GitHub Pages, la dirección habitual de este repositorio es `https://mijose848-max.github.io/gestion-constructura/`.
2. Pulsa **Conectar Drive**. Si aparece «Google preparado», vuelve a pulsar el botón para abrir la autorización.
3. Elige tu cuenta de Google y autoriza el acceso a los datos privados de esta aplicación.
4. Elige **Cargar la copia elegida de Drive** o **Usar estos datos locales y guardarlos en Drive**. No se elige una copia automáticamente al conectar.
5. Comprueba el mensaje **Sincronizado con Drive**. Los cambios posteriores se guardan localmente y se envían a Drive tras una pausa de dos segundos. La aplicación comprueba cambios remotos cada treinta segundos mientras está abierta y conectada.

La sesión de Google caduca y debe renovarse pulsando **Conectar Drive**. Si se pierde la conexión o caduca la sesión, los cambios permanecen en el navegador. Al reconectar, vuelve a elegir qué datos utilizar.

**Sincronizar ahora** comprueba los datos remotos y envía los cambios pendientes. **Desconectar** cierra la conexión de esta sesión y conserva los datos locales. No revoca los permisos otorgados a la aplicación en tu cuenta de Google.

## Copias y varios equipos

Cada sincronización crea una revisión JSON completa en el espacio privado `appDataFolder` de Google Drive. Estas revisiones no aparecen como archivos normales en Mi unidad. **Copias de Drive** permite elegir una revisión anterior y restaurarla como una revisión nueva. No se eliminan automáticamente las revisiones, que consumen espacio en la cuenta.

Las revisiones son inmutables y registran sus antecesoras. Si dos equipos guardan cambios distintos, ambas copias se conservan y se pausa la sincronización para que elijas cuál utilizar. No se mezclan registros automáticamente. Exporta una copia JSON si necesitas conservar o combinar manualmente datos de ambas ramas.

La copia original de V23 (`gestion-constructora-datos.json`) no se modifica. Si aún no hay datos V25 en esa cuenta y proyecto de Google, podrás cargarla para crear una copia V25 independiente. Las facturas antiguas marcadas como pagadas se migran con su saldo heredado; no se generan cobros o pagos ficticios.

Evita editar simultáneamente en varios equipos. En un equipo nuevo, conecta la misma cuenta y elige cargar Drive antes de empezar a introducir datos.

## Configuración de Google

Se reutiliza el identificador de cliente OAuth que ya tenía la V23. No se guarda ningún token de Google en el archivo HTML, GitHub ni el almacenamiento persistente del navegador. El identificador de cliente OAuth es público; no es una contraseña.

Si Google muestra `origin_mismatch`, el propietario del proyecto de Google Cloud debe añadir el origen de la web a los **Orígenes de JavaScript autorizados** del cliente OAuth. Para GitHub Pages de este usuario, es `https://mijose848-max.github.io`, sin ruta. El proyecto debe tener habilitada la API de Google Drive y permitir el acceso de la cuenta elegida. Si la aplicación está en pruebas, esa cuenta debe estar autorizada como usuario de prueba.

**Configurar Google** permite cambiar el identificador de cliente OAuth. Usar otro proyecto de Google puede impedir ver las copias privadas creadas por el proyecto anterior.

La conexión a Google necesita HTTPS o un servidor en localhost; no funciona abriendo el HTML con una dirección `file://`. El HTML descargado sigue funcionando con guardado local y exportación/importación JSON.

Documentación oficial: [datos privados de aplicación](https://developers.google.com/workspace/drive/api/guides/appdata), [autorización en navegador](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

## Mejoras de V25

- Cobros y pagos vinculados a facturas, incluidos pagos parciales.
- Pendientes por factura y listado de facturas vencidas.
- Filtros por búsqueda, obra, estado y fechas.
- Edición de conceptos con recálculo de importes.
- Control de números duplicados por proveedor.
- Diez versiones anteriores locales y deshacer la última eliminación hasta el siguiente cambio.
- Validación de importaciones y reversión si falla el guardado local.

## Pasar datos mediante una copia JSON

1. Abre la versión anterior en el mismo navegador y dirección donde la utilizabas y pulsa **Exportar copia**.
2. Abre V25, pulsa **Importar copia**, selecciona el JSON y confirma. Importar sustituye los datos locales actuales de V25.
3. Revisa obras, facturas y movimientos. En **Cuentas** puedes quitar una marca de pago heredada y vincular el movimiento real existente.
4. Si Drive está conectado y la sincronización está activa, la importación también se sincronizará como un cambio local.

Actualizar el código en GitHub no copia los datos de tu navegador. Conserva copias JSON externas: borrar los datos del navegador elimina el historial local. La V25 usa un almacenamiento local distinto del de versiones anteriores.

La página anterior del repositorio se conserva en [versiones/gestion_constructora_v23.html](versiones/gestion_constructora_v23.html). El ZIP anterior permanece disponible.

Los lectores PDF y Excel necesitan conexión para cargar sus bibliotecas. Los PDF escaneados no tienen OCR.

## Verificación

Ejecuta `node tests/drive-sync.cjs` con Node.js 22 o posterior. No requiere instalar paquetes ni conectarse a Google. Usa respuestas simuladas y un DOM mínimo; no sustituye una prueba visual ni una autorización real.

Las pruebas cubren alta y actualización de copias inmutables, sincronización entre equipos, conflicto de revisiones, cambios durante una subida, fallos de red, expiración, cierre de sesión, migración de V23, recuperación de revisiones, rechazo de datos inválidos y comprobación del permiso concedido. Las reglas económicas de V25 también se verificaron por separado.

La autorización real con la cuenta del usuario y la configuración de su proyecto de Google deben comprobarse desde la aplicación publicada.
