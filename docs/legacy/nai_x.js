(function(){
  function safeObj(val){
    if(!val) return {};
    if(typeof val==='object') return val;
    try{ return JSON.parse(String(val)); }catch{ return {}; }
  }
  function coerceInt(x){
    if(typeof x==='number') return Math.floor(x);
    if(typeof x==='string'){ const s=x.trim(); if(!s) return null; try{ return parseInt(s,10); }catch{ try{ return parseInt(parseFloat(s)); }catch{ return null; } } }
    return null;
  }
  function coerceFloat(x){
    if(typeof x==='number') return x;
    if(typeof x==='string'){ const s=x.trim(); if(!s) return null; try{ return parseFloat(s); }catch{ return null; } }
    return null;
  }
  function extractSteps(obj){
    const o=safeObj(obj);
    function pick(d){ if(!d||typeof d!=='object') return null; for(const k of ['steps','Steps','step','Step']){ if(k in d){ const v=coerceInt(d[k]); if(v!=null) return v; } } return null; }
    const t=pick(o); if(t!=null) return t;
    const c=o.Comment;
    if(typeof c==='object') return pick(c);
    if(typeof c==='string'){ try{ const cj=JSON.parse(c); return pick(cj); }catch{} }
    return null;
  }
  function isSeedEmpty(obj){
    const o=safeObj(obj);
    function emptySeed(d){ if(!d||typeof d!=='object') return false; if('seed' in d){ const sv=d.seed; return sv==null || (typeof sv==='string' && sv.trim()===''); } if('Seed' in d){ const sv=d.Seed; return sv==null || (typeof sv==='string' && sv.trim()===''); } return false; }
    if(emptySeed(o)) return true;
    const c=o.Comment;
    if(typeof c==='object') return emptySeed(c);
    if(typeof c==='string'){ try{ const cj=JSON.parse(c); return emptySeed(cj); }catch{} }
    return false;
  }
  function extractDimensionMax(obj){
    const o=safeObj(obj);
    function pick(d){ if(!d||typeof d!=='object') return null; const w=coerceFloat(d.width ?? d.Width); const h=coerceFloat(d.height ?? d.Height); const vals=[]; if(w!=null) vals.push(w); if(h!=null) vals.push(h); return vals.length? Math.max.apply(null,vals): null; }
    const t=pick(o); if(t!=null) return t;
    const c=o.Comment;
    if(typeof c==='object') return pick(c);
    if(typeof c==='string'){ try{ const cj=JSON.parse(c); return pick(cj); }catch{} }
    return null;
  }
  function coreNaix(json){
    const o=safeObj(json);
    const title=String(o.Title||'');
    let noise='';
    const c=o.Comment;
    if(typeof c==='object') noise=String(c.noise_schedule||'');
    return title==='AI generated image' && noise==='exponential';
  }
  function splitPromptTags(value){
    return String(value||'').split(/[,，、]/).map(s=>s.trim()).filter(Boolean);
  }
  function countPromptTags(json){
    const o = safeObj(json);
    const desc = String(o.Description||'');
    let extra = 0;
    let c = o.Comment;
    if (typeof c === 'string'){
      try{ c = JSON.parse(c); }catch{ c = null; }
    }
    const commentPrompt = String((c && typeof c === 'object' && c.prompt) || '');
    // Description and Comment.prompt are usually duplicates, but some exports
    // truncate one of them. Use the richer representation without double-counting.
    const tagsDesc = Math.max(
      splitPromptTags(desc).length,
      splitPromptTags(commentPrompt).length
    );
    try{
      if (c && typeof c === 'object'){
        const v4p = c.v4_prompt;
        const cap = v4p && v4p.caption;
        const ccList = cap && cap.char_captions;
        if (Array.isArray(ccList) && ccList.length){
          for (const it of ccList){
            const cs = String((it && it.char_caption) || '');
            if (cs){
              const arr = splitPromptTags(cs);
              extra += arr.length;
            }
          }
        }
      }
    }catch{}
    return tagsDesc + extra;
  }
  function normalizeImageType(value){
    return String(value||'').trim().toLowerCase().replace(/[ _-]+/g,'');
  }
  function extractSdParameters(json){
    const o=safeObj(json);
    for(const key of ['parameters','Parameters']){
      if(Object.prototype.hasOwnProperty.call(o,key)){
        const value=o[key];
        return value==null ? '' : String(value);
      }
    }
    return '';
  }
  function extractSdPositivePrompt(parameters){
    const text=String(parameters||'').replace(/\r\n?/g,'\n');
    let end=text.length;
    for(const pattern of [/(?:^|\n)\s*Negative prompt\s*:/i,/(?:^|\n)\s*Steps\s*:/i]){
      const match=pattern.exec(text);
      if(match && match.index<end) end=match.index;
    }
    return text.slice(0,end).trim();
  }
  function countSdPromptTags(parameters){
    const prompt=extractSdPositivePrompt(parameters);
    if(!prompt) return 0;
    return prompt.split(',').map(s=>s.trim()).filter(Boolean).length;
  }
  function hasEmptySdModel(parameters){
    const text=String(parameters||'').replace(/\r\n?/g,'\n');
    const match=/(?:^|[\n,])\s*Model\s*:\s*([^,\n]*)/i.exec(text);
    return !!match && !String(match[1]||'').trim();
  }
  function suspectSd(json){
    const parameters=extractSdParameters(json);
    if(countSdPromptTags(parameters)<4) return true;
    if(hasEmptySdModel(parameters)) return true;
    return false;
  }
  function isNonStandardComfyUI(json){
    const target='ECHOCheckpointLoaderSimple';
    const root=safeObj(json);
    try{
      const stack=[root];
      const seen=new WeakSet();
      let steps=0;
      while(stack.length&&steps<8000){
        const current=stack.pop();
        steps++;
        if(current==null) continue;
        if(typeof current==='string'){
          const value=current.trim();
          if((value.startsWith('{')||value.startsWith('['))&&value.length>1){
            try{
              const nested=JSON.parse(value);
              if(nested&&typeof nested==='object') stack.push(nested);
            }catch{}
          }
          continue;
        }
        if(typeof current!=='object'||seen.has(current)) continue;
        seen.add(current);
        if(current.class_type===target||current.class===target||current.type===target) return true;
        if(Array.isArray(current)) stack.push(...current);
        else stack.push(...Object.values(current));
      }
    }catch{}
    return false;
  }
  function comfyPositiveCount(result){
    const extraction=result&&result.extraction;
    if(extraction&&Number.isFinite(Number(extraction.verifiedPositiveCount))){
      return Math.max(0,Number(extraction.verifiedPositiveCount));
    }
    let count=Array.isArray(result&&result.prompts)
      ?result.prompts.filter(entry=>entry&&entry.verified===true).length:0;
    for(const entry of Array.isArray(result&&result.characters)?result.characters:[]){
      if(entry&&String(entry.prompt||'').trim()) count++;
    }
    return count;
  }
  function activeComfyV3(){
    return window.AI_METADATA_RULESET==='v3'&&window.AIMetadata&&
      typeof window.AIMetadata.classify==='function';
  }
  function protectedComfyV3(reason){
    return {
      suspect:false,
      state:'REVIEW_REQUIRED',
      reason:reason||'v3-classifier-unavailable'
    };
  }
  function classifyComfyV3Work(workData){
    if(!activeComfyV3()) return protectedComfyV3('v3-classifier-unavailable');
    try{
      const result=window.AIMetadata.classify(workData);
      if(!result||typeof result!=='object') return protectedComfyV3('v3-classifier-invalid-result');
      return result;
    }catch{
      return protectedComfyV3('v3-classifier-error');
    }
  }
  function classifyFormattedComfyUI(result){
    try{
      const warnings=new Set(Array.isArray(result&&result.warnings)?result.warnings.map(String):[]);
      if(!result||result.format==='error'||[...warnings].some(value=>value.startsWith('format-error:'))){
        return {suspect:false,reason:'formatter-error',noStandardSampler:false,polarityUnresolved:false,positiveCount:0,extractionStatus:'invalid_metadata'};
      }
      if(result.sourceEmpty===true||warnings.has('metadata-empty')){
        return {suspect:false,reason:'metadata-missing',noStandardSampler:false,polarityUnresolved:false,positiveCount:0,extractionStatus:'invalid_metadata'};
      }
      const noStandardSampler=warnings.has('sampler-node-not-recognized');
      const polarityUnresolved=warnings.has('prompt-polarity-unresolved');
      const positiveCount=comfyPositiveCount(result);
      const extraction=result&&result.extraction&&typeof result.extraction==='object'
        ?result.extraction:null;
      const extractionStatus=extraction&&String(extraction.status||'');
      const extractionReasons=new Set(Array.isArray(extraction&&extraction.reasons)
        ?extraction.reasons.map(String):[]);
      if(!extraction){
        return {suspect:false,reason:'extraction-unavailable',noStandardSampler,polarityUnresolved,positiveCount,extractionStatus:''};
      }
      const eligibleStatus=extractionStatus==='no_prompt_evidence'||extractionStatus==='postprocess_only';
      if((extraction.suspectEligible===true)!==eligibleStatus){
        return {suspect:false,reason:'extraction-contract-mismatch',noStandardSampler,polarityUnresolved,positiveCount,extractionStatus};
      }
      const knownStatus=eligibleStatus||[
        'verified','partial','unresolved','nonstandard_unknown','invalid_metadata'
      ].includes(extractionStatus);
      if(!knownStatus){
        return {suspect:false,reason:'unknown-extraction-status',noStandardSampler,polarityUnresolved,positiveCount,extractionStatus};
      }
      const suspect=eligibleStatus;
      let reason='';
      if(suspect){
        if(extractionStatus==='postprocess_only'&&
          extractionReasons.has('reference-image-postprocess-sparse-positive')) reason='sparse-positive-reference';
        else if(extractionStatus==='postprocess_only') reason='postprocess-only';
        else if(extractionStatus==='invalid_metadata') reason='invalid-metadata';
        else if(extractionStatus==='no_prompt_evidence') reason='positive-missing';
        else reason=positiveCount===0?'positive-missing':
          (polarityUnresolved?'polarity-unresolved-no-sampler':'positive-missing-no-sampler');
      }else if(extractionStatus==='nonstandard_unknown') reason='non-standard-format';
      else if(extractionStatus==='invalid_metadata') reason='invalid-metadata';
      return {suspect,reason,noStandardSampler,polarityUnresolved,positiveCount,extractionStatus};
    }catch{
      return {suspect:false,reason:'formatter-error',noStandardSampler:false,polarityUnresolved:false,positiveCount:0};
    }
  }
  function classifyComfyUI(json){
    const readable=window.AIMetadata;
    if(!readable||typeof readable.format!=='function'){
      return {suspect:false,reason:'formatter-unavailable',noStandardSampler:false,polarityUnresolved:false,positiveCount:0};
    }
    if(activeComfyV3()){
      const result=classifyComfyV3Work({
        work:{AI_type:'ComfyUI',image_count:1},
        images:[{image_type:'ComfyUI',ai_json:json}]
      });
      return {
        suspect:result.suspect===true,
        reason:String(result.reason||''),
        noStandardSampler:false,
        polarityUnresolved:false,
        positiveCount:0,
        extractionStatus:String(result.state||''),
        v3Classification:result
      };
    }
    try{
      return classifyFormattedComfyUI(readable.format(json,'ComfyUI'));
    }catch{
      return {suspect:false,reason:'formatter-error',noStandardSampler:false,polarityUnresolved:false,positiveCount:0};
    }
  }
  function suspect(json,imageType){
    const normalizedType=normalizeImageType(imageType);
    if(normalizedType==='sd') return suspectSd(json);
    if(normalizedType==='comfyui') return classifyComfyUI(json).suspect;
    const promptTagCount=countPromptTags(json);
    if((normalizedType==='nai'||normalizedType==='naix')&&promptTagCount===0) return true;
    if(coreNaix(json) && promptTagCount < 4) return true;
    const dim=extractDimensionMax(json); if(dim!=null && dim>5000) return true;
    const st=extractSteps(json); if(st!=null && st>51) return true;
    if(isSeedEmpty(json)) return true;
    try{
      if (window.NAI && typeof window.NAI.detect==='function'){
        const det = window.NAI.detect(json);
        const kind = det && typeof det.kind === 'string' ? det.kind : '';
        const typeLower = det && typeof det.type === 'string' ? det.type.toLowerCase() : '';
        const isInpaint = kind === 'inpaint' || typeLower.includes('inpainting');
        const isImg2Img = kind === 'img2img' || typeLower.includes('image to image') || typeLower.includes('img2img');
        if (isInpaint || isImg2Img){
          const total = countPromptTags(json);
          if (total < 12) return true;
        }
      }
    }catch{}
    return false;
  }
  function suspectWork(workData){
    return suspectWorkDetails(workData).suspect;
  }
  function hasComfyMetadata(img){
    if(!img||!Object.prototype.hasOwnProperty.call(img,'ai_json')) return false;
    const value=img.ai_json;
    if(value==null) return false;
    return typeof value!=='string'||value.trim().length>0;
  }
  function suspectWorkDetails(workData){
    if(!workData||!Array.isArray(workData.images)) return {suspect:false,imageCount:0,totalImageCount:0,missingMetadataImageCount:0,suspectCount:0,validCount:0,ratio:0,reasons:{}};
    const imgs = workData.images;
    if(!imgs.length) return {suspect:false,imageCount:0,totalImageCount:0,missingMetadataImageCount:0,suspectCount:0,validCount:0,ratio:0,reasons:{}};
    const work=workData.work||{};
    const workType=work.AI_type||work.ai_type||'';
    const normalizedWorkType=normalizeImageType(workType);
    if(normalizedWorkType==='comfyui'&&activeComfyV3()){
      const result=classifyComfyV3Work(workData);
      const sourceImageCount=Number.isInteger(Number(result.sourceImageCount))
        ?Number(result.sourceImageCount):imgs.length;
      const declaredCount=result.coverage&&Number.isInteger(Number(result.coverage.declaredImageCount))
        ?Number(result.coverage.declaredImageCount):null;
      const missingMetadataCount=imgs.filter(img=>!hasComfyMetadata(img)).length;
      const missingDeclaredCount=declaredCount===null?0:Math.max(0,declaredCount-imgs.length);
      const missingCount=missingMetadataCount+missingDeclaredCount;
      const suspect=result.suspect===true;
      const valid=result.state==='VALID_CONFIRMED';
      return {
        suspect,
        imageCount:sourceImageCount,
        totalImageCount:declaredCount===null?imgs.length:declaredCount,
        missingMetadataImageCount:missingCount,
        suspectCount:suspect?sourceImageCount:0,
        validCount:valid?sourceImageCount:0,
        nonStandardCount:0,
        ratio:suspect?1:0,
        reasons:result.reason?{[String(result.reason)]:1}:{},
        state:String(result.state||''),
        v3Classification:result
      };
    }
    const classifiedImages=normalizedWorkType==='comfyui'?imgs.filter(hasComfyMetadata):imgs;
    if(!classifiedImages.length){
      return {suspect:false,imageCount:0,totalImageCount:imgs.length,missingMetadataImageCount:imgs.length,suspectCount:0,validCount:0,ratio:0,reasons:{}};
    }
    let suspectCount = 0;
    let nonStandardCount = 0;
    const reasons={};
    for(const img of classifiedImages){
      const imageType=normalizedWorkType==='comfyui'
        ?'ComfyUI'
        :(img&&(img.image_type||img.AI_type||img.ai_type))||workType;
      if(normalizeImageType(imageType)==='comfyui'){
        // Real ComfyUI exports may contain JavaScript-style NaN/Infinity.
        // Preserve the raw value for the formatter's tolerant parser.
        const classified=classifyComfyUI(img&&img.ai_json);
        if(classified.suspect) suspectCount++;
        if(classified.reason==='non-standard-format') nonStandardCount++;
        if(classified.reason) reasons[classified.reason]=(reasons[classified.reason]||0)+1;
      }else{
        const j=img&&(typeof img.ai_json==='string'
          ?(function(){ try{ return JSON.parse(img.ai_json); }catch{ return {}; } })()
          :img.ai_json);
        if(suspect(j,imageType)) suspectCount++;
      }
    }
    const ratio = suspectCount / classifiedImages.length;
    return {
      suspect:normalizedWorkType==='comfyui'
        ?nonStandardCount===0&&suspectCount===classifiedImages.length
        :ratio>=0.8,
      imageCount:classifiedImages.length,
      totalImageCount:imgs.length,
      missingMetadataImageCount:imgs.length-classifiedImages.length,
      suspectCount,
      validCount:classifiedImages.length-suspectCount,
      nonStandardCount,
      ratio,
      reasons
    };
  }
  window.NAIX = {
    suspect,
    suspectWork,
    suspectWorkDetails,
    classifyComfyUI,
    classifyFormattedComfyUI,
    isNonStandardComfyUI
  };
})();
