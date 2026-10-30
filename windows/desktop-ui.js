
// Edición Windows: copias a carpeta local. No inicia sesiones ni conexiones a Google.
(()=>{
 const store=window.desktopStorage;
 function status(){gcDriveStatus(window.GC_DESKTOP_BACKUP_WARNING?'⚠ '+window.GC_DESKTOP_BACKUP_WARNING:store.backupFolder?'✓ Copias automáticas en carpeta configurada':'Datos guardados en este ordenador');}
 gcDriveReady=false;gcDriveSchedule=function(){};gcDriveChanged=function(){status();};
 gcDriveConnect=async function(){try{const result=await store.command('/api/backup/configure');if(result.cancelled)return;store.applySnapshot(result);status();try{await store.command('/api/backup/now');gcDriveStatus('✓ Copia guardada en la carpeta elegida');}catch(e){alert('Carpeta configurada. '+e.message);}}catch(e){alert(e.message);}};
 gcDriveSync=async function(){try{if(!store.backupFolder){await gcDriveConnect();return;}await store.command('/api/backup/now');window.GC_DESKTOP_BACKUP_WARNING='';gcDriveStatus('✓ Copia guardada en la carpeta elegida');}catch(e){gcDriveStatus('Datos locales conservados · copia pendiente');alert(e.message);}};
 gcDriveHistory=async function(){try{await store.command('/api/backup/folder');}catch(e){alert(e.message);}};
 gcDriveDisconnect=async function(){try{store.applySnapshot(await store.command('/api/backup/disconnect'));window.GC_DESKTOP_BACKUP_WARNING='';status();}catch(e){alert(e.message);}};
 gcDriveSettings=gcDriveConnect;
 const labels=[['gcDriveConnect()','Carpeta de copias'],['gcDriveSync()','Guardar copia ahora'],['gcDriveHistory()','Abrir carpeta de copias'],['gcDriveDisconnect()','Desactivar copias externas'],['gcDriveSettings()','Cambiar carpeta de copias']];
 for(const [handler,label] of labels){const button=document.querySelector('button[onclick="'+handler+'"]');if(button)button.textContent=label;}
 document.querySelectorAll('.ui-menu-caption').forEach(e=>{if(e.textContent==='Google Drive')e.textContent='Copias externas';});
 const menu=document.querySelector('.ui-top-actions .ui-menu-content');if(menu){const b=document.createElement('button');b.type='button';b.textContent='Abrir carpeta de datos del equipo';b.onclick=async()=>{try{await store.command('/api/data-folder');}catch(e){alert(e.message);}};menu.append(b);}
 const breadcrumb=document.querySelector('.ui-breadcrumb');if(breadcrumb)breadcrumb.textContent='Windows · datos en este ordenador';
 const guide=document.querySelector('.ui-guide .notice');if(guide)guide.textContent='Los datos se guardan en archivos de este ordenador, fuera del navegador. Exporta copias JSON o configura una carpeta de copias. Si eliges una carpeta de Drive para escritorio, Google se encargará de sincronizarla cuando haya conexión. Cierra el programa desde su icono junto al reloj de Windows.';
 const footer=document.querySelector('body > footer');if(footer)footer.textContent='Gestión Constructora · V25 Windows local · Importes sin IVA salvo indicación';
 status();
})();
