const path=require('path'),fs=require('fs');const dir=path.resolve(process.argv[2]);const B=process.argv[3];
const {google}=require(path.join(dir,'node_modules','googleapis'));
const c=JSON.parse(fs.readFileSync(path.join(dir,'config/credentials.json'))),t=JSON.parse(fs.readFileSync(path.join(dir,'config/tokens.json')));
const a=new google.auth.OAuth2(c.youtube.client_id,c.youtube.client_secret);a.setCredentials(t.youtube);
const yt=google.youtube({version:'v3',auth:a});
const step=async(n,f)=>{try{console.log('OK  ',n,(await f())||'')}catch(e){console.log('FAIL',n,'-',e.errors?.[0]?.reason||'',e.message)}};
const CATTLE=['MfKgrRyPYm0','LaDukJ0SZpg','ERN64kSmfDE','IPvF40Xeh-Y','r2LjS1V_OLc','nTn7vZ7wv-M','a29wONq7hZM','-XgeGsGDQQk'];
(async()=>{
 const ch=(await yt.channels.list({part:'brandingSettings,snippet',mine:true})).data.items[0];
 let bannerUrl;
 await step('banner upload',async()=>{const r=await yt.channelBanners.insert({media:{mimeType:'image/jpeg',body:fs.createReadStream(B+'/banner.jpg')}});bannerUrl=r.data.url;return 'uploaded'});
 let plId;
 await step('playlist',async()=>{const ls=(await yt.playlists.list({part:'snippet,status',mine:true,maxResults:50})).data.items;
   for(const p of ls){ if(p.snippet.title!=='The Cattle Ledger: Beef & Cattle Economics' && p.status.privacyStatus==='public'){await yt.playlists.update({part:'snippet,status',requestBody:{id:p.id,snippet:{title:p.snippet.title,description:p.snippet.description},status:{privacyStatus:'private'}}});console.log('     hid old playlist:',p.snippet.title)}}
   const f=ls.find(p=>p.snippet.title==='The Cattle Ledger: Beef & Cattle Economics');
   plId=f?f.id:(await yt.playlists.insert({part:'snippet,status',requestBody:{snippet:{title:'The Cattle Ledger: Beef & Cattle Economics',description:'What cattle and beef really cost: from the ranch to the sale barn to the grocery store. Every number comes from USDA data.',defaultLanguage:'en'},status:{privacyStatus:'public'}}})).data.id;
   for(const v of CATTLE){const ex=await yt.playlistItems.list({part:'snippet',playlistId:plId,videoId:v});if(!ex.data.items.length)await yt.playlistItems.insert({part:'snippet',requestBody:{snippet:{playlistId:plId,resourceId:{kind:'youtube#video',videoId:v}}}});}
   fs.writeFileSync(path.join(B,'playlist-id.txt'),plId);return plId});
 await step('branding (trailer, country, language, banner)',async()=>{const b=ch.brandingSettings;b.channel.unsubscribedTrailer='r2LjS1V_OLc';b.channel.country='US';b.channel.defaultLanguage='en';
   if(bannerUrl){b.image=b.image||{};b.image.bannerExternalUrl=bannerUrl;}
   const r=await yt.channels.update({part:'brandingSettings',requestBody:{id:ch.id,brandingSettings:b}});return JSON.stringify({trailer:r.data.brandingSettings.channel.unsubscribedTrailer,country:r.data.brandingSettings.channel.country})});
 await step('subscribe watermark',async()=>{await yt.watermarks.set({channelId:ch.id,requestBody:{timing:{type:'offsetFromEnd',offsetMs:'15000'},position:{type:'corner',cornerPosition:'topRight'},imageUrl:''},media:{mimeType:'image/png',body:fs.createReadStream(B+'/wm.png')}});return 'set'});
 await step('home section: playlist',async()=>{if(!plId)throw new Error('no playlist');const r=await yt.channelSections.insert({part:'snippet,contentDetails',requestBody:{snippet:{type:'singlePlaylist',position:0},contentDetails:{playlists:[plId]}}});return r.data.id});
})();
