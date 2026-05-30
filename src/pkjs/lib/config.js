// JSON.stringify does not escape "</script>" or "<!--", so a free-text label
// could break out of the <script type="application/json"> island. Neutralize
// both sequences before embedding.
function safeJson(obj) {
  return JSON.stringify(obj).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\u0021--');
}

function buildConfigHtml(nearestPos, favs, stationDB) {
  var initState = safeJson({ nearestPos: nearestPos, favs: favs });
  var db = safeJson(stationDB);
  return '<!DOCTYPE html>\n' +
'<html><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1">' +
'<title>MTA Favorites</title><style>' +
'body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:0;background:#111;color:#eee}' +
'header{background:#0a84ff;color:#fff;padding:14px 16px;font-size:18px;font-weight:600}' +
'section{padding:12px 16px}h2{font-size:13px;text-transform:uppercase;color:#9aa;margin:8px 0}' +
'.fav{display:flex;align-items:center;gap:8px;background:#1c1c1e;border-radius:10px;padding:8px;margin:6px 0}' +
'.fav .meta{flex:1;min-width:0}.fav .name{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
'.fav input{width:100%;box-sizing:border-box;background:#2c2c2e;border:0;border-radius:6px;color:#fff;padding:6px;margin-top:4px;font-size:14px}' +
'.fav button{background:#3a3a3c;border:0;color:#fff;border-radius:6px;width:32px;height:32px;font-size:16px}' +
'.fav button.rm{background:#5a1f1f}' +
'#search{width:100%;box-sizing:border-box;background:#2c2c2e;border:0;border-radius:8px;color:#fff;padding:10px;font-size:15px}' +
'#results{list-style:none;margin:8px 0 0;padding:0}#results li{padding:10px;background:#1c1c1e;border-radius:8px;margin:4px 0}' +
'#save{position:sticky;bottom:0;width:100%;border:0;background:#0a84ff;color:#fff;padding:16px;font-size:17px;font-weight:600}' +
'.hint{color:#888;font-size:12px;padding:0 16px 8px}' +
'</style></head><body>' +
'<header>MTA Favorites</header>' +
'<section><h2>Your stations</h2><div id="favs"></div>' +
'<div class="hint" id="cap"></div></section>' +
'<section><h2>Add a station</h2>' +
'<input id="search" placeholder="Search stations…" autocomplete="off">' +
'<ul id="results"></ul></section>' +
'<button id="save">Save</button>' +
'<script type="application/json" id="init-state">' + initState + '</script>' +
'<script type="application/json" id="station-db">' + db + '</script>' +
'<script>(function(){' +
'var MAX=10;' +
'var state=JSON.parse(document.getElementById("init-state").textContent);' +
'var DB=JSON.parse(document.getElementById("station-db").textContent);' +
'function disp(s){return s.name+(s.lines&&s.lines.length?" ("+s.lines.join("")+")":"");}' +
'function getReturn(){var m=location.search.match(/return_to=([^&]+)/);return m?decodeURIComponent(m[1]):"pebblejs://close#";}' +
'function renderFavs(){' +
'var c=document.getElementById("favs");c.innerHTML="";' +
'state.favs.forEach(function(f,i){' +
'var row=document.createElement("div");row.className="fav";' +
'var meta=document.createElement("div");meta.className="meta";' +
'var nm=document.createElement("div");nm.className="name";nm.textContent=f.name;' +
'var inp=document.createElement("input");inp.placeholder="Label (optional)";inp.value=f.label||"";' +
'inp.oninput=function(){state.favs[i].label=inp.value;};' +
'meta.appendChild(nm);meta.appendChild(inp);' +
'var up=document.createElement("button");up.textContent="\\u2191";up.onclick=function(){move(i,-1);};' +
'var dn=document.createElement("button");dn.textContent="\\u2193";dn.onclick=function(){move(i,1);};' +
'var rm=document.createElement("button");rm.className="rm";rm.textContent="\\u2715";rm.onclick=function(){state.favs.splice(i,1);renderFavs();};' +
'row.appendChild(meta);row.appendChild(up);row.appendChild(dn);row.appendChild(rm);' +
'c.appendChild(row);});' +
'document.getElementById("cap").textContent=state.favs.length+"/"+MAX+" favorites";' +
'}' +
'function move(i,d){var j=i+d;if(j<0||j>=state.favs.length)return;var t=state.favs[i];state.favs[i]=state.favs[j];state.favs[j]=t;renderFavs();}' +
'function search(q){' +
'var ul=document.getElementById("results");ul.innerHTML="";if(!q){return;}' +
'var ql=q.toLowerCase(),shown=0;' +
'for(var k=0;k<DB.length&&shown<25;k++){var s=DB[k];if(s.name.toLowerCase().indexOf(ql)<0)continue;' +
'(function(st){var li=document.createElement("li");li.textContent=disp(st);' +
'li.onclick=function(){add(st);};ul.appendChild(li);})(s);shown++;}' +
'}' +
'function add(st){' +
'if(state.favs.length>=MAX)return;' +
'for(var k=0;k<state.favs.length;k++)if(state.favs[k].id===st.id)return;' +
'state.favs.push({id:st.id,name:disp(st),label:""});' +
'document.getElementById("search").value="";search("");renderFavs();' +
'}' +
'document.getElementById("search").addEventListener("input",function(e){search(e.target.value);});' +
'document.getElementById("save").addEventListener("click",function(){' +
'var data=encodeURIComponent(JSON.stringify({nearestPos:state.nearestPos,favs:state.favs}));' +
'var r=getReturn();location=r+(r.indexOf("#")>=0?"":"#")+data;' +
'});' +
'renderFavs();' +
'})();</script></body></html>';
}

module.exports = { buildConfigHtml: buildConfigHtml };
