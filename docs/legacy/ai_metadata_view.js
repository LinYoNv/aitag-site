(function(root,factory){
  'use strict';
  root.AIMetadataView=factory(root);
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';

  const VERSION='260731c';
  const LIMITS={prompts:100,assets:200,settings:200,passes:100,other:100};

  const COPY={
    zh:{
      empty:'源 AI 元数据为空',prompt:'提示词',negative:'负面提示词',characters:'角色提示词',models:'模型与资源',loras:'LoRA',settings:'生成参数',passes:'采样流程',other:'其他信息',notes:'解析提示',workflow:'工作流',nodes:'节点',links:'连线',totalPasses:'采样流程',source:'来源',disabled:'停用',showFull:'展开完整内容',collapse:'收起内容',chars:'字符',shown:(shown,total)=>`显示前 ${shown} 项，共 ${total} 项`,omitted:n=>`另有 ${n} 个采样流程未展开，可在原始 JSON 中查看`,pass:n=>`流程 ${n}`
    },
    en:{
      empty:'Source AI metadata is empty',prompt:'Prompt',negative:'Negative prompt',characters:'Character prompts',models:'Models and assets',loras:'LoRA',settings:'Generation settings',passes:'Sampling passes',other:'Other information',notes:'Parser notes',workflow:'Workflow',nodes:'nodes',links:'links',totalPasses:'passes',source:'Source',disabled:'disabled',showFull:'Show full content',collapse:'Collapse content',chars:'characters',shown:(shown,total)=>`Showing ${shown} of ${total}`,omitted:n=>`${n} additional passes are available in raw JSON`,pass:n=>`Pass ${n}`
    },
    zh_tw:{
      empty:'來源 AI 元資料為空',prompt:'提示詞',negative:'負面提示詞',characters:'角色提示詞',models:'模型與資源',loras:'LoRA',settings:'生成參數',passes:'採樣流程',other:'其他資訊',notes:'解析提示',workflow:'工作流程',nodes:'節點',links:'連線',totalPasses:'流程',source:'來源',disabled:'停用',showFull:'展開完整內容',collapse:'收合內容',chars:'字元',shown:(shown,total)=>`顯示前 ${shown} 項，共 ${total} 項`,omitted:n=>`另有 ${n} 個採樣流程可在原始 JSON 中查看`,pass:n=>`流程 ${n}`
    },
    ja:{
      empty:'元のAIメタデータは空です',prompt:'プロンプト',negative:'ネガティブプロンプト',characters:'キャラクタープロンプト',models:'モデルとリソース',loras:'LoRA',settings:'生成設定',passes:'サンプリング工程',other:'その他の情報',notes:'解析メモ',workflow:'ワークフロー',nodes:'ノード',links:'リンク',totalPasses:'工程',source:'ソース',disabled:'無効',showFull:'全文を表示',collapse:'折りたたむ',chars:'文字',shown:(shown,total)=>`${total}件中 ${shown}件を表示`,omitted:n=>`追加のサンプリング工程 ${n} 件は元の JSON で確認できます`,pass:n=>`工程 ${n}`
    },
    ko:{
      empty:'원본 AI 메타데이터가 비어 있습니다',prompt:'프롬프트',negative:'네거티브 프롬프트',characters:'캐릭터 프롬프트',models:'모델 및 리소스',loras:'LoRA',settings:'생성 설정',passes:'샘플링 단계',other:'기타 정보',notes:'파서 메모',workflow:'워크플로',nodes:'노드',links:'링크',totalPasses:'단계',source:'출처',disabled:'비활성화',showFull:'전체 내용 표시',collapse:'내용 접기',chars:'자',shown:(shown,total)=>`${total}개 중 ${shown}개 표시`,omitted:n=>`추가 샘플링 단계 ${n}개는 원본 JSON에서 확인할 수 있습니다`,pass:n=>`단계 ${n}`
    }
  };

  function language(value){
    const raw=String(value||root.GALLERY_LANG||'zh').toLowerCase();
    if(raw==='zh_tw'||raw==='zh-tw'||raw==='zh-hant') return 'zh_tw';
    if(raw.startsWith('ja')||raw==='jp') return 'ja';
    if(raw.startsWith('ko')||raw==='kr') return 'ko';
    if(raw.startsWith('en')||raw==='us') return 'en';
    return 'zh';
  }
  function el(tag,className,text){
    const node=root.document.createElement(tag);
    if(className) node.className=className;
    if(text!=null) node.textContent=String(text);
    return node;
  }
  function section(parent,title,className){
    const node=el('section',`ai-meta-section ${className||''}`.trim());
    node.appendChild(el('h4','ai-meta-section-title',title));
    parent.appendChild(node);
    return node;
  }
  function limitItems(values,limit){
    const list=Array.isArray(values)?values:[];
    return {items:list.slice(0,limit),total:list.length};
  }
  function appendLimitNote(parent,shown,total,copy){
    if(total<=shown) return;
    parent.appendChild(el('div','ai-meta-limit-note',copy.shown(shown,total)));
  }
  function longText(value,copy){
    const text=String(value||'');
    const wrap=el('div','ai-meta-text-wrap');
    const pre=el('pre','ai-meta-text');
    if(text.length<=4000){
      pre.textContent=text;
      wrap.appendChild(pre);
      return wrap;
    }
    const preview=`${text.slice(0,3000)}\n\n...`;
    pre.textContent=preview;
    const button=el('button','ai-meta-expand-btn',`${copy.showFull} · ${text.length.toLocaleString()} ${copy.chars}`);
    let expanded=false;
    button.type='button';
    button.addEventListener('click',()=>{
      expanded=!expanded;
      pre.textContent=expanded?text:preview;
      button.textContent=expanded?copy.collapse:`${copy.showFull} · ${text.length.toLocaleString()} ${copy.chars}`;
    });
    wrap.append(pre,button);
    return wrap;
  }
  function promptContent(entry,copy){
    const tokens=entry&&Array.isArray(entry.tokens)?entry.tokens:[];
    if(!tokens.length) return longText(entry&&typeof entry==='object'?entry.text:entry,copy);
    const wrap=el('div','ai-meta-text-wrap');
    const pre=el('pre','ai-meta-text ai-meta-token-text');
    const fullText=String(entry.text||'');
    let expanded=fullText.length<=4000;
    const renderTokens=()=>{
      pre.textContent='';
      let used=0;
      const limit=expanded?Number.POSITIVE_INFINITY:3000;
      for(const token of tokens){
        const separator=String(token.separatorBefore||'');
        const original=String(token.text||'');
        const translation=String(token.translation||'');
        const visibleLength=separator.length+original.length+(translation?translation.length+3:0);
        if(used+visibleLength>limit){
          pre.appendChild(root.document.createTextNode('\n\n...'));
          break;
        }
        if(separator) pre.appendChild(root.document.createTextNode(separator));
        pre.appendChild(el('span',token.punctuation?'ai-meta-token-punctuation':'ai-meta-token-original',original));
        if(translation) pre.appendChild(el('span','ai-meta-token-translation',` (${translation})`));
        used+=visibleLength;
      }
    };
    renderTokens();
    wrap.appendChild(pre);
    if(fullText.length>4000){
      const button=el('button','ai-meta-expand-btn',`${copy.showFull} · ${fullText.length.toLocaleString()} ${copy.chars}`);
      button.type='button';
      button.addEventListener('click',()=>{
        expanded=!expanded;
        renderTokens();
        button.textContent=expanded?copy.collapse:`${copy.showFull} · ${fullText.length.toLocaleString()} ${copy.chars}`;
      });
      wrap.appendChild(button);
    }
    return wrap;
  }
  function promptSection(parent,title,values,copy,className){
    if(!Array.isArray(values)||!values.length) return;
    const target=section(parent,title,className);
    const limited=limitItems(values,LIMITS.prompts);
    limited.items.forEach((entry,index)=>{
      const item=el('div','ai-meta-prompt-item');
      if(values.length>1||entry.source){
        const meta=el('div','ai-meta-item-meta');
        meta.appendChild(el('span','ai-meta-index',String(index+1)));
        if(entry.source) meta.appendChild(el('span','ai-meta-source',`${copy.source}: ${entry.source}`));
        item.appendChild(meta);
      }
      item.appendChild(promptContent(entry,copy));
      target.appendChild(item);
    });
    appendLimitNote(target,limited.items.length,limited.total,copy);
  }
  function keyValueSection(parent,title,values,copy,className,limit){
    if(!Array.isArray(values)||!values.length) return;
    const target=section(parent,title,className);
    const list=el('dl','ai-meta-kv');
    const limited=limitItems(values,limit||LIMITS.settings);
    limited.items.forEach(entry=>{
      list.append(
        el('dt','ai-meta-key',entry.label||entry.key||''),
        el('dd','ai-meta-value',entry.value==null?'':entry.value)
      );
    });
    target.appendChild(list);
    appendLimitNote(target,limited.items.length,limited.total,copy);
  }
  function assetSection(parent,title,values,copy,className,isLora){
    if(!Array.isArray(values)||!values.length) return;
    const target=section(parent,title,className);
    const list=el('div','ai-meta-assets');
    const limited=limitItems(values,LIMITS.assets);
    limited.items.forEach(entry=>{
      const row=el('div','ai-meta-asset');
      row.appendChild(el('span','ai-meta-asset-kind',isLora?'LoRA':(entry.kind||'model')));
      row.appendChild(el('span','ai-meta-asset-name',entry.name||''));
      const details=[];
      if(isLora&&entry.enabled===false) details.push(copy.disabled);
      if(entry.strengthModel) details.push(entry.strengthModel);
      if(entry.strengthClip) details.push(entry.strengthClip);
      if(!isLora&&entry.label&&entry.label!==entry.name) details.push(entry.label);
      if(!isLora&&entry.weight) details.push(entry.weight);
      if(details.length) row.appendChild(el('span','ai-meta-asset-extra',details.join(' / ')));
      if(entry.hash) row.appendChild(el('span','ai-meta-asset-hash',entry.hash));
      list.appendChild(row);
    });
    target.appendChild(list);
    appendLimitNote(target,limited.items.length,limited.total,copy);
  }
  function characterSection(parent,values,copy){
    if(!Array.isArray(values)||!values.length) return;
    const target=section(parent,copy.characters,'characters');
    values.slice(0,LIMITS.prompts).forEach((entry,index)=>{
      const item=el('div','ai-meta-character');
      item.appendChild(el('div','ai-meta-character-title',`${index+1}${entry.position?` · ${entry.position}`:''}`));
      if(entry.prompt) item.appendChild(longText(entry.prompt,copy));
      if(entry.negative){
        item.appendChild(el('div','ai-meta-inline-label',copy.negative));
        item.appendChild(longText(entry.negative,copy));
      }
      target.appendChild(item);
    });
    appendLimitNote(target,Math.min(values.length,LIMITS.prompts),values.length,copy);
  }
  function passSection(parent,view,copy){
    if(!Array.isArray(view.passes)||!view.passes.length) return;
    const target=section(parent,copy.passes,'passes');
    const limited=limitItems(view.passes,LIMITS.passes);
    limited.items.forEach(pass=>{
      const details=el('details','ai-meta-pass');
      const summary=el('summary','ai-meta-pass-summary');
      const settingSummary=(pass.settings||[]).slice(0,4).map(item=>`${item.label||item.key}: ${item.value}`).join(' · ');
      summary.textContent=`${copy.pass(pass.index)} · ${pass.nodeType||pass.nodeId||''}${settingSummary?` · ${settingSummary}`:''}`;
      details.appendChild(summary);
      const body=el('div','ai-meta-pass-body');
      const passPrompts=Array.isArray(pass.promptEntries)?pass.promptEntries:(pass.prompts||[]);
      const passNegatives=Array.isArray(pass.negativePromptEntries)?pass.negativePromptEntries:(pass.negativePrompts||[]);
      passPrompts.slice(0,20).forEach(value=>body.appendChild(promptContent(value,copy)));
      passNegatives.slice(0,20).forEach(value=>{
        body.appendChild(el('div','ai-meta-inline-label',copy.negative));
        body.appendChild(promptContent(value,copy));
      });
      if(pass.settings&&pass.settings.length){
        const list=el('dl','ai-meta-kv compact');
        pass.settings.slice(0,50).forEach(entry=>list.append(el('dt','ai-meta-key',entry.label||entry.key),el('dd','ai-meta-value',entry.value)));
        body.appendChild(list);
      }
      details.appendChild(body);
      target.appendChild(details);
    });
    appendLimitNote(target,limited.items.length,limited.total,copy);
  }
  function warningLabel(value,lang){
    const warning=String(value||'');
    const zh={
      'metadata-empty':'源元数据为空','generic-fallback':'使用通用字段解析','prompt-polarity-unresolved':'无法确定提示词正负属性','sampler-node-not-recognized':'未识别到标准采样节点','non-standard-echo-checkpoint-loader':'检测到非标准 ECHO 模型加载节点','settings-line-not-recognized':'未识别到标准 A1111 参数行','lora-name-unavailable':'检测到 LoRA 节点，但源元数据未提供文件名','lora-stack-unparsed':'检测到 LoRA 堆栈，但无法安全解析其结构'
    };
    const en={
      'metadata-empty':'Source metadata is empty','generic-fallback':'Generic field parser used','prompt-polarity-unresolved':'Prompt polarity could not be resolved','sampler-node-not-recognized':'No standard sampler node recognized','non-standard-echo-checkpoint-loader':'Non-standard ECHO checkpoint loader detected','settings-line-not-recognized':'A1111 settings line was not recognized','lora-name-unavailable':'A LoRA node was found, but source metadata has no file name','lora-stack-unparsed':'A LoRA stack was found, but its structure could not be parsed safely'
    };
    const zh_tw={
      'metadata-empty':'來源元資料為空','generic-fallback':'使用通用欄位解析','prompt-polarity-unresolved':'無法判斷提示詞正負屬性','sampler-node-not-recognized':'未識別到標準採樣節點','non-standard-echo-checkpoint-loader':'偵測到非標準 ECHO 模型載入器','settings-line-not-recognized':'未識別到標準 A1111 參數行','lora-name-unavailable':'偵測到 LoRA 節點，但來源元資料未提供檔名','lora-stack-unparsed':'偵測到 LoRA 堆疊，但無法安全解析其結構'
    };
    const ja={
      'metadata-empty':'元データは空です','generic-fallback':'汎用フィールド解析を使用しました','prompt-polarity-unresolved':'プロンプトの正負を判定できませんでした','sampler-node-not-recognized':'標準サンプラーノードを認識できませんでした','non-standard-echo-checkpoint-loader':'非標準のECHOチェックポイントローダーを検出しました','settings-line-not-recognized':'標準のA1111設定行を認識できませんでした','lora-name-unavailable':'LoRAノードを検出しましたが、元データにファイル名がありません','lora-stack-unparsed':'LoRAスタックを検出しましたが、安全に解析できませんでした'
    };
    const ko={
      'metadata-empty':'원본 메타데이터가 비어 있습니다','generic-fallback':'일반 필드 파서를 사용했습니다','prompt-polarity-unresolved':'프롬프트의 긍정/부정을 판별하지 못했습니다','sampler-node-not-recognized':'표준 샘플러 노드를 찾지 못했습니다','non-standard-echo-checkpoint-loader':'비표준 ECHO 체크포인트 로더를 감지했습니다','settings-line-not-recognized':'표준 A1111 설정 줄을 인식하지 못했습니다','lora-name-unavailable':'LoRA 노드를 찾았지만 원본 메타데이터에 파일명이 없습니다','lora-stack-unparsed':'LoRA 스택을 찾았지만 구조를 안전하게 해석하지 못했습니다'
    };
    if(warning.startsWith('sampler-passes-truncated:')){
      const count=warning.split(':')[1];
      const truncated={
        zh:`为保证页面性能，省略 ${count} 个采样流程详情`,
        zh_tw:`為維持頁面效能，省略 ${count} 個採樣流程詳情`,
        ja:`ページ性能のため、${count}件のサンプリング工程詳細を省略しました`,
        ko:`페이지 성능을 위해 샘플링 단계 세부 정보 ${count}개를 생략했습니다`,
        en:`${count} sampler pass details omitted for page performance`
      };
      return truncated[lang]||truncated.en;
    }
    return ({zh,zh_tw,ja,ko,en}[lang]||en)[warning]||warning;
  }
  function render(view,options){
    if(!root.document) throw new Error('AIMetadataView requires a browser document');
    const lang=language(options&&options.lang); const copy=COPY[lang];
    const result=view&&typeof view==='object'?view:{};
    const container=el('div','ai-meta-readable');
    container.dataset.format=String(result.format||'unknown');
    const summary=el('div','ai-meta-summary');
    const generation=result.generation||{};
    [generation.family,generation.version,generation.type,result.format].filter(Boolean).forEach((value,index)=>summary.appendChild(el('span',index===0?'ai-meta-family':'ai-meta-badge',value)));
    if(result.workflow){
      const workflow=result.workflow;
      summary.appendChild(el('span','ai-meta-workflow-summary',`${copy.workflow}: ${workflow.nodeCount||0} ${copy.nodes} · ${workflow.linkCount||0} ${copy.links} · ${workflow.passCount||0} ${copy.totalPasses}`));
    }
    container.appendChild(summary);
    if(result.sourceEmpty){
      container.appendChild(el('div','ai-meta-empty',copy.empty));
      return container;
    }
    promptSection(container,copy.prompt,result.prompts,copy,'positive');
    promptSection(container,copy.negative,result.negativePrompts,copy,'negative');
    characterSection(container,result.characters,copy);
    assetSection(container,copy.models,result.models,copy,'models',false);
    assetSection(container,copy.loras,result.loras,copy,'loras',true);
    keyValueSection(container,copy.settings,result.settings,copy,'settings',LIMITS.settings);
    passSection(container,result,copy);
    keyValueSection(container,copy.other,result.other,copy,'other',LIMITS.other);
    if(result.workflow&&result.workflow.omittedPassCount){
      container.appendChild(el('div','ai-meta-limit-note prominent',copy.omitted(result.workflow.omittedPassCount)));
    }
    if(Array.isArray(result.warnings)&&result.warnings.length){
      const target=section(container,copy.notes,'warnings');
      const list=el('ul','ai-meta-warning-list');
      result.warnings.forEach(value=>list.appendChild(el('li','',warningLabel(value,lang))));
      target.appendChild(list);
    }
    return container;
  }

  return {VERSION,render};
});
