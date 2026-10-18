const $=id=>document.getElementById(id);const map=L.map('map').setView([40.11,-88.23],13);
// Satellite imagery is the only base layer, displayed automatically on startup.
const imagery=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Imagery © Esri and providers'}).addTo(map);
const drawn=new L.FeatureGroup().addTo(map), gridLayer=new L.FeatureGroup().addTo(map),pointLayer=new L.FeatureGroup().addTo(map);
// Small circular vertices and a continuous navy line while drawing.
const vertexIcon = L.divIcon({className:'field-vertex-icon',html:'<span></span>',iconSize:[10,10],iconAnchor:[5,5]});
map.addControl(new L.Control.Draw({edit:{featureGroup:drawn},draw:{
  polygon:{shapeOptions:{color:'#13294B',weight:3,opacity:1,dashArray:null},icon:vertexIcon,touchIcon:vertexIcon},
  rectangle:{shapeOptions:{color:'#13294B',weight:3,opacity:1,dashArray:null}},
  polyline:false,marker:false,circle:false,circlemarker:false
}}));
let boundary=null,features=[],points=[],edgeClicks=[];
const say=s=>$('status').textContent=s;
function resetGrid(){gridLayer.clearLayers();pointLayer.clearLayers();features=[];points=[];$('kml').disabled=$('csv').disabled=true;}
function setBoundary(geo){const geom=geo.type==='Feature'?geo.geometry:geo;if(!geom||!['Polygon','MultiPolygon'].includes(geom.type))throw Error('Please use a polygon boundary.');resetGrid();drawn.clearLayers();boundary=turf.feature(geom);const layer=L.geoJSON(boundary,{style:{color:'#13294B',weight:3,fillOpacity:.08}});layer.eachLayer(l=>drawn.addLayer(l));map.fitBounds(drawn.getBounds().pad(.15));say('Boundary ready. Configure grid and click Generate.');}
map.on(L.Draw.Event.CREATED,e=>{try{setBoundary(e.layer.toGeoJSON())}catch(err){say(err.message)}});
map.on(L.Draw.Event.EDITED,()=>{try{const l=drawn.getLayers()[0];if(l)setBoundary(l.toGeoJSON())}catch(err){say(err.message)}});
map.on(L.Draw.Event.DELETED,()=>{boundary=null;resetGrid();say('Draw or import a field to begin.')});
// Parse KML polygons directly, including polygons nested in MultiGeometry.
// Using local-name matching makes default and prefixed KML namespaces work alike.
function kmlElements(parent, name) {
  return Array.from(parent.getElementsByTagName('*')).filter(el => el.localName === name);
}
function kmlRing(boundaryElement) {
  const coords = kmlElements(boundaryElement, 'coordinates')[0];
  if (!coords) throw Error('KML polygon has no coordinates.');
  const ring = coords.textContent.trim().split(/\s+/).map(token => {
    const parts = token.split(',');
    const lon = Number(parts[0]), lat = Number(parts[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw Error('Invalid KML coordinates.');
    return [lon, lat];
  });
  if (ring.length < 3) throw Error('KML polygon has too few vertices.');
  if (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1]) ring.push([...ring[0]]);
  if (ring.length < 4) throw Error('Invalid KML polygon ring.');
  return ring;
}
function parseKmlPolygons(doc) {
  if (kmlElements(doc, 'parsererror').length) throw Error('Invalid KML XML.');
  const polygons = kmlElements(doc, 'Polygon').map(poly => {
    const outer = kmlElements(poly, 'outerBoundaryIs')[0];
    if (!outer) throw Error('KML polygon missing outer boundary.');
    const rings = [kmlRing(outer), ...kmlElements(poly, 'innerBoundaryIs').map(kmlRing)];
    return {type:'Feature', properties:{}, geometry:{type:'Polygon', coordinates:rings}};
  });
  return polygons;
}
$('upload').addEventListener('change', async e => {
  try {
    const f=e.target.files[0]; if(!f)return;
    const txt=await f.text(); let polys;
    if (/\.kml$/i.test(f.name)) {
      const doc=new DOMParser().parseFromString(txt,'application/xml');
      polys=parseKmlPolygons(doc);
    } else {
      const geo=JSON.parse(txt);
      const fs=geo.type==='FeatureCollection'?geo.features:[geo];
      polys=fs.filter(x=>['Polygon','MultiPolygon'].includes((x.geometry||x).type));
    }
    if(!polys.length)throw Error('No polygon found in file.');
    setBoundary(polys[0]);
    if(polys.length>1)say('Imported first polygon of '+polys.length+'.');
  } catch(err) {say('Import error: '+err.message); console.error('Boundary import:',err);}
  e.target.value='';
});
// Local azimuthal equidistant projection around field centroid, in meters.
function projector(poly){const c=turf.centroid(poly).geometry.coordinates,lon0=c[0]*Math.PI/180,lat0=c[1]*Math.PI/180,R=6371008.8;function forward(p){const lon=p[0]*Math.PI/180,lat=p[1]*Math.PI/180,d=lon-lon0,cosc=Math.min(1,Math.max(-1,Math.sin(lat0)*Math.sin(lat)+Math.cos(lat0)*Math.cos(lat)*Math.cos(d))),ang=Math.acos(cosc),k=ang<1e-10?1:ang/Math.sin(ang);return [R*k*Math.cos(lat)*Math.sin(d),R*k*(Math.cos(lat0)*Math.sin(lat)-Math.sin(lat0)*Math.cos(lat)*Math.cos(d))]}function inverse(p){const rho=Math.hypot(...p),c=rho/R;if(rho<1e-10)return [cLon(),cLat()];const lat=Math.asin(Math.cos(c)*Math.sin(lat0)+p[1]*Math.sin(c)*Math.cos(lat0)/rho),lon=lon0+Math.atan2(p[0]*Math.sin(c),rho*Math.cos(lat0)*Math.cos(c)-p[1]*Math.sin(lat0)*Math.sin(c));return [lon*180/Math.PI,lat*180/Math.PI]}function cLon(){return lon0*180/Math.PI}function cLat(){return lat0*180/Math.PI}return {forward,inverse};}
function rotate(p,a){return [p[0]*Math.cos(a)+p[1]*Math.sin(a),-p[0]*Math.sin(a)+p[1]*Math.cos(a)]}function unrotate(p,a){return [p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)]}
function allRings(geometry){const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;return polys.flatMap(p=>p)}
function autoAngle(geometry,proj){let best=0,max=0;for(const ring of allRings(geometry)){for(let i=1;i<ring.length;i++){const a=proj.forward(ring[i-1]),b=proj.forward(ring[i]),len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>max){max=len;best=Math.atan2(b[1]-a[1],b[0]-a[0]);}}}return best}
map.on('click',e=>{if($('alignment').value!=='edge'||!boundary)return;edgeClicks.push(e.latlng);if(edgeClicks.length===2){const proj=projector(boundary),a=proj.forward([edgeClicks[0].lng,edgeClicks[0].lat]),b=proj.forward([edgeClicks[1].lng,edgeClicks[1].lat]);$('angle').value=(Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI).toFixed(2);edgeClicks=[];say('Edge direction selected. Click Generate grid.')}else say('Click a second point along the field edge.');});
$('alignment').addEventListener('change',()=>{$('angle-setting').hidden=$('alignment').value!=='manual';edgeClicks=[];say($('alignment').value==='edge'?'Click two points on the map along the preferred edge.':'Choose settings and generate the grid.')});
function generate(){if(!boundary)throw Error('Draw or import a field first.');resetGrid();const w=Number($('width').value)*($('units').value==='ft'?.3048:1),h=Number($('length').value)*($('units').value==='ft'?.3048:1);if(!(w>0&&h>0))throw Error('Width and length must be positive.');const proj=projector(boundary),geom=boundary.geometry,mode=$('alignment').value;const a=mode==='auto'?autoAngle(geom,proj):Number($('angle').value)*Math.PI/180;if(!Number.isFinite(a))throw Error('Invalid angle.');const coords=allRings(geom).flat().map(p=>rotate(proj.forward(p),a));const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);const nx=Math.ceil((maxx-minx)/w),ny=Math.ceil((maxy-miny)/h);if(nx*ny>15000)throw Error('Too many grid cells; choose larger dimensions.');const bdist=Number($('buffer').value)*.3048;if(bdist<0)throw Error('Boundary distance must be nonnegative.');const candidates=[];for(let row=0;row<ny;row++)for(let col=0;col<nx;col++){const x=minx+col*w,y=miny+row*h,local=[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]],ring=local.map(p=>proj.inverse(unrotate(p,a))),cell=turf.polygon([ring]);const center=proj.inverse(unrotate([x+w/2,y+h/2],a));const centerInside=turf.booleanPointInPolygon(turf.point(center),boundary);let keep=false,point=center;const edge=$('edges').value;if(edge==='center')keep=centerInside;else if(edge==='full')keep=ring.slice(0,4).every(p=>turf.booleanPointInPolygon(turf.point(p),boundary));else{keep=turf.booleanIntersects(cell,boundary);if(keep&&!centerInside){const inter=turf.intersect(turf.featureCollection([cell,boundary]));if(inter){point=turf.pointOnFeature(inter).geometry.coordinates;}else keep=false;}}if(!keep)continue;if(bdist>0){const line=turf.polygonToLine(boundary);const lines=line.type==='FeatureCollection'?line.features:[line];const d=Math.min(...lines.map(l=>turf.pointToLineDistance(turf.point(point),l,{units:'meters'})));if(d<bdist)continue;}candidates.push({row,col,cell,point});}
candidates.sort((a,b)=>a.row-b.row||(a.row%2===1?b.col-a.col:a.col-b.col));const start=Number($('start').value);if(!Number.isSafeInteger(start)||start<0)throw Error('Starting number must be a nonnegative integer.');candidates.forEach((c,i)=>{const pointNumber=i+1,jNumber='J'+(start+i),labelMode=$('labelmode').value;const id=labelMode==='numeric'?String(pointNumber):labelMode==='both'?pointNumber+' / '+jNumber:jNumber;c.cell.properties={name:id,pointNumber,jNumber,row:c.row+1,column:c.col+1};features.push(c.cell);points.push(turf.point(c.point,{name:id,pointNumber,jNumber,row:c.row+1,column:c.col+1}));L.geoJSON(c.cell,{style:{color:'#ffffff',weight:1,fillColor:'#13294B',fillOpacity:.12},interactive:false}).addTo(gridLayer);L.marker([c.point[1],c.point[0]],{icon:L.divIcon({className:'',html:'<span class="point-label">'+id+'</span>',iconSize:[90,20],iconAnchor:[45,10]})}).addTo(pointLayer);});$('kml').disabled=$('csv').disabled=points.length===0;say(`${points.length} sampling points generated from ${nx} × ${ny} possible cells. ${mode==='auto'?'Automatic orientation: '+(a*180/Math.PI).toFixed(1)+'°.':''}`);}
$('generate').onclick=()=>{try{generate()}catch(e){say('Grid error: '+e.message)}};$('clear').onclick=()=>{resetGrid();say('Grid cleared. Boundary retained.')};
function xml(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')}
function kmlPolygon(g){const coords=g.coordinates[0].map(p=>p[0]+','+p[1]+',0').join(' ');return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>`}
function exportKML(){const folders=[`<Folder><name>Field boundary</name><Placemark><name>Boundary</name>${boundary.geometry.type==='Polygon'?kmlPolygon(boundary.geometry):boundary.geometry.coordinates.map(c=>kmlPolygon({coordinates:c})).join('')}</Placemark></Folder>`,`<Folder><name>Grid cells</name>${features.map(f=>`<Placemark><name>${xml(f.properties.name)}</name><styleUrl>#grid</styleUrl>${kmlPolygon(f.geometry)}</Placemark>`).join('')}</Folder>`,`<Folder><name>Sampling points</name>${points.map(f=>`<Placemark><name>${xml(f.properties.name)}</name><ExtendedData><Data name="PointNumber"><value>${f.properties.pointNumber}</value></Data><Data name="JNumber"><value>${xml(f.properties.jNumber)}</value></Data></ExtendedData><Point><coordinates>${f.geometry.coordinates.join(',')},0</coordinates></Point></Placemark>`).join('')}</Folder>`];return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Field Grid Generator</name><Style id="grid"><LineStyle><color>ffffffff</color><width>1</width></LineStyle><PolyStyle><color>4400aa00</color></PolyStyle></Style>${folders.join('')}</Document></kml>`}
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('kml').onclick=()=>download('field-grid.kml',exportKML(),'application/vnd.google-earth.kml+xml');$('csv').onclick=()=>download('sampling-points.csv','PointNumber,JNumber,Latitude,Longitude,Row,Column\n'+points.map(p=>[p.properties.pointNumber,p.properties.jNumber,p.geometry.coordinates[1],p.geometry.coordinates[0],p.properties.row,p.properties.column].join(',')).join('\n'),'text/csv');

// Sync angle field visibility on initial load and browser page restoration.
function syncAngleVisibility(){ $('angle-setting').hidden = $('alignment').value !== 'manual'; }
syncAngleVisibility();
window.addEventListener('pageshow', syncAngleVisibility);
