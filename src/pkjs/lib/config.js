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
'<title>Transit Favorites</title><style>' +
'body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:0;background:#111;color:#eee}' +
'header{background:#0a84ff;color:#fff;padding:14px 16px;font-size:18px;font-weight:600}' +
'section{padding:12px 16px}h2{font-size:13px;text-transform:uppercase;color:#9aa;margin:8px 0}' +
'.fav{display:flex;align-items:center;gap:8px;background:#1c1c1e;border-radius:10px;padding:8px;margin:6px 0}' +
'.fav .meta{flex:1;min-width:0}.fav .name{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
'.fav input{width:100%;box-sizing:border-box;background:#2c2c2e;border:0;border-radius:6px;color:#fff;padding:6px;margin-top:4px;font-size:14px}' +
'.fav button{background:#3a3a3c;border:0;color:#fff;border-radius:6px;width:32px;height:32px;font-size:16px}' +
'.fav button.rm{background:#5a1f1f}' +
'#search{width:100%;box-sizing:border-box;background:#2c2c2e;border:0;border-radius:8px;color:#fff;padding:10px;font-size:15px}' +
'#results{list-style:none;margin:8px 0 0;padding:0}#results li{padding:10px;background:#1c1c1e;border-radius:8px;margin:4px 0;display:flex;align-items:center}' +
'#save{position:sticky;bottom:0;width:100%;border:0;background:#0a84ff;color:#fff;padding:16px;font-size:17px;font-weight:600}' +
'.hint{color:#888;font-size:12px;padding:0 16px 8px}' +
'.cb{display:inline-block;min-width:30px;text-align:center;font-size:10px;font-weight:700;color:#fff;border-radius:5px;padding:2px 5px;margin-right:6px;vertical-align:middle}' +
'.chip{background:#2c2c2e;border:0;color:#bbb;border-radius:14px;padding:5px 10px;margin:0 4px 6px 0;font-size:12px}.chip.on{background:#0a84ff;color:#fff}' +
'#chips{padding:8px 16px 0}' +
'</style></head><body>' +
'<header>Transit Favorites</header>' +
'<section><h2>Your stations</h2><div id="favs"></div>' +
'<div class="hint" id="cap"></div></section>' +
'<div id="chips"></div>' +
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
// One distinct, city-iconic color per agency (used for the row badge AND the
// filter chip). Kept visually separable so every city reads uniquely.
'var AGENCY_META={mta:{city:"NYC",c:"#0039A6"},cta:{city:"CHI",c:"#2A8FD4"},wmata:{city:"DC",c:"#C8102E"},marta:{city:"ATL",c:"#F2A900"},lametro:{city:"LA",c:"#0098A9"},bart:{city:"SF",c:"#ED7B26"},mbta:{city:"BOS",c:"#00843D"},septa:{city:"PHL",c:"#7C3AED"},gcrta:{city:"CLE",c:"#008C95"},miami:{city:"MIA",c:"#EC008C"}};' +
'function meta(s){return AGENCY_META[s&&s.agency]||{city:"",c:"#666"};}' +
'function colorForCity(city){for(var k in AGENCY_META)if(AGENCY_META[k].city===city)return AGENCY_META[k].c;return "#0a84ff";}' +
// Dark vs light text by perceived luminance, so gold/sky chips stay legible.
'function textOn(hex){var h=hex.replace("#","");var r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16);return (0.299*r+0.587*g+0.114*b)>150?"#111":"#fff";}' +
'function favStation(id){for(var i=0;i<DB.length;i++)if(DB[i].id===id)return DB[i];return null;}' +
'function badgeEl(s){var m=meta(s);if(!m.city)return null;var b=document.createElement("span");b.className="cb";b.style.background=m.c;b.style.color=textOn(m.c);b.textContent=m.city;return b;}' +
'var selCity="All";' +
'function cities(){var seen={},out=["All"];for(var i=0;i<DB.length;i++){var c=meta(DB[i]).city;if(c&&!seen[c]){seen[c]=1;out.push(c);}}return out;}' +
'function renderChips(){var c=document.getElementById("chips");c.innerHTML="";cities().forEach(function(city){var on=(city===selCity);var b=document.createElement("button");b.className="chip"+(on?" on":"");b.setAttribute("data-city",city);b.textContent=city;if(city!=="All"){var col=colorForCity(city);b.style.background=col;b.style.color=textOn(col);b.style.opacity=on?"1":"0.45";b.style.border=on?"2px solid #fff":"2px solid transparent";}b.onclick=function(){selCity=city;renderChips();search(document.getElementById("search").value);renderFavs();};c.appendChild(b);});}' +
'function applyCity(s){return selCity==="All"||meta(s).city===selCity;}' +
'function getReturn(){var m=location.search.match(/return_to=([^&]+)/);return m?decodeURIComponent(m[1]):"pebblejs://close#";}' +
'function renderFavs(){' +
'var c=document.getElementById("favs");c.innerHTML="";' +
'state.favs.forEach(function(f,i){' +
'var fs=favStation(f.id);' +
'if(!applyCity(fs||{}))return;' +
'var row=document.createElement("div");row.className="fav";' +
'var metaDiv=document.createElement("div");metaDiv.className="meta";' +
'var nm=document.createElement("div");nm.className="name";' +
'var badge=badgeEl(fs);if(badge)nm.appendChild(badge);' +
'var nameSpan=document.createElement("span");nameSpan.textContent=f.name;nm.appendChild(nameSpan);' +
'var inp=document.createElement("input");inp.placeholder="Label (optional)";inp.value=f.label||"";' +
'inp.oninput=function(){state.favs[i].label=inp.value;};' +
'metaDiv.appendChild(nm);metaDiv.appendChild(inp);' +
'var up=document.createElement("button");up.textContent="\\u2191";up.onclick=function(){move(i,-1);};' +
'var dn=document.createElement("button");dn.textContent="\\u2193";dn.onclick=function(){move(i,1);};' +
'var rm=document.createElement("button");rm.className="rm";rm.textContent="\\u2715";rm.onclick=function(){state.favs.splice(i,1);renderFavs();};' +
'row.appendChild(metaDiv);row.appendChild(up);row.appendChild(dn);row.appendChild(rm);' +
'c.appendChild(row);});' +
'document.getElementById("cap").textContent=state.favs.length+"/"+MAX+" favorites";' +
'}' +
'function move(i,d){var j=i+d;if(j<0||j>=state.favs.length)return;var t=state.favs[i];state.favs[i]=state.favs[j];state.favs[j]=t;renderFavs();}' +
'function search(q){' +
'var ul=document.getElementById("results");ul.innerHTML="";if(!q){return;}' +
'var ql=q.toLowerCase(),shown=0;' +
'for(var k=0;k<DB.length&&shown<25;k++){var s=DB[k];' +
'if(!applyCity(s))continue;' +
'if(s.name.toLowerCase().indexOf(ql)<0)continue;' +
'(function(st){var li=document.createElement("li");' +
'var badge=badgeEl(st);if(badge)li.appendChild(badge);' +
'var nameSpan=document.createElement("span");nameSpan.textContent=disp(st);li.appendChild(nameSpan);' +
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
'renderChips();renderFavs();' +
'})();</script></body></html>';
}

module.exports = { buildConfigHtml: buildConfigHtml };
