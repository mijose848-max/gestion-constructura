using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class Json {
 internal static string Write(object value) { return new JavaScriptSerializer { MaxJsonLength=67108864 }.Serialize(value); }
 internal static T Read<T>(string text) { return new JavaScriptSerializer { MaxJsonLength=67108864 }.Deserialize<T>(text); }
}
internal sealed class State {
 public long Revision {get;set;}
 public Dictionary<string,string> Values {get;set;}
 public string BackupFolder {get;set;}
 public State() { Values=new Dictionary<string,string>(); BackupFolder=""; }
}
internal sealed class StateStore {
 internal const string MainKey="gc_v25_prueba_tarifas";
 internal readonly string DirectoryPath;
 private readonly string path;
 private State state;
 private readonly object gate=new object();
 internal StateStore(string folder) {
  DirectoryPath=folder;Directory.CreateDirectory(folder);path=Path.Combine(folder,"estado.json");
  if(File.Exists(path)) { state=Json.Read<State>(File.ReadAllText(path,Encoding.UTF8)); if(state==null||state.Values==null)throw new Exception("El archivo de datos no es válido. Conserva la carpeta de datos para recuperarla."); }
  else state=new State();
 }
 internal object Snapshot() { lock(gate)return new {revision=state.Revision,values=new Dictionary<string,string>(state.Values),backupFolder=state.BackupFolder}; }
 internal long Revision { get {lock(gate)return state.Revision;} }
 private static State Copy(State s) {return new State {Revision=s.Revision,Values=new Dictionary<string,string>(s.Values),BackupFolder=s.BackupFolder};}
 private void Persist(State next) {
  string temp=path+"."+Guid.NewGuid().ToString("N")+".tmp";
  try {
   byte[] data=new UTF8Encoding(false).GetBytes(Json.Write(next));
   using(var f=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {f.Write(data,0,data.Length);f.Flush(true);}
   if(File.Exists(path)) {
    string history=Path.Combine(DirectoryPath,"Versiones");Directory.CreateDirectory(history);
    string previous=Path.Combine(history,DateTime.UtcNow.ToString("yyyyMMdd_HHmmss_fffffff",CultureInfo.InvariantCulture)+"_"+Guid.NewGuid().ToString("N")+".json");
    File.Replace(temp,path,previous,true);
    foreach(string old in Directory.GetFiles(history,"*.json").OrderByDescending(p=>p,StringComparer.Ordinal).Skip(20)) {try{File.Delete(old);}catch{}}
   } else File.Move(temp,path);
   state=next;
  } finally {if(File.Exists(temp))File.Delete(temp);}
 }
 internal object Set(long expected,string key,string value,bool remove) {
  lock(gate) {
   if(expected!=state.Revision)throw new ConflictException();
   if(String.IsNullOrEmpty(key)||key.Length>200||!key.StartsWith("gc_",StringComparison.Ordinal))throw new ArgumentException("Clave de datos no válida.");
   State next=Copy(state);if(remove)next.Values.Remove(key);else next.Values[key]=value;
   next.Revision++;Persist(next);
   string warning="";
   if(key==MainKey&&!remove&&!String.IsNullOrEmpty(state.BackupFolder)) {try{WriteBackup();}catch(Exception e){warning="Datos guardados en el equipo; no se pudo actualizar la copia: "+e.Message;}}
   return new {revision=state.Revision,backupWarning=warning};
  }
 }
 internal void ConfigureBackup(long expected,string folder) {lock(gate){if(expected!=state.Revision)throw new ConflictException();State next=Copy(state);next.BackupFolder=folder??"";next.Revision++;Persist(next);}}
 internal string BackupFolder {get{lock(gate)return state.BackupFolder;}}
 internal string WriteBackup() {
  lock(gate) {
   string data;if(!state.Values.TryGetValue(MainKey,out data))throw new Exception("Primero guarda o importa los datos del programa.");
   if(String.IsNullOrEmpty(state.BackupFolder))throw new Exception("Selecciona primero una carpeta para las copias.");
   Directory.CreateDirectory(state.BackupFolder);
   // La copia es un JSON de la aplicación, compatible con Importar copia.
   string target=Path.Combine(state.BackupFolder,"gestion-constructora-copia-local.json");
   string temp=target+"."+Guid.NewGuid().ToString("N")+".tmp";
   try {File.WriteAllText(temp,data,new UTF8Encoding(false));if(File.Exists(target))File.Replace(temp,target,null);else File.Move(temp,target);}finally{if(File.Exists(temp))File.Delete(temp);}
   return target;
  }
 }
}
internal sealed class ConflictException:Exception {internal ConflictException():base("Otra ventana ha cambiado los datos. Exporta tus cambios y vuelve a abrir el programa antes de guardar.") {}}
internal sealed class LocalServer:IDisposable {
 private readonly TcpListener listener;
 private readonly string www;
 private readonly StateStore store;
 private readonly Func<string> chooseFolder;
 private volatile bool stopped;
 internal readonly string Token;
 internal readonly string Origin;
 internal LocalServer(string assets,StateStore data,int port,Func<string> chooser) {
  www=Path.GetFullPath(assets);store=data;chooseFolder=chooser;Origin="http://localhost:"+port;
  byte[] bytes=new byte[32];using(var rng=RandomNumberGenerator.Create())rng.GetBytes(bytes);Token=Convert.ToBase64String(bytes);
  listener=new TcpListener(IPAddress.Loopback,port);
 }
 internal void Start(){listener.Start(32);var t=new Thread(AcceptLoop);t.IsBackground=true;t.Start();}
 private void AcceptLoop(){while(!stopped){try{TcpClient client=listener.AcceptTcpClient();ThreadPool.QueueUserWorkItem(delegate {using(client)Handle(client);});}catch(SocketException){if(!stopped)Thread.Sleep(100);}catch(ObjectDisposedException){return;}}}
 private void Handle(TcpClient client) {
  client.ReceiveTimeout=15000;client.SendTimeout=15000;
  try {
   using(NetworkStream stream=client.GetStream()) {
    var header=new List<byte>();int b;
    while((b=stream.ReadByte())!=-1){header.Add((byte)b);int n=header.Count;if(n>16384){Respond(stream,413,"application/json",Json.Write(new {error="Cabecera demasiado grande"}));return;}if(n>=4&&header[n-4]==13&&header[n-3]==10&&header[n-2]==13&&header[n-1]==10)break;}
    string[] lines=Encoding.ASCII.GetString(header.ToArray()).Split(new[]{"\r\n"},StringSplitOptions.None);string[] first=lines[0].Split(' ');if(first.Length!=3)return;
    string method=first[0],route=first[1].Split('?')[0];
    var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
    foreach(string line in lines.Skip(1)){int i=line.IndexOf(':');if(i>0)headers[line.Substring(0,i).Trim()]=line.Substring(i+1).Trim();}
    string host;headers.TryGetValue("Host",out host);
    if(host!=new Uri(Origin).Authority&&host!="127.0.0.1:"+new Uri(Origin).Port){Respond(stream,403,"application/json",Json.Write(new {error="Host no permitido"}));return;}
    string origin;headers.TryGetValue("Origin",out origin);if(!String.IsNullOrEmpty(origin)&&origin!=Origin){Respond(stream,403,"application/json",Json.Write(new {error="Origen no permitido"}));return;}
    if(route.StartsWith("/api/",StringComparison.Ordinal)){
     string auth;headers.TryGetValue("X-GC-Token",out auth);if(auth!=Token){Respond(stream,401,"application/json",Json.Write(new {error="Acceso local no autorizado"}));return;}
     if(method!="GET"&&method!="POST"){Respond(stream,405,"application/json","{}");return;}
     long length=0;string lengthText;if(headers.TryGetValue("Content-Length",out lengthText)&&(!Int64.TryParse(lengthText,out length)||length<0||length>67108864)){Respond(stream,413,"application/json","{}");return;}
     if(method=="POST"){string contentType;headers.TryGetValue("Content-Type",out contentType);if(contentType==null||!contentType.StartsWith("application/json",StringComparison.OrdinalIgnoreCase)){Respond(stream,415,"application/json","{}");return;}}
     byte[] body=new byte[(int)length];int read=0;while(read<body.Length){int n=stream.Read(body,read,body.Length-read);if(n==0)throw new IOException("Petición incompleta");read+=n;}
     try {
      object result;
      if(method=="GET"&&route=="/api/storage")result=store.Snapshot();
      else if(method=="POST"&&route=="/api/storage") {
       var data=Json.Read<Dictionary<string,object>>(Encoding.UTF8.GetString(body));
       string key=Convert.ToString(data["key"],CultureInfo.InvariantCulture);bool remove=data.ContainsKey("remove")&&Convert.ToBoolean(data["remove"],CultureInfo.InvariantCulture);
       result=store.Set(Convert.ToInt64(data["expectedRevision"],CultureInfo.InvariantCulture),key,remove?null:Convert.ToString(data["value"],CultureInfo.InvariantCulture),remove);
      } else if(method=="POST"&&route=="/api/data-folder"){Process.Start("explorer.exe",Quote(store.DirectoryPath));result=new {ok=true};}
      else if(method=="POST"&&route=="/api/backup/configure") {var command=Json.Read<Dictionary<string,object>>(Encoding.UTF8.GetString(body));long expected=Convert.ToInt64(command["expectedRevision"],CultureInfo.InvariantCulture);if(expected!=store.Revision)throw new ConflictException();string folder=chooseFolder();if(folder==null)result=new {cancelled=true};else{store.ConfigureBackup(expected,folder);result=store.Snapshot();}}
      else if(method=="POST"&&route=="/api/backup/disconnect") {var command=Json.Read<Dictionary<string,object>>(Encoding.UTF8.GetString(body));store.ConfigureBackup(Convert.ToInt64(command["expectedRevision"],CultureInfo.InvariantCulture),"");result=store.Snapshot();}
      else if(method=="POST"&&route=="/api/backup/now"){result=new {path=store.WriteBackup()};}
      else if(method=="POST"&&route=="/api/backup/folder") {if(String.IsNullOrEmpty(store.BackupFolder))throw new Exception("No hay carpeta de copias configurada.");Process.Start("explorer.exe",Quote(store.BackupFolder));result=new {ok=true};}
      else {Respond(stream,404,"application/json","{}");return;}
      Respond(stream,200,"application/json; charset=utf-8",Json.Write(result));
     }catch(ConflictException e){Respond(stream,409,"application/json",Json.Write(new {error=e.Message}));}
     catch(Exception e){Respond(stream,400,"application/json; charset=utf-8",Json.Write(new {error=e.Message}));}
     return;
    }
    if(method!="GET"){Respond(stream,405,"text/plain","Método no permitido");return;}
    // Lista cerrada: nunca sirve archivos de datos ni rutas arbitrarias del disco.
    var assets=new Dictionary<string,string>{{"/","index.html"},{"/index.html","index.html"},{"/desktop-storage.js","desktop-storage.js"},{"/vendor/pdf.mjs","vendor/pdf.mjs"},{"/vendor/pdf.worker.mjs","vendor/pdf.worker.mjs"},{"/vendor/xlsx.full.min.js","vendor/xlsx.full.min.js"}};
    string relative;if(!assets.TryGetValue(route,out relative)){
     relative=null;foreach(string dir in new[]{"cmaps","standard_fonts","wasm"}){string prefix="/vendor/"+dir+"/";if(route.StartsWith(prefix,StringComparison.Ordinal)){string name=route.Substring(prefix.Length);if(System.Text.RegularExpressions.Regex.IsMatch(name,@"^[A-Za-z0-9_.-]+$"))relative="vendor/"+dir+"/"+name;}}
     if(relative==null){Respond(stream,404,"text/plain","No encontrado");return;}
    }
    string file=Path.Combine(www,relative.Replace('/',Path.DirectorySeparatorChar));
    if(!File.Exists(file)){Respond(stream,404,"text/plain","Falta un archivo del programa: "+relative);return;}
    string mime=relative.EndsWith(".html",StringComparison.Ordinal)?"text/html; charset=utf-8":relative.EndsWith(".js",StringComparison.Ordinal)||relative.EndsWith(".mjs",StringComparison.Ordinal)?"text/javascript; charset=utf-8":relative.EndsWith(".wasm",StringComparison.Ordinal)?"application/wasm":"application/octet-stream";
    if(relative!="index.html"){RespondBytes(stream,200,mime,File.ReadAllBytes(file));return;}
    string text=File.ReadAllText(file,Encoding.UTF8);
    if(relative=="index.html")text=text.Replace("<!-- GC_DESKTOP_BOOTSTRAP -->","<script>window.GC_DESKTOP_CONFIG="+Json.Write(new {token=Token})+";</script>");
    Respond(stream,200,mime,text);
   }
  }catch(IOException){}catch(SocketException){}catch(Exception){}
 }
 private static void Respond(Stream stream,int status,string type,string body) {
  RespondBytes(stream,status,type,Encoding.UTF8.GetBytes(body));
 }
 private static void RespondBytes(Stream stream,int status,string type,byte[] bytes) {
  string reason=status==200?"OK":status==404?"Not Found":"Error";
  string headers="HTTP/1.1 "+status+" "+reason+"\r\nContent-Type: "+type+"\r\nContent-Length: "+bytes.Length+"\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'\r\n\r\n";
  byte[] head=Encoding.ASCII.GetBytes(headers);stream.Write(head,0,head.Length);stream.Write(bytes,0,bytes.Length);stream.Flush();
 }
 internal static string Quote(string path){return "\""+path.Replace("\"","")+"\"";}
 public void Dispose(){stopped=true;listener.Stop();}
}
internal static class Program {
 private const int DefaultPort=49371;
 private static string AppRoot {get{return AppDomain.CurrentDomain.BaseDirectory;}}
 private static string DataRoot {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"GestionConstructora","Datos");}}
 [STAThread] private static int Main(string[] args) {
  try {
   if(args.Contains("--selftest")){SelfTest();return 0;}
   if(args.Contains("--install")){Install();return 0;}
   bool headless=args.Contains("--headless");int port=DefaultPort;string data=DataRoot;
   if(headless){int p=Array.IndexOf(args,"--port");if(p>=0)port=Int32.Parse(args[p+1],CultureInfo.InvariantCulture);int d=Array.IndexOf(args,"--data-dir");if(d>=0)data=Path.GetFullPath(args[d+1]);}
   bool created;using(var mutex=new Mutex(true,"Local\\GestionConstructoraV25_"+port,out created)) {
    if(!created){if(!headless)OpenBrowser("http://localhost:"+port);return 0;}
    Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
    var store=new StateStore(data);Form ui=null;
    if(!headless){ui=new Form();ui.ShowInTaskbar=false;ui.FormBorderStyle=FormBorderStyle.FixedToolWindow;ui.WindowState=FormWindowState.Minimized;var unused=ui.Handle;}
    Func<string> choose=delegate {
     if(headless)throw new Exception("Esta opción requiere la ventana de Windows.");
     return (string)ui.Invoke(new Func<string>(delegate {using(var dialog=new FolderBrowserDialog()){dialog.Description="Elige una carpeta para las copias JSON. Puede ser una carpeta de Drive para escritorio, un disco externo u otra carpeta.";dialog.SelectedPath=store.BackupFolder;return dialog.ShowDialog()==DialogResult.OK?dialog.SelectedPath:null;}}));
    };
    using(var server=new LocalServer(Path.Combine(AppRoot,"www"),store,port,choose)) {
     server.Start();if(headless){new ManualResetEvent(false).WaitOne();return 0;}
     using(var tray=new NotifyIcon()) {
      tray.Text="Gestión Constructora · datos locales";tray.Icon=Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);tray.Visible=true;
      var menu=new ContextMenuStrip();menu.Items.Add("Abrir programa",null,delegate{OpenBrowser(server.Origin);});menu.Items.Add("Abrir carpeta de datos",null,delegate{Process.Start("explorer.exe",LocalServer.Quote(store.DirectoryPath));});menu.Items.Add("Crear acceso directo en el escritorio",null,delegate{CreateShortcut(Assembly.GetExecutingAssembly().Location);MessageBox.Show("Acceso directo creado.","Gestión Constructora");});menu.Items.Add("Cerrar programa",null,delegate{Application.ExitThread();});tray.ContextMenuStrip=menu;tray.DoubleClick+=delegate{OpenBrowser(server.Origin);};
      OpenBrowser(server.Origin);Application.Run();tray.Visible=false;
     }
    }
    if(ui!=null)ui.Dispose();mutex.ReleaseMutex();
   }
   return 0;
  }catch(Exception e){if(args.Contains("--headless")||args.Contains("--selftest"))File.WriteAllText(Path.Combine(AppRoot,"error-prueba.txt"),e.ToString());else MessageBox.Show("No se pudo abrir Gestión Constructora.\n\n"+e.Message+"\n\nTus datos se conservan en:\n"+DataRoot,"Gestión Constructora",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
 private static void OpenBrowser(string url) {
  var candidates=new[]{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),"Microsoft","Edge","Application","msedge.exe"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Microsoft","Edge","Application","msedge.exe"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Google","Chrome","Application","chrome.exe")};
  string browser=candidates.FirstOrDefault(File.Exists);
  if(browser==null){Process.Start(url);return;}
  string profile=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"GestionConstructora","Navegador");
  Process.Start(new ProcessStartInfo(browser,"--app="+url+" --user-data-dir="+LocalServer.Quote(profile)){UseShellExecute=true});
 }
 private static void Install() {
  string target=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"GestionConstructora","Programa","V25-Windows-20261030");Directory.CreateDirectory(target);
  string exe=Path.Combine(target,"GestionConstructora.exe");
  if(!String.Equals(Path.GetFullPath(exe),Path.GetFullPath(Assembly.GetExecutingAssembly().Location),StringComparison.OrdinalIgnoreCase)){
   File.Copy(Assembly.GetExecutingAssembly().Location,exe,true);CopyDirectory(Path.Combine(AppRoot,"www"),Path.Combine(target,"www"));
  }
  CreateShortcut(exe);Process.Start(exe);
 }
 private static void CopyDirectory(string source,string target){Directory.CreateDirectory(target);foreach(string f in Directory.GetFiles(source))File.Copy(f,Path.Combine(target,Path.GetFileName(f)),true);foreach(string folder in Directory.GetDirectories(source))CopyDirectory(folder,Path.Combine(target,Path.GetFileName(folder)));}
 private static void CreateShortcut(string exe) {
  Type t=Type.GetTypeFromProgID("WScript.Shell");object shell=Activator.CreateInstance(t);
  object shortcut=t.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"Gestion Constructora.lnk")});Type s=shortcut.GetType();
  s.InvokeMember("TargetPath",BindingFlags.SetProperty,null,shortcut,new object[]{exe});s.InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,shortcut,new object[]{Path.GetDirectoryName(exe)});s.InvokeMember("Description",BindingFlags.SetProperty,null,shortcut,new object[]{"Gestión Constructora · versión local para Windows"});s.InvokeMember("Save",BindingFlags.InvokeMethod,null,shortcut,null);
 }
 private static void SelfTest() {
  string folder=Path.Combine(Path.GetTempPath(),"gc-test-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);
  try {
   var s=new StateStore(folder);s.Set(0,StateStore.MainKey,"{\"obras\":[]}",false);if(s.Revision!=1)throw new Exception("revision");
   var loaded=new StateStore(folder);if(loaded.Revision!=1)throw new Exception("persistencia");
   bool conflict=false;try{loaded.Set(0,StateStore.MainKey,"ERROR",false);}catch(ConflictException){conflict=true;}if(!conflict)throw new Exception("conflicto");
   string backup=Path.Combine(folder,"Copia");loaded.ConfigureBackup(loaded.Revision,backup);loaded.WriteBackup();if(File.ReadAllText(Path.Combine(backup,"gestion-constructora-copia-local.json"))!="{\"obras\":[]}")throw new Exception("copia");
   loaded.Set(loaded.Revision,StateStore.MainKey,"{\"obras\":[{\"id\":\"a\"}]}",false);if(!File.ReadAllText(Path.Combine(backup,"gestion-constructora-copia-local.json")).Contains("\"a\""))throw new Exception("copia automatica");
   if(Directory.GetFiles(Path.Combine(folder,"Versiones")).Length<2)throw new Exception("historial");
  }finally{Directory.Delete(folder,true);}
 }
}
