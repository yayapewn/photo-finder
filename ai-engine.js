import {AutoModel, AutoTokenizer, AutoProcessor, RawImage, env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
const MODEL='Xenova/chinese-clip-vit-base-patch16';
let model,tokenizer,processor,pixels,init,device='wasm',imageText;
const progress_callback=p=>{if(p.status==='progress')postMessage({progress:Math.round(p.progress),file:p.file});};
async function cpu(){await model?.dispose().catch(()=>{});model=await AutoModel.from_pretrained(MODEL,{dtype:'q8',device:'wasm',progress_callback});device='wasm';postMessage({backend:'CPU 相容模式'});}
async function ready(){
 if(!init) init=(async()=>{
  [tokenizer,processor]=await Promise.all([AutoTokenizer.from_pretrained(MODEL),AutoProcessor.from_pretrained(MODEL)]);
  imageText=tokenizer('照片',{padding:true,truncation:true});
  pixels=await processor(new RawImage(new Uint8ClampedArray(32*32*3),32,32,3));
  // Keep the validated WASM path: WebGPU produced incorrect rankings for this model.
  await cpu();
 })().catch(async e=>{await model?.dispose().catch(()=>{});model=null;init=null;throw e});
 await init;
}
function vector(t){if(!t)throw new Error('模型未回傳搜尋特徵');const v=Array.from(t.to('float32').data,Number);const n=Math.hypot(...v);if(!n||!Number.isFinite(n))throw new Error('無效的搜尋特徵');return v.map(x=>x/n)}
onmessage=async({data:m})=>{try{await ready();if(m.type==='init'){postMessage({id:m.id,result:true});return}
 const txt=m.type==='text'?tokenizer(m.text,{padding:true,truncation:true}):imageText;
 const image=m.type==='image'?await processor(new RawImage(new Uint8ClampedArray(m.data),m.width,m.height,4)):pixels;
 let out;try{out=await model({...txt,...image})}catch(e){if(device!=='webgpu')throw e;await cpu();out=await model({...txt,...image})}
 postMessage({id:m.id,result:vector(m.type==='text'?out.text_embeds:out.image_embeds)});
 }catch(e){postMessage({id:m.id,error:e.message||String(e)})}};
