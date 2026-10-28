export function chooseCategory(vector, categories, minimum=.22, margin=.025){
 const ranked=categories.map(c=>({name:c.name,score:vector.reduce((sum,x,i)=>sum+x*c.vector[i],0)})).sort((a,b)=>b.score-a.score);
 if(!ranked.length||!Number.isFinite(ranked[0].score)||ranked[0].score<minimum||(ranked[1]&&ranked[0].score-ranked[1].score<margin))return '待確認';
 return ranked[0].name;
}
export function parseCategories(text){
 const names=[...new Set(text.split(/[\n,，、]/).map(s=>s.trim()).filter(Boolean))];
 if(names.length<2||names.length>16)throw new Error('請輸入 2–16 個分類，用逗號或換行分隔。');
 if(names.some(n=>n.length>40||/[\\/:*?"<>|\x00-\x1f]/.test(n)||/[. ]$/.test(n)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(n)))throw new Error('分類名稱請用 40 字以內的文字，避免特殊符號或系統保留名稱。');
 if(names.some(n=>n==='待確認'||n==='未能分析'))throw new Error('「待確認」與「未能分析」由系統保留，請使用其他分類名稱。');
 if(new Set(names.map(n=>n.toLowerCase())).size!==names.length)throw new Error('分類名稱不可只用大小寫區分。');
 return names;
}
