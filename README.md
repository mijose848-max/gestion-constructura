# Gestión Constructora · V25

Aplicación HTML para gestionar obras, presupuestos, materiales, partes diarios, facturas y tesorería.

## Abrir el programa

La versión actual está en `index.html`. Descarga el archivo y ábrelo en un navegador. Si ya usas una publicación de este repositorio, la página principal utiliza este archivo.

## Mejoras de V25

- Cobros y pagos vinculados a facturas, incluidos pagos parciales.
- Pendientes por factura y listado de facturas vencidas.
- Filtros por búsqueda, obra, estado y fechas.
- Edición de conceptos con recálculo de los importes.
- Control de números duplicados por proveedor.
- Diez versiones anteriores locales y deshacer la última eliminación hasta el siguiente cambio.
- Validación de importaciones y aviso con reversión si falla el guardado.

## Pasar los datos a V25

1. Antes de cambiar de versión, abre la versión anterior en el mismo navegador y dirección donde la utilizabas y pulsa **Exportar copia**.
2. Abre V25 y pulsa **Importar copia**, selecciona el JSON y confirma. Importar sustituye los datos actuales de V25.
3. Comprueba obras, facturas y movimientos. Las marcas antiguas de pagada se conservan como saldo heredado sin generar movimientos ficticios. En **Cuentas**, puedes quitar esa marca y vincular el movimiento real existente.

V25 guarda sus datos por separado de las versiones anteriores. Actualizar el código en GitHub no copia ni sincroniza los datos del navegador. Conserva copias JSON externas: el historial local puede perderse si se borran los datos del navegador.

La página anterior del repositorio se conserva en [versiones/gestion_constructora_v23.html](versiones/gestion_constructora_v23.html). El archivo ZIP anterior permanece disponible.

## Alcance de la prueba

La V25 conserva el funcionamiento local. La sincronización con Google Drive de V23 no está incluida. Los lectores PDF y Excel necesitan conexión para cargar sus bibliotecas; los PDF escaneados no tienen OCR.

Se comprobaron las reglas de pagos parciales y completos, sobrepagos, borrado y deshacer de pagos, duplicados por proveedor, edición de líneas, recuperación y fallos de guardado. Queda pendiente la revisión visual en un navegador real.
