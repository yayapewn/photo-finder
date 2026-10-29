import {chooseCategory} from './categories.js';
const $=id=>document.getElementById(id);
const VERSION='chinese-clip-q8-v1';
let photos=[],results=null,selected=new Set(),busy=false,stop=false,page=80,worker,seq=0,pending=new Map(),db,storageWarning=false,backend='尚未啟動 AI';
let categoryPlan=null;
// Product names follow https://www.paiho.com/tw/ . Descriptions guide similarity; they are not material verification.
const AUTO_CATEGORIES=[
 {name:'射出勾',prompt:'射出勾產品特寫，塑膠薄片表面排列細小的鉤子，用來扣合的塑膠勾面。'},
 {name:'粘扣帶',prompt:'粘扣帶魔鬼氈產品特寫，帶狀尼龍勾面與毛圈面，成卷或裁切的黏扣帶。'},
 {name:'數位梭織緹花布',prompt:'數位梭織緹花布產品特寫，織有彩色圖案與細緻紋理的布料樣片或一片式鞋面。'},
 {name:'四面彈',prompt:'四面彈布料產品特寫，寬幅針織彈性面料，帶網孔紋理的運動鞋內套布料。'},
 {name:'經編針織緹花網布',prompt:'經編針織緹花網布產品特寫，具有開孔網眼與針織花紋的網狀布料樣片。'},
 {name:'鬆緊帶',prompt:'鬆緊帶產品特寫，窄幅扁平的彈性帶，衣物腰帶或帶字樣的彈力織帶。'},
 {name:'織帶',prompt:'織帶產品特寫，窄長扁平的編織帶，織有條紋與紋理的彩色帶子或帶卷。'},
 {name:'鞋帶｜拉繩',prompt:'鞋帶或拉繩產品特寫，編織的圓繩或扁繩，細長的鞋帶、抽繩與繩圈。'},
 {name:'束頭',prompt:'束頭產品特寫，鞋帶或繩子末端的小型金屬或塑膠套管、繩頭配件。'},
 {name:'反光材料',prompt:'反光材料產品特寫，反光膜、反光條與彩虹薄膜，銀色或彩色閃亮表面的材料樣片。'},
 {name:'保溫材料',prompt:'保溫材料產品特寫，蓬鬆纖維棉片、保暖填充層與薄片狀絮棉材料。'},
 {name:'紗線',prompt:'紗線產品特寫，纏在筒管上的細紗、線軸、紗筒與成束的纖維線。'},
 {name:'非產品照片',prompt:'人物合照、旅遊風景、動物或美食的生活照片。',reject:true},
 {name:'文件畫面',prompt:'文件表格、電腦螢幕截圖或辦公簡報畫面。',reject:true},
 {name:'成品展示',prompt:'完整的鞋子、衣服或包包成品展示，穿著服飾鞋子的模特兒。',reject:true}
];
const setStatus=(s,error=false)=>{$('status').textContent=s;$('status').classList.toggle('error',error)};
const dbReady=new Promise(resolve=>{
 let settled=false;const finish=value=>{if(settled){value?.close();return}settled=true;clearTimeout(timer);db=value;storageWarning=!value;resolve()};
 const timer=setTimeout(()=>finish(),2500);
 try{const r=indexedDB.open('shiguang-local',1);r.onupgradeneeded=()=>{r.result.createObjectStore('vectors');r.result.createObjectStore('settings')};r.onsuccess=()=>finish(r.result);r.onerror=r.onblocked=()=>finish()}catch{finish()}
});
async function read(store,key){await dbReady;if(!db)return;return new Promise(resolve=>{const timer=setTimeout(()=>{storageWarning=true;resolve()},2500);const done=value=>{clearTimeout(timer);resolve(value)};try{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>done(r.result);r.onerror=()=>done()}catch{done()}})}
async function write(store,key,value){await dbReady;if(!db)return;return new Promise(resolve=>{const timer=setTimeout(()=>{storageWarning=true;resolve()},2500);const done=()=>{clearTimeout(timer);resolve()};try{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=done;tx.onerror=tx.onabort=()=>{storageWarning=true;done()}}catch{storageWarning=true;done()}})}
function controls(){categoryControls(); $('index').disabled=busy||!photos.some(p=>!p.vector);$('index').hidden=true;$('rememberFolder').disabled=$('pick').disabled=$('folder').disabled=$('reconnect').disabled=$('clear').disabled=busy;$('search').disabled=busy||!photos.length;$('zip').disabled=$('copy').disabled=busy||!selected.size;$('selectAll').disabled=$('unselect').disabled=busy;$('selected').textContent=`已選取 ${selected.size} 張`;$('count').textContent=`${photos.length} 張照片 · ${photos.filter(p=>p.vector).length} 張已分析`;}
function visible(){let a=results===null?photos:results.filter(p=>p.score>=Number($('threshold').value));return $('limit').value==='all'?a:a.slice(0,Number($('limit').value))}
function render(){const list=visible();$('grid').replaceChildren();$('empty').hidden=!!list.length;$('empty').querySelector('h3').textContent=photos.length?'目前沒有符合篩選的照片':'你的回憶，只有你能看見。';$('empty').querySelector('p').textContent=photos.length?'試試降低最低相似度，或換一種描述。':'選擇資料夾 → 輸入描述 → 按搜尋';$('resultTitle').textContent=results===null?'照片預覽':'搜尋結果';$('resultNote').textContent=photos.length?`${list.length} 張 · ${results===null?'尚未搜尋的照片依選入順序排列':'依相似度排序；分數不是辨識正確率'}`:'選取照片後，會顯示在這裡';$('reset').hidden=results===null;
 for(const p of list.slice(0,page)){const label=document.createElement('label');label.className='card';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(p.id);checkbox.disabled=busy;checkbox.setAttribute('aria-label',`選取 ${p.name}`);checkbox.onchange=()=>{checkbox.checked?selected.add(p.id):selected.delete(p.id);controls()};const img=document.createElement('img');img.src=p.thumb||p.url;img.alt=p.name;img.loading='lazy';const meta=document.createElement('div');meta.className='meta';const name=document.createElement('b');name.textContent=p.name;const note=document.createElement('small');note.textContent=results===null?(p.vector?'已分析':p.failed?'無法分析，可重試搜尋':'按搜尋後分析'):`相似度 ${p.score.toFixed(3)}`;meta.append(name,note);label.append(checkbox,img,meta);$('grid').append(label)}$('more').hidden=list.length<=page;controls();}
function fail(name,error){$('errors').hidden=false;const li=document.createElement('li');li.textContent=`${name}：${error}`;$('errorList').append(li)}
async function getFile(p){const f=p.handle?await p.handle.getFile():p.file;if(!f)throw new Error('請重新選取原檔');if(f.size!==p.size||f.lastModified!==p.modified)throw new Error('原檔已變更，請重新選取並建立索引');return f}
async function fingerprint(file){const sample=await file.arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',sample);return VERSION+':'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}
async function add(items){if(busy)return;busy=true;controls();results=null;categoryPlan=null;$('categorySummary').replaceChildren();$('categoryPreview').replaceChildren();$('categoryStatus').textContent='分類為選用功能，按「自動分類全部照片」才會開始。';const known=new Set(photos.map(p=>p.id));let added=0;try{for(const item of items){const f=item.file;if(!f.type.startsWith('image/')&&!/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|dng)$/i.test(f.name))continue;const path=item.path||f.webkitRelativePath||f.name;const id=path+':'+f.size+':'+f.lastModified;if(known.has(id))continue;known.add(id);photos.push({id,path,name:f.name,size:f.size,modified:f.lastModified,file:item.handle?null:f,handle:item.handle,url:URL.createObjectURL(f)});added++}setStatus(`已加入 ${added} 張照片，共 ${photos.length} 張。${photos.length?"請輸入描述並按搜尋；也可另外選擇分類。":"沒有找到支援的圖片，請確認資料夾內容。"}`)}finally{busy=false;render()}}
$('pick').onclick=()=>$('files').click();$('files').onchange=async e=>{const items=[...e.target.files].map(file=>({file}));e.target.value='';await add(items)};
async function walk(dir,prefix=''){const out=[];for await(const [name,h]of dir.entries()){if(h.kind==='directory')out.push(...await walk(h,prefix+name+'/'));else if(/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|dng)$/i.test(name)){try{setStatus('正在讀取照片：'+prefix+name);out.push({file:await h.getFile(),handle:h,path:prefix+name})}catch(e){fail(prefix+name,e.message)}}}return out}
async function directory(h){busy=true;controls();setStatus('正在讀取資料夾與子資料夾，請稍候…');try{const items=await walk(h);busy=false;await add(items);$('reconnect').hidden=false;void write('settings','folder',h)}catch(e){setStatus('無法讀取資料夾：'+e.message,true)}finally{busy=false;controls()}}
$('folder').onclick=()=>{setStatus('請在選取視窗中選擇資料夾並確認。照片只會在本機讀取，不會上傳。');$('folderFiles').click()};
$('rememberFolder').onclick=async()=>{setStatus('正在開啟可記住位置的資料夾選取器；若沒有視窗，請改按「選擇資料夾」。');if(!window.showDirectoryPicker){$('folderFiles').click();return}try{const h=await showDirectoryPicker({mode:'read'});await directory(h)}catch(e){setStatus(e.name==='AbortError'?'未取得資料夾。請改按「選擇資料夾」重試。':'無法選取資料夾：'+e.message+'。請改按「選擇資料夾」。',true)}};
$('folderFiles').onchange=async e=>{const files=[...e.target.files];e.target.value='';if(!files.length){setStatus('沒有收到檔案，請重新選擇含有照片的資料夾。',true);return}setStatus('已收到 '+files.length+' 個檔案，正在載入照片…');try{await add(files.map(file=>({file})))}catch(error){setStatus('載入資料夾失敗：'+error.message,true)}};
$('folderFiles').oncancel=()=>setStatus('已取消選取，或瀏覽器未傳回資料夾。可重新選擇資料夾。');
$('rememberFolder').hidden=!window.showDirectoryPicker;
$('reconnect').onclick=async()=>{try{const h=await read('settings','folder');if(!h)return;if(await h.requestPermission({mode:'read'})!=='granted')throw new Error('需要允許讀取才能重新連結');await directory(h)}catch(e){setStatus('重新連結失敗，請重新選資料夾。'+e.message,true)}};
read('settings','folder').then(h=>{$('reconnect').hidden=!h||!window.showDirectoryPicker});
if(!window.showDirectoryPicker)$('copy').hidden=true;
function ai(type,payload={}){if(!worker){worker=new Worker('ai-engine.js',{type:'module'});worker.onmessage=({data:m})=>{if(m.backend){backend=m.backend;$('engine').textContent=backend;return}if(m.progress!==undefined){setStatus(`正在下載 AI 模型 ${m.progress}%（${m.file}），照片不會上傳。`);$('progress').value=m.progress;return}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m.result)};worker.onerror=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(e.message||'AI 載入失敗，請確認網路後重試'))}pending.clear();worker.terminate();worker=null}}return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{worker?.terminate();worker=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('AI 處理逾時，請重試或改用電腦'))}pending.clear()},15*60*1000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,...payload},payload.data?[payload.data]:[])})}
async function pixels(file){const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const ratio=Math.min(1,512/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*ratio));c.height=Math.max(1,Math.round(img.naturalHeight*ratio));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);return {data:ctx.getImageData(0,0,c.width,c.height).data.buffer,width:c.width,height:c.height,thumb:c.toDataURL('image/jpeg',.75)}}finally{URL.revokeObjectURL(url)}}
async function startIndex(){
 if(busy)return;
 stop=false;
 if(!photos.some(p=>!p.vector))return;
 busy=true;stop=false;controls();$('pause').hidden=false;$('progress').hidden=false;
 let completed=0,failed=0,reused=0,lastRender=0;const todo=photos.filter(p=>!p.vector);const began=performance.now();
 try{
  for(const p of todo){
   if(stop)break;
   setStatus('檢查照片 '+(completed+1)+' / '+todo.length+'：'+p.name);
   try{
    const f=await getFile(p),key=await fingerprint(f),cached=await read('vectors',key);
    if(cached){p.vector=cached;reused++}
    else{
     setStatus('正在分析 '+(completed+1)+' / '+todo.length+'：'+p.name);
     const pic=await pixels(f);
     p.vector=await ai('image',{data:pic.data,width:pic.width,height:pic.height});
     p.thumb=pic.thumb;URL.revokeObjectURL(p.url);p.url=p.thumb;
     await write('vectors',key,p.vector);
    }
    p.failed=false;
   }catch(e){p.failed=true;failed++;fail(p.name,e.message)}
   completed++;$('progress').value=completed/todo.length*100;
   if(performance.now()-lastRender>1000){render();lastRender=performance.now()}
   if(completed%10===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  const seconds=((performance.now()-began)/1000).toFixed(1);
  setStatus((stop?'已暫停':'照片準備完成')+'：'+photos.filter(p=>p.vector).length+' 張可搜尋，重用 '+reused+' 張快取，本次 '+seconds+' 秒。'+(failed?failed+' 張失敗，可按「繼續／重試分析」。':'')+(storageWarning?'瀏覽器無法保存索引，下次需重建。':''));
 }finally{busy=false;$('pause').hidden=true;$('progress').hidden=true;render()}

}
$('index').onclick=startIndex;
$('pause').onclick=()=>{stop=true;setStatus('完成目前照片後暫停…')};
$('searchForm').onsubmit=async e=>{e.preventDefault();if(busy||!photos.length)return;const query=$('query').value.trim();if(!query){setStatus('請先描述你想找的照片。');return}await startIndex();if(stop)return;if(!photos.some(p=>p.vector)){setStatus('沒有可搜尋的照片，請查看處理錯誤並重試。',true);return}busy=true;controls();setStatus('正在比對照片內容…');try{const text=await ai('text',{text:query});results=photos.filter(p=>p.vector).map(p=>({...p,score:p.vector.reduce((sum,v,i)=>sum+v*text[i],0)})).sort((a,b)=>b.score-a.score);selected.clear();page=80;setStatus('已依相似度排列。可調整篩選、勾選照片，再匯出原檔。')}catch(e){setStatus('搜尋失敗：'+e.message,true)}finally{busy=false;render()}};
document.querySelectorAll('.suggestions button').forEach(b=>b.onclick=()=>{$('query').value=b.textContent;$('query').focus()});
$('threshold').oninput=()=>{$('thresholdValue').textContent=Number($('threshold').value).toFixed(2);selected.clear();page=80;render()};$('limit').onchange=()=>{selected.clear();page=80;render()};$('reset').onclick=()=>{results=null;selected.clear();page=80;render()};$('more').onclick=()=>{page+=80;render()};$('selectAll').onclick=()=>{visible().forEach(p=>selected.add(p.id));render()};$('unselect').onclick=()=>{selected.clear();render()};
function safeName(name){return name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')||'photo'}
function uniqueName(name,used){const clean=safeName(name);const dot=clean.lastIndexOf('.');const base=dot>0?clean.slice(0,dot):clean,ext=dot>0?clean.slice(dot):'';let n=clean,i=1;while(used.has(n.toLowerCase()))n=`${base} (${i++})${ext}`;used.add(n.toLowerCase());return n}
async function exportPhotos(mode){if(busy||!selected.size)return;const list=photos.filter(p=>selected.has(p.id));let dest;
 try{if(mode==='folder')dest=await showDirectoryPicker({mode:'readwrite'})}catch(e){if(e.name!=='AbortError')setStatus(e.message,true);return}
 const total=list.reduce((n,p)=>n+p.size,0);if(mode==='zip'&&total>350*1024*1024){setStatus('本批超過 350 MB，請減少選取數量，或在電腦使用「複製原檔至資料夾」，避免手機記憶體不足。',true);return}
 busy=true;controls();render();const used=new Set();let n=0;
 try{if(mode==='folder'){const sub=await dest.getDirectoryHandle('拾光-'+Date.now(),{create:true});for(const p of list){setStatus(`正在複製原檔 ${n+1} / ${list.length}`);const f=await getFile(p);const handle=await sub.getFileHandle(uniqueName(p.name,used),{create:true});const stream=await handle.createWritable();try{await stream.write(f);await stream.close()}catch(e){await stream.abort();throw e}n++}setStatus(`已將 ${n} 張原檔複製到所選位置內的新資料夾。`)}else{setStatus('正在準備原檔 ZIP…');const {zipSync}=await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');const entries=Object.create(null);for(const p of list){setStatus(`讀取原檔 ${++n} / ${list.length}`);entries[uniqueName(p.name,used)]=new Uint8Array(await(await getFile(p)).arrayBuffer())}const blob=new Blob([zipSync(entries,{level:0})],{type:'application/zip'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='拾光照片-'+new Date().toISOString().slice(0,10)+'.zip';document.body.append(a);a.click();const old=document.getElementById('readyDownload');if(old){URL.revokeObjectURL(old.href);old.remove()}a.id='readyDownload';a.textContent='ZIP 已備妥，點此下載';a.className='secondary';a.style.display='inline-block';a.style.marginTop='14px';document.querySelector('.exportbar').after(a);setStatus(`已準備 ${n} 張原檔的 ZIP，請查看瀏覽器下載項目；手機可解壓到「檔案」。`)}}catch(e){setStatus(`匯出未完成${mode==='folder'?`（已複製 ${n} 張）`:''}：${e.message}。若原檔已移動，請重新選取。`,true)}finally{busy=false;render()}}
$('copy').onclick=()=>exportPhotos('folder');$('zip').onclick=()=>exportPhotos('zip');
$('clear').onclick=async()=>{if(busy)return;if(!confirm('清除這個網站在此瀏覽器保存的搜尋索引與資料夾記憶？原始照片不會刪除。'))return;for(const p of photos)URL.revokeObjectURL(p.url);photos=[];results=null;selected.clear();categoryPlan=null;categorySummary();await dbReady;if(db){await new Promise(resolve=>{const tx=db.transaction(['vectors','settings'],'readwrite');tx.objectStore('vectors').clear();tx.objectStore('settings').clear();tx.oncomplete=resolve;tx.onerror=resolve})}$('reconnect').hidden=true;$('errors').hidden=true;$('errorList').replaceChildren();setStatus('本機索引與資料夾記憶已清除。AI 模型快取保留，原檔不受影響。');render()};
function categoryControls(){
 const pendingPhotos=photos.some(p=>!p.vector&&!p.failed);
 $('categorize').disabled=busy||!photos.length;
 $('saveCategories').disabled=busy||!categoryPlan;
 if(!window.showDirectoryPicker)$('saveCategories').textContent='下載分類資料夾 ZIP';
}
function categorySummary(){
 $('categorySummary').replaceChildren();$('categoryPreview').replaceChildren();
 if(!categoryPlan)return;
 for(const [name,items]of categoryPlan){
  const btn=document.createElement('button');btn.textContent=name+' · '+items.length+' 張';
  btn.onclick=()=>{
   $('categoryPreview').replaceChildren();
   for(const p of items.slice(0,12)){
    const card=document.createElement('div');card.className='card';
    const image=document.createElement('img');image.src=p.thumb||p.url;image.alt=p.name;image.loading='lazy';
    const caption=document.createElement('div');caption.className='meta';caption.textContent=p.name;
    card.append(image,caption);$('categoryPreview').append(card);
   }
   $('categoryStatus').textContent=name+'：共 '+items.length+' 張，顯示前 12 張預覽。匯出會包含此類別的全部照片。';
  };
  $('categorySummary').append(btn);
 }
}
async function autoCategorize(){
 if(busy||!photos.some(p=>p.vector)||photos.some(p=>!p.vector&&!p.failed))return;
 const names=AUTO_CATEGORIES;
 busy=true;categoryPlan=null;controls();$('categorySummary').replaceChildren();$('categoryPreview').replaceChildren();
 try{
  const categories=[];
  for(let i=0;i<names.length;i++){
   const definition=names[i];
   $('categoryStatus').textContent='正在準備百和產品分類 '+(i+1)+' / '+names.length+'：'+definition.name;
   const key=VERSION+':paiho-v1:'+definition.prompt;let vec=await read('vectors',key);
   if(!vec){vec=await ai('text',{text:definition.prompt});await write('vectors',key,vec)}
   categories.push({...definition,vector:vec});
  }
  const plan=new Map();
  for(const p of photos){const name=p.vector?chooseCategory(p.vector,categories):'未能分析';if(!plan.has(name))plan.set(name,[]);plan.get(name).push(p)}
  categoryPlan=plan;categorySummary();setStatus('照片處理完成，可以直接另存分類資料夾，也可以輸入描述搜尋。');
  $('categoryStatus').textContent='已將 '+photos.length+' 張照片分為 '+plan.size+' 個資料夾。點分類可看預覽；按「建立分類資料夾並複製原檔」另存全部。分類為 AI 建議，待確認的照片請自行檢查。';
 }catch(e){$('categoryStatus').textContent='分類未完成：'+e.message+'。可按自動分類重試。'}
 finally{busy=false;controls()}
}
$('categorize').onclick=async()=>{if(busy||!photos.length)return;await startIndex();if(!stop)await autoCategorize()};
$('saveCategories').onclick=async()=>{
 if(busy||!categoryPlan)return;
 let dest;
 try{if(window.showDirectoryPicker)dest=await showDirectoryPicker({mode:'readwrite'})}catch(e){if(e.name!=='AbortError')$('categoryStatus').textContent=e.message;return}
 if(!dest&&photos.reduce((sum,p)=>sum+p.size,0)>350*1024*1024){$('categoryStatus').textContent='分類 ZIP 超過 350 MB。請改用電腦 Chrome／Edge，直接複製到資料夾。';return}
 busy=true;controls();let copied=0;
 try{
  const title='拾光分類-'+Date.now();const folder=dest?await dest.getDirectoryHandle(title,{create:true}):null;
  const entries=Object.create(null);
  for(const [category,items]of categoryPlan){
   const sub=folder?await folder.getDirectoryHandle(category,{create:true}):null,used=new Set();
   for(const p of items){
    $('categoryStatus').textContent='正在另存 '+(copied+1)+' / '+photos.length+'：'+category+' / '+p.name;
    const file=await getFile(p),name=uniqueName(p.name,used);
    if(sub){const target=await sub.getFileHandle(name,{create:true});const stream=await target.createWritable();try{await stream.write(file);await stream.close()}catch(e){await stream.abort();throw e}}
    else entries[category+'/'+name]=new Uint8Array(await file.arrayBuffer());
    copied++;
   }
  }
  if(!folder){const {zipSync}=await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([zipSync(entries,{level:0})],{type:'application/zip'}));a.download=title+'.zip';a.textContent='分類 ZIP 已備妥，點此下載';a.className='secondary';const old=$('categoryDownload');if(old){URL.revokeObjectURL(old.href);old.remove()}a.id='categoryDownload';$('categoryStatus').after(a);a.click()}
  $('categoryStatus').textContent=folder?'已建立「'+title+'」，內含 '+categoryPlan.size+' 個分類資料夾與 '+copied+' 張原檔。原始照片保持原位。':'已備妥含分類資料夾的 ZIP，請查看下載項目。';
 }catch(e){$('categoryStatus').textContent='另存未完成'+(dest?'，已複製 '+copied+' 張':'')+'：'+e.message+'。原始檔案未搬動。'}
 finally{busy=false;controls()}
};
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue=''}});render();
