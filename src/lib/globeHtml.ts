// The in-flight globe for iOS (Android has its own bundled page): MapLibre 5 in a WebView, same look as the share page on the web.
// Protocol with FlightGlobeMap: window.__FLYQ__ = { from, to, departureLabel, arrivalLabel, estimateLabel, ... } is injected before the page runs,
// window.flyq.setPosition({ lat, lon, progress, source }) moves the plane, and the page posts { type: 'ready' | 'error' } back.
// Tiles come from OpenFreeMap, so it needs a connection; without one the page reports 'error' and the app keeps its drawn map.
export const MAPLIBRE_VERSION = '5.0.0';

export const GLOBE_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css">
<style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#map{position:absolute;inset:0}
.maplibregl-ctrl-bottom-left,.maplibregl-ctrl-bottom-right{display:none}
.apill{display:flex;align-items:center;gap:7px;background:#fff;border-radius:999px;padding:5px 12px 5px 5px;box-shadow:0 5px 16px rgba(2,132,199,.28),0 1px 3px rgba(0,0,0,.08);white-space:nowrap}
.apill .orb{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#0284C7,#7C5CFA);box-shadow:0 0 0 4px rgba(2,132,199,.18)}
.apill b{display:block;font-size:13px;font-weight:900;line-height:1.1;color:#0B1F33}
.apill small{display:block;font-size:10.5px;font-weight:700;color:#0369A1}
.plane{position:relative;width:40px;height:40px;border-radius:50%;background:#fff;box-shadow:0 5px 14px rgba(2,132,199,.4);display:flex;align-items:center;justify-content:center}
.plane::before{content:"";position:absolute;inset:-9px;border-radius:50%;border:2px solid rgba(2,132,199,.45);animation:ping 1.8s ease-out infinite}
.plane svg{width:20px;height:20px}
.est{opacity:.7}
@keyframes ping{from{transform:scale(.6);opacity:.9}to{transform:scale(1.5);opacity:0}}
</style></head><body><div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js"></script>
<script>
(function(){
var C=window.__FLYQ__||{};
function post(o){try{window.ReactNativeWebView.postMessage(JSON.stringify(o))}catch(e){}}
if(typeof maplibregl==='undefined'||!C.from){post({type:'error',why:'no maplibre'});return}
var rad=function(d){return d*Math.PI/180},deg=function(r){return r*180/Math.PI};
function gc(a,b,n){var p1=rad(a.lat),l1=rad(a.lon),p2=rad(b.lat),l2=rad(b.lon);var d=2*Math.asin(Math.sqrt(Math.pow(Math.sin((p2-p1)/2),2)+Math.cos(p1)*Math.cos(p2)*Math.pow(Math.sin((l2-l1)/2),2)));var pts=[];for(var i=0;i<=n;i++){var f=i/n;if(d===0){pts.push([a.lon,a.lat]);continue}var A=Math.sin((1-f)*d)/Math.sin(d),B=Math.sin(f*d)/Math.sin(d);var x=A*Math.cos(p1)*Math.cos(l1)+B*Math.cos(p2)*Math.cos(l2),y=A*Math.cos(p1)*Math.sin(l1)+B*Math.cos(p2)*Math.sin(l2),z=A*Math.sin(p1)+B*Math.sin(p2);pts.push([deg(Math.atan2(y,x)),deg(Math.atan2(z,Math.sqrt(x*x+y*y)))])}return pts}
function bearing(a,b){var p1=rad(a[1]),p2=rad(b[1]),dl=rad(b[0]-a[0]);return(deg(Math.atan2(Math.sin(dl)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl)))+360)%360}
function nearest(pts,lon,lat){var best=0,bd=1e9;for(var i=0;i<pts.length;i++){var dx=pts[i][0]-lon,dy=pts[i][1]-lat,d=dx*dx+dy*dy;if(d<bd){bd=d;best=i}}return best}
function line(c){return{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c}}}
function el(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h)e.innerHTML=h;return e}
var path=gc(C.from,C.to,96),pos=null,planeMarker=null,planeEl=null,ready=false;
var PLANE='<svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="#0284C7"/></svg>';
var map=window.__map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/positron',center:[14,47],zoom:2.6,interactive:false,attributionControl:false,fadeDuration:0});
var failTimer=setTimeout(function(){if(!ready)post({type:'error',why:'timeout'})},14000);
map.on('error',function(e){if(!ready&&e&&e.error&&/Failed to fetch|NetworkError|Load failed/i.test(String(e.error.message||e.error)))post({type:'error',why:'network'})});
map.on('style.load',function(){try{map.setProjection({type:'globe'})}catch(e){}});
function pill(a,label){var e=el('div','apill','<span class="orb"></span><div><b></b><small></small></div>');e.querySelector('b').textContent=a.code;e.querySelector('small').textContent=label||'';if(!label)e.querySelector('small').remove();return e}
function render(){
 if(!ready)return;
 var idx=pos?nearest(path,pos.lon,pos.lat):0;
 map.getSource('flown').setData(line(pos?path.slice(0,idx+1).concat([[pos.lon,pos.lat]]):[]));
 map.getSource('left').setData(line((pos?[[pos.lon,pos.lat]]:[]).concat(path.slice(pos?idx+1:0))));
 if(pos){var h=bearing(path[Math.max(0,idx-1)],path[Math.min(path.length-1,idx+1)]);
  if(!planeMarker){planeEl=el('div','plane',PLANE);planeMarker=new maplibregl.Marker({element:planeEl,rotationAlignment:'viewport'}).setLngLat([pos.lon,pos.lat]).addTo(map)}
  planeMarker.setLngLat([pos.lon,pos.lat]);planeEl.querySelector('svg').style.transform='rotate('+h+'deg)';planeEl.classList.toggle('est',pos.source==='estimate')}
 else if(planeMarker){planeMarker.remove();planeMarker=null}
}
map.on('load',function(){
 try{map.getStyle().layers.forEach(function(l){if(l.type==='background')map.setPaintProperty(l.id,'background-color','#F6F9FF');if(l.id==='water')map.setPaintProperty(l.id,'fill-color','#9DBDF5')})}catch(e){}
 map.addSource('flown',{type:'geojson',data:line([])});map.addSource('left',{type:'geojson',data:line([])});
 map.addLayer({id:'left',type:'line',source:'left',layout:{'line-cap':'round'},paint:{'line-color':'#0369A1','line-width':3.2,'line-dasharray':[0.1,2.2]}});
 map.addLayer({id:'flown-case',type:'line',source:'flown',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':8,'line-opacity':.85}});
 map.addLayer({id:'flown',type:'line',source:'flown',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#7C5CFA','line-width':4.5}});
 new maplibregl.Marker({element:pill(C.from,C.departureLabel),anchor:'left',offset:[8,0]}).setLngLat([C.from.lon,C.from.lat]).addTo(map);
 new maplibregl.Marker({element:pill(C.to,C.arrivalLabel),anchor:'right',offset:[-8,0]}).setLngLat([C.to.lon,C.to.lat]).addTo(map);
 var mid=path[48],lons=path.map(function(p){return p[0]}),lats=path.map(function(p){return p[1]});
 var span=Math.max(Math.max.apply(null,lons)-Math.min.apply(null,lons),(Math.max.apply(null,lats)-Math.min.apply(null,lats))*1.6,2);
 var W=window.innerWidth,H=window.innerHeight;
 map.jumpTo({center:[mid[0],mid[1]],zoom:Math.max(1.2,Math.min(6,Math.log2(Math.min(W*0.8,H*1.1)*360/(512*span*1.7))))});
 ready=true;clearTimeout(failTimer);render();
 map.once('idle',function(){post({type:'ready'})});
});
window.flyq={setPosition:function(p){pos=p&&typeof p.lat==='number'?p:null;render()}};
if(C.position)window.flyq.setPosition(C.position);
})();
</script></body></html>`;
