// node fix-hashtags.js <agentDir> — normalize hashtags on cattle Shorts: #shorts #fyp first, max 12 tags
const path=require('path'),fs=require('fs');const dir=path.resolve(process.argv[2]);
const {google}=require(path.join(dir,'node_modules','googleapis'));
const c=JSON.parse(fs.readFileSync(path.join(dir,'config/credentials.json'))),t=JSON.parse(fs.readFileSync(path.join(dir,'config/tokens.json')));
const a=new google.auth.OAuth2(c.youtube.client_id,c.youtube.client_secret);a.setCredentials(t.youtube);
const yt=google.youtube({version:'v3',auth:a});
const IDS=['-XgeGsGDQQk','a29wONq7hZM','nTn7vZ7wv-M','r2LjS1V_OLc','IPvF40Xeh-Y','ERN64kSmfDE','LaDukJ0SZpg','MfKgrRyPYm0'];
const CORE=['#shorts','#fyp','#cattle','#beef','#ranching','#thecattleledger'];
(async()=>{for(const v of (await yt.videos.list({part:'snippet',id:IDS.join(',')})).data.items){
  const sn=v.snippet; const lines=sn.description.split('\n');
  const old=(sn.description.match(/#[A-Za-z0-9_]+/g)||[]).map(h=>h.toLowerCase());
  const body=lines.filter(l=>!/^\s*(#[A-Za-z0-9_]+\s*)+$/.test(l)).join('\n').trimEnd();
  const tags=[...new Set([...CORE,...old,'#farming','#agriculture'])].slice(0,12);
  const desc=body+'\n\n'+tags.join(' ');
  await yt.videos.update({part:'snippet',requestBody:{id:v.id,snippet:{title:sn.title,description:desc,tags:sn.tags,categoryId:sn.categoryId,defaultLanguage:sn.defaultLanguage,defaultAudioLanguage:sn.defaultAudioLanguage}}});
  console.log(v.id,'|',tags.join(' '));
}})().catch(e=>console.error('FAILED',e.message));
