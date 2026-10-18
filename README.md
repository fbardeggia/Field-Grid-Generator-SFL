# Field Grid Generator — browser prototype

Open `index.html` in a modern browser with internet access. No R installation or server is needed. A static host such as GitHub Pages can host these three files.

## Features
- Draw/edit polygons using Leaflet.Draw or import KML/GeoJSON.
- Width/length in feet or meters; grid orientation automatic, manual angle, or two-click edge direction.
- Points centered within cells. Grid anchored to the minimum coordinates of the field extent after rotation.
- Keep cells with centers inside the field, cells intersecting the field, or only full cells.
- Sequential/J numbering, snake/row/column order, minimum boundary distance, KML and CSV export.

## Known limitations
- No zipped shapefile/KMZ import yet. Convert these to KML or GeoJSON first.
- The grid begins at the rotated *bounding extent*, not every irregular boundary edge. For irregular fields a universal half-cell offset from all edges is geometrically impossible.
- Edge-alignment clicks set orientation, not an exact anchor on the clicked edge.
- The projection is a local azimuthal equidistant approximation; check accuracy before field deployment.
- Satellite tiles and JS libraries need internet connectivity.
- This prototype has not been browser-tested in the deployment environment.

Version 0.2: Every sampling point now has both a sequential PointNumber (starting at 1) and a JNumber (configurable start). The map can show either or both; CSV always contains both columns and KML sampling placemarks contain both in ExtendedData.

### Default map
The app always opens with satellite imagery. The nonworking Streets basemap option has been removed.

### Interface updates
- Snake numbering is always used, with no numbering-order selector.
- Manual angle input appears only when Manual angle alignment is selected.

Drawing style: small circular vertices and solid navy polygon outline.

KML import update: native XML polygon parsing, including nested MultiGeometry and inner rings.
