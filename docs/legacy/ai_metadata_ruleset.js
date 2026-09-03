(function(root){
  'use strict';

  const versions={
    v1:{path:'/ai_metadata.v1.js',cache:'38902176'},
    v2:{path:'/ai_metadata.v2.js',cache:'c43470f2'},
    v3:{
      path:'/ai_metadata.v3.js',cache:'f032c89e',
      deps:[
        {path:'/comfyui_v3_contracts.js',cache:'35868c0c'},
        {path:'/comfyui_v3_literals.js',cache:'9cb3811d'},
        {path:'/comfyui_v3_subgraph.js',cache:'44684ceb'},
        {path:'/comfyui_v3_expander.js',cache:'3dc7f12f'},
        {path:'/comfyui_v3_classifier.js',cache:'65129f75'}
      ]
    }
  };
  let requested='';
  try{
    requested=new URLSearchParams(root.location.search).get('ai_metadata_ruleset')||'';
  }catch{}
  const selected=Object.prototype.hasOwnProperty.call(versions,requested)?requested:'v2';
  const version=versions[selected];
  root.AI_METADATA_RULESET=selected;
  root.AI_METADATA_RULESET_SHA256=selected==='v1'
    ?'38902176dcd349726bf649903c1163bf3393a85724157a2ff07bf15cec38d51a'
    :selected==='v2'
      ?'c43470f2f4812015feebc30cf4d21fbb6e9b90a3da8a9025b966645c68035e61'
      :'f032c89ecaf5f06ef0edcb8e66ea77a80a1aeb79410cc556347579afc32070be';
  (version.deps||[]).forEach(dep=>{
    document.write(`<script src="${dep.path}?v=${dep.cache}"><\/script>`);
  });
  document.write(`<script src="${version.path}?v=${version.cache}"><\/script>`);
})(window);
