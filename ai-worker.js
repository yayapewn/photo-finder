import {AutoModel, AutoTokenizer, AutoProcessor, RawImage, env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
const MODEL='Xenova/chinese-clip-vit-base-patch16';
let model,tokenizer,processor,pixels,init;
async function ready(){
 if(!init) init=(async()=>{
  const progress_callback=p=>{if(p.status==='progress')postMessage({progress:Math.round(p.progress),file:p.file});};
  tokenizer=await AutoTokenizer.from_pretrained(MODEL);
  processor=await AutoProcessor.from_pretrained(MODEL);
  model=await AutoModel.from_pretrained(MODEL,{dtype:'q8',device:'wasm',progress_callback});
  pixels=await processor(new RawImage(new Uint8ClampedArray(32*32*3),32,32,3));
 })().catch(e=>{init=null;throw e});
 await init;
}
function vector(t){if(!t)throw new Error('模型未回傳搜尋特徵');const v=Array.from(t.data,Number);const n=Math.hypot(...v);if(!n||!Number.isFinite(n))throw new Error('無效的搜尋特徵');return v.map(x=>x/n)}
onmessage=async({data:m})=>{try{await ready();if(m.type==='init'){postMessage({id:m.id,result:true});return}
 const txt=tokenizer(m.type==='text'?m.text:'照片',{padding:true,truncation:true});
 const image=m.type==='image'?await processor(new RawImage(new Uint8ClampedArray(m.data),m.width,m.height,4)):pixels;
 const out=await model({...txt,...image});
 postMessage({id:m.id,result:vector(m.type==='text'?out.text_embeds:out.image_embeds)});
 }catch(e){postMessage({id:m.id,error:e.message||String(e)})}};
