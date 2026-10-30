import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadSource } from '../tests/load-editor.mjs';
const runtime=await loadSource('runtime'),model=await loadSource('model'),commands=await loadSource('commands');
const design=JSON.parse(await readFile(new URL('../src/editor/contracts/map-sample.machi.json',import.meta.url),'utf8'));
design.id='editor-evaluation'; design.title='machi. 操作評価用';
const main=design.screens[0];main.components.push(runtime.createComponent('text',design,main));
for(const device of ['desktop','mobile'])main.components.forEach((component,index)=>component.layouts[device].zIndex=index+1);
main.components.find(component=>component.id==='count').editor={locked:true};
const second=runtime.createScreen(design);design.screens.push(second);second.name='詳細案内';
const third=runtime.createScreen(design);design.screens.push(third);third.name='利用案内';
function button(screen,label,actions,x,y){
  const item=runtime.createComponent('floating-action',design,screen);item.name=label;item.props.label=label;item.interactions=[{event:'activate',actions}];
  for(const device of ['desktop','mobile'])Object.assign(item.layouts[device],{x,y,width:180,height:48,hidden:false,presentation:'inline'});
  screen.components.push(item);return item;
}
button(main,'案内へ',[{type:'navigate',screen:{source:'literal',value:second.id},transition:{type:'slide',direction:'left',durationMs:200}}],24,728);
button(second,'戻る',[{type:'go-back',fallbackScreenId:main.id}],24,96);
button(second,'利用案内へ',[{type:'navigate',screen:{source:'literal',value:third.id},transition:{type:'fade',direction:'up',durationMs:200}}],224,96);
button(third,'戻る',[{type:'go-back',fallbackScreenId:second.id}],24,96);
main.implementationNote='検索とカテゴリを併用し、地点一覧と地図の結果を一致させる。';
const checked=model.validateDesign(design);if(!checked.design)throw new Error(checked.errors.join('\n'));
await mkdir(new URL('../tests/fixtures/',import.meta.url),{recursive:true});
await writeFile(new URL('../tests/fixtures/editor-evaluation.machi.json',import.meta.url),JSON.stringify(design,null,2)+'\n');
const grouped=commands.applyCommand(design,main.id,'desktop',['search','categories'],{type:'group'});
if(grouped.warnings.length || !model.validateDesign(grouped.design).design)throw new Error('Grouped evaluation design is invalid');
await writeFile(new URL('../tests/fixtures/editor-evaluation.grouped.machi.json',import.meta.url),JSON.stringify(grouped.design,null,2)+'\n');
console.log('Evaluation design created: 3 screens, locked count, screen transitions.');
