import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSource } from './load-builder.mjs';
const [commands, geometry, model, runtime, theme, flow, auto, history] = await Promise.all(['commands','geometry','model','runtime','theme','flow','autoLayout','history'].map(loadSource));
const sample = JSON.parse(await readFile(new URL('../src/builder/contracts/ushiku-demo.machi.json', import.meta.url), 'utf8'));
const legacy = JSON.parse(await readFile(new URL('../src/builder/contracts/ushiku-demo.v1.machi.json', import.meta.url), 'utf8'));
const design = () => structuredClone(sample), sid = sample.screens[0].id;
const run = (source, ids, command, device='desktop', screenId=sid) => commands.applyCommand(source,screenId,device,ids,command);
const component = (source,id) => source.screens.flatMap(screen=>screen.components).find(item=>item.id===id);
const valid = source => assert.deepEqual(model.validateDesign(source).errors, []);

test('v2: v1は検査後に移行し、ID・地点・配置・個別色を保持する', () => {
  const old = structuredClone(legacy); old.screens[0].components[0].style.background = '#112233';
  const result = model.validateDesign(old); valid(result.design);
  assert.equal(result.design.schemaVersion,2); assert.equal(old.schemaVersion,1);
  assert.deepEqual(result.design.datasets,old.datasets); assert.deepEqual(result.design.screens,old.screens);
  const bad = structuredClone(old); bad.theme.managed=true;
  assert.ok(model.validateDesign(bad).errors.length);
  const next=design(); next.screens[0].implementationNote='画面の仕様'; next.screens[0].components[0].editor={locked:true};
  next.theme={...theme.themePreset(next,'blue','dark'),font:'serif',scale:1.125,shape:'round'}; valid(next);
  assert.ok(model.describeDiff(sample,next).some(text=>text.includes('仕様メモ')));
  next.screens[0].components[0].editor.unknown=true; assert.ok(model.validateDesign(next).errors.length);
});

test('commands: 複数移動・整列・Undoは論理pxと相対距離を保つ', () => {
  const before=design(), ids=['search','show-list'];
  const moved=run(before,ids,{type:'move',dx:10,dy:-1}).design; valid(moved);
  for(const id of ids){assert.equal(component(moved,id).layouts.desktop.x,component(before,id).layouts.desktop.x+10);assert.equal(component(moved,id).layouts.mobile.x,component(before,id).layouts.mobile.x);}
  const aligned=run(moved,ids,{type:'align',alignment:'right',relativeTo:'selection'}).design; valid(aligned);
  const a=component(aligned,ids[0]).layouts.desktop,b=component(aligned,ids[1]).layouts.desktop;
  assert.equal(a.x+a.width,b.x+b.width);
  const state=history.commitHistory({past:[],present:before,future:[]},moved);
  assert.equal(state.past.length,1);assert.deepEqual(state.past[0],before);
  assert.equal(history.commitHistory(state,moved),state);
});

test('commands: 範囲外配置は強制修正せず警告し、全削除も1履歴で戻せる',()=>{
  const before=design();const moved=run(before,['search'],{type:'move',dx:-100,dy:0}).design;
  assert.equal(component(moved,'search').layouts.desktop.x,-84);assert.ok(geometry.overflowWarnings(moved.screens[0],'desktop').length);valid(moved);
  const cleared=run(before,before.screens[0].components.map(item=>item.id),{type:'delete'}).design;valid(cleared);assert.equal(cleared.screens[0].components.length,0);
  assert.deepEqual(history.commitHistory({past:[],present:before,future:[]},cleared).past[0],before);
});

test('groups: 両端末の見た目と重なり順を保ち、親子同時選択は二重に動かさない', () => {
  const before=design();
  // z順で連続する2部品を選ぶ。
  const ids=geometry.ordered(before.screens[0].components,'desktop').slice(1,3).map(item=>item.id);
  for(const device of ['desktop','mobile']) geometry.ordered(before.screens[0].components,device).forEach((item,i)=>item.layouts[device].zIndex=i+1);
  const result=run(before,ids,{type:'group'}); assert.deepEqual(result.warnings,[]); valid(result.design);
  const group=result.selection[0];
  for(const device of ['desktop','mobile']) for(const id of ids) assert.deepEqual(geometry.worldRect(result.design.screens[0],component(result.design,id),device),geometry.worldRect(before.screens[0],component(before,id),device));
  const moved=run(result.design,[group,...ids],{type:'move',dx:30,dy:20}).design;
  for(const id of ids){const rect=geometry.worldRect(moved.screens[0],component(moved,id),'desktop');const old=geometry.worldRect(before.screens[0],component(before,id),'desktop');assert.equal(rect.x,old.x+30);assert.equal(rect.y,old.y+20);}
  const ungrouped=run(result.design,[group],{type:'ungroup'}).design;valid(ungrouped);
  for(const device of ['desktop','mobile']) for(const id of ids) assert.deepEqual(geometry.worldRect(ungrouped.screens[0],component(ungrouped,id),device),geometry.worldRect(before.screens[0],component(before,id),device));
  const loaded=model.validateDesign(JSON.parse(JSON.stringify(result.design))).design;assert.deepEqual(loaded,result.design);
  assert.ok(run(result.design,[group],{type:'layout',patches:{[group]:{width:999}}}).warnings.length);
  assert.ok(run(before,['heading','detail'],{type:'group'}).warnings.length);
});

test('groups: 全9部品の隣接組合せと入れ子で座標・保存形式が成立する',()=>{
  const before=design();before.screens[0].components.push(runtime.createComponent('text',before,before.screens[0]));
  for(const device of ['desktop','mobile'])before.screens[0].components.forEach((item,i)=>item.layouts[device].zIndex=i+1);
  for(let i=0;i<before.screens[0].components.length-1;i++){
    const ids=before.screens[0].components.slice(i,i+2).map(item=>item.id),grouped=run(before,ids,{type:'group'});
    assert.deepEqual(grouped.warnings,[]);valid(grouped.design);
    const other=before.screens[0].components[i===0?2:i-1].id,nested=run(grouped.design,[...grouped.selection,other],{type:'group'});
    assert.deepEqual(nested.warnings,[]);valid(nested.design);
    for(const device of ['desktop','mobile'])for(const id of [...ids,other])assert.deepEqual(geometry.worldRect(nested.design.screens[0],component(nested.design,id),device),geometry.worldRect(before.screens[0],component(before,id),device));
  }
});

test('locks: 子孫とロックされた子を含む親を保護し、色・内容・コピーは許可する', () => {
  const grouped=run(design(),['search','show-list'],{type:'group'});assert.deepEqual(grouped.warnings,[]);
  const locked=run(grouped.design,['search'],{type:'lock',locked:true}).design, group=grouped.selection[0];
  for(const command of [{type:'move',dx:4,dy:0},{type:'delete'},{type:'ungroup'},{type:'preset-size',axis:'height',value:56}]){const result=run(locked,[group],command);assert.equal(result.design,locked);assert.ok(result.warnings.length);}
  const colored=run(locked,['search'],{type:'style',patch:{background:'#aabbcc'}}).design;valid(colored);
  assert.deepEqual(component(colored,'search').layouts,component(locked,'search').layouts);
  assert.equal(run(locked,[group],{type:'duplicate'}).selection.length,3);
});

test('clipboard: 子孫・自己参照・選択内参照を新IDへ対応し、地点は増やさない', () => {
  const source=design(), result=run(source,['map','detail'],{type:'duplicate'});valid(result.design);
  const copies=result.selection.map(id=>component(result.design,id)), map=copies.find(item=>item.kind==='map-view'),detail=copies.find(item=>item.kind==='place-detail');
  assert.equal(map.interactions[0].actions[1].targetId,detail.id);assert.equal(detail.interactions[0].actions[0].targetId,detail.id);
  assert.deepEqual(result.design.datasets,source.datasets); assert.equal(map.layouts.desktop.x,component(source,'map').layouts.desktop.x+24);
  const again=run(result.design,['map','detail'],{type:'duplicate'});assert.equal(new Set(again.design.screens[0].components.map(item=>item.id)).size,again.design.screens[0].components.length);
  const group=run(source,['search','show-list'],{type:'group'}); const clip=commands.copyComponents(group.design,sid,['search']);
  assert.equal(clip.components[0].parentId,null);assert.equal(clip.components[0].layouts.desktop.x,geometry.worldRect(group.design.screens[0],component(group.design,'search'),'desktop').x);
});

test('clipboard: 別画面は24px起点。無効な操作先を黙って消さず適用を止める', () => {
  const source=design(), next=runtime.createScreen(source);source.screens.push(next);
  const clip=commands.copyComponents(source,sid,['map']);
  assert.ok(run(source,[],{type:'paste',clipboard:clip},'desktop',next.id).warnings.some(text=>text.includes('操作先')));
  const both=commands.copyComponents(source,sid,['map','detail']);
  const result=run(source,[],{type:'paste',clipboard:both},'desktop',next.id);valid(result.design);
  for(const device of ['desktop','mobile']){const roots=result.selection.map(id=>component(result.design,id)).filter(item=>!item.parentId);const box=geometry.bounds(roots.map(item=>item.layouts[device]));assert.equal(box.x,24);assert.equal(box.y,24);}
  both.projectId='another';assert.ok(run(source,[],{type:'paste',clipboard:both}).warnings.length);
});

test('theme: 移行直後は個別外観を保ち、個別指定・プリセット・標準値の順で適用する', () => {
  const source=design(), fab=source.screens[0].components.find(item=>item.kind==='floating-action') || runtime.createComponent('floating-action',source,source.screens[0]);
  assert.deepEqual(theme.resolveAppearance(source,fab),fab.style);
  source.theme=theme.themePreset(source,'blue','dark');fab.style={variant:'outline'};
  assert.equal(theme.resolveAppearance(source,fab).color,source.theme.accent);
  fab.style.color='#123456';assert.equal(theme.resolveAppearance(source,fab).color,'#123456');
  source.screens[0].components.push({...fab,id:'test-fab'});valid(source);
  const reset=run(source,['test-fab'],{type:'style',patch:{},reset:['color']}).design;
  assert.equal(theme.resolveAppearance(reset,component(reset,'test-fab')).color,source.theme.accent);
  for(const key of Object.keys(theme.palettes)){source.theme=theme.themePreset(source,key,'light');assert.ok(theme.contrastRatio(source.theme.background,source.theme.foreground)>4.5);valid(source);}
});

test('prompt: 画面限定でも全体JSON、仕様メモ、公開列のみを出力する', () => {
  const source=design();source.screens[0].implementationNote='専用仕様メモ';source.screens.push(runtime.createScreen(source));
  source.datasets[0].columns.push({key:'private',type:'string',visibility:'internal'});source.datasets[0].rows[0].values.private='SECRET';source.datasets[0].source={kind:'inline',label:'x',url:'https://private.example'};
  const sections=runtime.buildHandoffSections(source,sid), text=runtime.buildHandoffMarkdown(source,sid);
  assert.equal(sections.length,7);assert.match(text,/他の画面・地点データを変更しない/);assert.match(text,/専用仕様メモ/);
  const json=JSON.parse(sections.find(item=>item.id==='json').text.split('```json\n')[1].split('\n```')[0]);assert.equal(json.screens.length,2);
  assert.ok(!text.includes('SECRET'));assert.ok(!text.includes('https://private.example'));assert.match(text,/動作指定なし/);
});

test('flow: 循環・到達不可・未設定を検出し、戻る効果の向きを反転する', () => {
  const source=design(), second=runtime.createScreen(source),third=runtime.createScreen({...source,screens:[...source.screens,second]}); source.screens.push(second,third);
  source.screens[0].components[0].interactions=[{event:'activate',actions:[{type:'navigate',screen:{source:'literal',value:second.id},transition:{type:'slide',direction:'left',durationMs:200}}]}];
  second.components[0].interactions=[{event:'activate',actions:[{type:'go-back',fallbackScreenId:sid}]}];
  const result=flow.screenFlow(source);assert.equal(result.edges.length,2);assert.ok(result.warnings.some(text=>text.includes(third.name)));
  assert.equal(flow.reverseTransition(result.edges[0] && source.screens[0].components[0].interactions[0].actions[0].transition).direction,'right');
  source.screens[0].components[0].interactions[0].actions[0].screen.value='missing';assert.ok(flow.screenFlow(source).warnings.some(text=>text.includes('不明')));
});

test('preview: 連続した画面遷移と戻るが実履歴と方向を保持する', () => {
  const source=design(), b=runtime.createScreen(source),c=runtime.createScreen({...source,screens:[...source.screens,b]});source.screens.push(b,c);
  const action=id=>({type:'navigate',screen:{source:'literal',value:id},transition:{type:'slide',direction:'left',durationMs:200}});
  let state=runtime.initialPreview(source.screens[0],'desktop');state=runtime.navigatePreview(state,source,'desktop',action(b.id),{});state=runtime.navigatePreview(state,source,'desktop',action(c.id),{});
  assert.deepEqual(state.screenHistory,[sid,b.id]);
  state=runtime.navigatePreview(state,source,'desktop',{type:'go-back',fallbackScreenId:sid},{});assert.equal(state.activeScreenId,b.id);assert.equal(state.transition.direction,'right');
  state=runtime.navigatePreview(state,source,'desktop',{type:'go-back',fallbackScreenId:sid},{});assert.equal(state.activeScreenId,sid);assert.equal(state.screenHistory.length,0);
  assert.equal(runtime.navigatePreview(state,source,'desktop',action('missing'),{}),state);
});

test('handoff: 操作から渡されない値を推測で補わず、不足を表示する',()=>{
  const source=design(), button=component(source,'show-list');button.interactions=[{event:'activate',actions:[{type:'open-url',value:{source:'event',key:'url'},newTab:true}]}];
  assert.ok(flow.actionWarnings(button).some(text=>text.includes('渡されません')));assert.match(runtime.buildHandoffMarkdown(source),/渡されません/);
  button.interactions[0].actions[0].value={source:'literal',value:'https://example.com'};assert.deepEqual(flow.actionWarnings(button),[]);
});

test('auto layout: PC・スマホを組替え、データ・内容・動作・色を保持し1履歴で戻す', () => {
  const source=design(), result=auto.proposeLayout(source,sid,['desktop','mobile'],'map');assert.deepEqual(result.errors,[]);assert.ok(result.changes>0);valid(result.design);
  assert.deepEqual(source,sample);assert.deepEqual(result.design.datasets,source.datasets);
  for(const item of source.screens[0].components){const changed=component(result.design,item.id);for(const key of ['props','binding','interactions','style']) assert.deepEqual(changed[key],item[key]);}
  const state=history.commitHistory({past:[],present:source,future:[]},result.design);assert.equal(state.past.length,1);assert.deepEqual(state.past[0],source);
  const locked=run(source,['search'],{type:'lock',locked:true}).design;
  const proposal=auto.proposeLayout(locked,sid,['desktop'],'map');if(proposal.design)assert.deepEqual(component(proposal.design,'search').layouts,component(locked,'search').layouts);
  const duplicate=run(source,['map','detail'],{type:'duplicate'}).design;assert.ok(auto.proposeLayout(duplicate,sid,['desktop'],'').errors.some(text=>text.includes('主地図')));
  source.screens[0].frames.mobile.height=200;assert.ok(auto.proposeLayout(source,sid,['mobile'],'map').errors.length);
  assert.ok(auto.proposeLayout(source,sid,[],'map').errors.length);
});

test('auto layout: ロック衝突・非対応部品は拒否し、グループ内部は変えない',()=>{
  const source=design();for(const device of ['desktop','mobile'])source.screens[0].components.forEach((item,i)=>item.layouts[device].zIndex=i+1);
  const grouped=run(source,['search','categories'],{type:'group'}), proposal=auto.proposeLayout(grouped.design,sid,['desktop'],'map');assert.deepEqual(proposal.errors,[]);valid(proposal.design);
  for(const id of ['search','categories'])assert.deepEqual(component(proposal.design,id).layouts,component(grouped.design,id).layouts);
  const fixed=component(source,'count');fixed.editor={locked:true};Object.assign(fixed.layouts.desktop,{x:16,y:88,width:280,height:48});assert.ok(auto.proposeLayout(source,sid,['desktop'],'map').errors.some(text=>text.includes('衝突')));
  component(source,'search').kind='unsupported';assert.ok(auto.proposeLayout(source,sid,['desktop'],'map').errors.some(text=>text.includes('未対応')));
});

test('auto layout: 再適用は不要な差分を作らず、地図・ボタン・パネルの順序を維持する',()=>{
  const first=auto.proposeLayout(design(),sid,['desktop','mobile'],'map');assert.deepEqual(first.errors,[]);
  const second=auto.proposeLayout(first.design,sid,['desktop','mobile'],'map');assert.deepEqual(second.errors,[]);assert.equal(second.changes,0);assert.deepEqual(first.design,second.design);
  for(const device of ['desktop','mobile']){const map=component(first.design,'map').layouts[device],button=component(first.design,'show-list').layouts[device],list=component(first.design,'places').layouts[device],detail=component(first.design,'detail').layouts[device];assert.ok(map.zIndex<button.zIndex);assert.ok(button.zIndex<list.zIndex);assert.ok(list.zIndex<detail.zIndex);}
});
