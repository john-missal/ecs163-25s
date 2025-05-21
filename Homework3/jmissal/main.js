// Select SVG containers and tooltip
const ovSVG   = d3.select("#ov-chart svg");
const fcSVG   = d3.select("#fc-chart svg");
const adSVG   = d3.select("#ad-chart svg");
const tooltip = d3.select("#tooltip");

// Shared margins & dims
const margin = { top: 30, right: 30, bottom: 60, left: 60 };
const fullW  = parseInt(ovSVG.style("width"));
const fullH  = parseInt(ovSVG.style("height"));
const W      = fullW  - margin.left - margin.right;
const H      = fullH - margin.top  - margin.bottom;

// Globals for data & state
let fullData, genreColor;
let allowedGenres = new Set(), selectedGenre = null;

// ──────────────────────────────────────────────────────────────────────────────
// 1) LOAD & CLEAN DATA
// ──────────────────────────────────────────────────────────────────────────────
d3.csv("music_mental.csv", d => {
  d["Hours per day"] = +d["Hours per day"];
  d.Anxiety          = +d["Anxiety"];
  d.Depression       = +d["Depression"];
  d["Fav genre"]     = d["Fav genre"];
  d["Music effects"] = d["Music effects"];
  return d;
})
.then(raw => {
  // Filter invalid rows
  fullData = raw.filter(d =>
    !isNaN(d["Hours per day"]) &&
    !isNaN(d.Anxiety) &&
    !isNaN(d.Depression) &&
    d["Fav genre"] &&
    d["Music effects"]
  );

  // Build sorted genre list & color scale
  const genres = Array.from(new Set(fullData.map(d => d["Fav genre"]))).sort();
  genreColor = d3.scaleOrdinal()
    .domain(genres)
    .range(d3.quantize(d3.interpolateTurbo, genres.length));

  // Initial allowedGenres = all
  allowedGenres = new Set(genres);

  // Draw all views
  drawHistogram(fullData, ovSVG);
  drawPie(fullData,       fcSVG);
  drawDendrogram(fullData,adSVG);
})
.catch(console.error);


// ──────────────────────────────────────────────────────────────────────────────
// 2) OVERVIEW: Histogram + Brush Interaction
// ──────────────────────────────────────────────────────────────────────────────
function drawHistogram(data, svg) {
  // 2.1) SVG group
  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // 2.2) x‐scale
  const hours = data.map(d => d["Hours per day"]);
  const x = d3.scaleLinear()
    .domain(d3.extent(hours)).nice()
    .range([0, W]);

  // 2.3) bins + y‐scale
  const bins = d3.bin().domain(x.domain()).thresholds(20)(hours);
  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, b => b.length)]).nice()
    .range([H, 0]);

  // 2.4) bars with tooltip
  g.selectAll("rect")
   .data(bins)
   .enter().append("rect")
     .attr("x",      d => x(d.x0) + 1)
     .attr("y",      d => y(d.length))
     .attr("width",  d => Math.max(0, x(d.x1)-x(d.x0)-1))
     .attr("height", d => H - y(d.length))
     .attr("fill",   "#69b3a2")
     .on("mouseenter",(e,d)=>{
       tooltip.style("display","block")
              .html(`<strong>${d.x0.toFixed(1)}–${d.x1.toFixed(1)} hrs</strong><br>Count: ${d.length}`);
     })
     .on("mousemove", e=>{
       tooltip.style("top",(e.pageY+10)+"px")
              .style("left",(e.pageX+10)+"px");
     })
     .on("mouseleave",()=> tooltip.style("display","none"));

  // 2.5) axes
  g.append("g")
    .attr("transform", `translate(0,${H})`)
    .call(d3.axisBottom(x));
  g.append("g")
    .call(d3.axisLeft(y));

  // 2.6) axis labels
  g.append("text")
    .attr("x", W/2).attr("y", H+45).attr("text-anchor","middle")
    .text("Hours per day");
  g.append("text")
    .attr("transform","rotate(-90)")
    .attr("x",-H/2).attr("y",-45).attr("text-anchor","middle")
    .text("Count");

  // 2.7) brush
  const brush = d3.brushX()
    .extent([[0,0],[W,H]])
    .on("end", brushed);

  g.append("g")
    .attr("class","brush")
    .call(brush);

  // 2.8) brush handler
  function brushed({selection}) {
    if (!selection) {
      // cleared brush → allow all
      allowedGenres = new Set(Array.from(genreColor.domain()));
    } else {
      const [x0,x1] = selection.map(x.invert);
      // filter data by hours in range → determine genres present
      const inRange = fullData.filter(d =>
        d["Hours per day"] >= x0 && d["Hours per day"] <= x1
      );
      allowedGenres = new Set(inRange.map(d=>d["Fav genre"]));
    }
    updatePie();
    updateDendrogram();
  }
}


// ──────────────────────────────────────────────────────────────────────────────
// 3) PIE CHART + Click‐Selection Interaction
// ──────────────────────────────────────────────────────────────────────────────
let pieG;  // hoist for updates
function drawPie(data, svg) {
  // 3.1) counts and pie/arc
  const counts = d3.rollup(data, v=>v.length, d=>d["Fav genre"]);
  const total  = d3.sum(counts.values());
  const pieGen = d3.pie().value(d=>d[1]);
  const arcGen = d3.arc()
    .innerRadius(0)
    .outerRadius(Math.min(W,H)/2 - 10);

  // 3.2) center group
  pieG = svg.append("g")
    .attr("transform", `translate(${margin.left+W/2},${margin.top+H/2})`);

  // 3.3) draw slices
  pieG.selectAll("path")
    .data(pieGen([...counts]))
    .enter().append("path")
      .attr("class","pie-slice")
      .attr("d", arcGen)
      .attr("fill", d=>genreColor(d.data[0]))
      .attr("stroke","white").attr("stroke-width",1)
      // click selection
      .on("click", (e,d) => {
        const gname = d.data[0];
        selectedGenre = (selectedGenre === gname ? null : gname);
        updatePie(); 
        updateDendrogram();
      })
      // hover tooltip
      .on("mouseenter",(e,d)=>{
        const [genre,cnt] = d.data;
        const pct = ((cnt/total)*100).toFixed(1);
        tooltip.style("display","block")
               .html(`<strong>${genre}</strong><br>${pct}%`);
      })
      .on("mousemove", e=>{
        tooltip.style("top",(e.pageY+10)+"px")
               .style("left",(e.pageX+10)+"px");
      })
      .on("mouseleave",()=> tooltip.style("display","none"));

  // 3.4) legend
  const legend = svg.append("g")
    .attr("transform",`translate(${margin.left},${margin.top})`);
  Array.from(counts.keys()).forEach((gname,i)=>{
    const row = legend.append("g")
      .attr("transform",`translate(0,${i*20})`);
    row.append("rect")
      .attr("width",12).attr("height",12)
      .attr("fill",genreColor(gname));
    row.append("text")
      .attr("x",18).attr("y",10)
      .text(gname)
      .attr("font-size","12px");
  });
}

// 3.5) PIE update (opacity + stroke for selection + brush fade)
function updatePie() {
  pieG.selectAll("path.pie-slice")
    .transition().duration(500)
      .attr("stroke-width", d => d.data[0] === selectedGenre ? 3 : 1)
      .attr("stroke",       d => d.data[0] === selectedGenre ? "black" : "white")
      .style("opacity",     d => (
        (!selectedGenre || d.data[0] === selectedGenre) &&
        allowedGenres.has(d.data[0])
      ) ? 1 : 0.2);
}


// ──────────────────────────────────────────────────────────────────────────────
// 4) DENDROGRAM + Fade Updates
// ──────────────────────────────────────────────────────────────────────────────
let dendroG;
function drawDendrogram(data, svg) {
  // 4.1) rollup
  const roll = d3.rollup(
    data,
    v=>d3.rollup(v, vv=>vv.length, d=>d["Music effects"]),
    d=>d["Fav genre"]
  );

  // 4.2) nested
  const nested = {
    name: "Genres",
    children: Array.from(roll, ([genre,m])=>({
      name: genre,
      children: ["Improve","No effect","Worsen"].map(eff=>({
        name: `${eff} (${m.get(eff)||0})`,
        value: m.get(eff)||0
      }))
    }))
  };

  // 4.3) hierarchy
  const root = d3.hierarchy(nested)
    .sum(d=>d.value)
    .sort((a,b)=>d3.descending(a.value,b.value));

  // 4.4) layout dims
  const leafCount = root.leaves().length;
  const rowHeight  = 30;
  const vSize      = leafCount * rowHeight;
  const hSize      = fullW - margin.left - margin.right;
  adSVG.attr("height", vSize + margin.top + margin.bottom);

  // 4.5) tree
  const tree = d3.tree().size([vSize, hSize]);
  tree(root);

  // 4.6) group
  dendroG = svg.selectAll("g.dendro").data([0])
    .join("g")
      .attr("class","dendro")
      .attr("transform",`translate(${margin.left},${margin.top})`);

  // 4.7) links
  dendroG.selectAll("path.link")
    .data(root.links())
    .join("path")
      .attr("fill","none")
      .attr("stroke","#555")
      .attr("d",d3.linkHorizontal().x(d=>d.y).y(d=>d.x));

  // 4.8) nodes
  const node = dendroG.selectAll("g.node")
    .data(root.descendants())
    .join("g")
      .attr("class", d => d.depth===1?"genre-node":d.depth===2?"leaf-node":"root-node")
      .attr("transform",d=>`translate(${d.y},${d.x})`);

  // 4.9) circles + tooltip
  node.append("circle")
      .attr("r",6)
      .attr("fill",d=>{
        if(d.depth===0) return "#999";
        if(d.depth===1) return genreColor(d.data.name);
        if(d.data.name.startsWith("Improve")) return "#2ca02c";
        if(d.data.name.startsWith("Worsen"))  return "red";
        return "#ccc";
      })
      .attr("stroke","#000")
      .on("mouseenter",(e,d)=>{
        if(!d.children){
          const [eff,cnt]=d.data.name.match(/^([^ ]+) \((\d+)\)$/).slice(1);
          tooltip.style("display","block")
                 .html(`<strong>${d.parent.data.name} → ${eff}</strong><br>Count: ${cnt}`);
        }
      })
      .on("mousemove", e=>{
        tooltip.style("top",(e.pageY+10)+"px")
               .style("left",(e.pageX+10)+"px");
      })
      .on("mouseleave",()=>tooltip.style("display","none"));

  // 4.10) labels
  node.append("text")
      .attr("dy",3)
      .attr("x",d=>d.children?-8:8)
      .attr("text-anchor",d=>d.children?"end":"start")
      .style("pointer-events","none")
      .text(d=>d.data.name);

  // initial fade state
  updateDendrogram();
}

// 4.11) DENDROGRAM update (fade for both brush + selection)
function updateDendrogram() {
  dendroG.selectAll("g.genre-node")
    .transition().duration(500)
      .style("opacity", d =>
        (!selectedGenre || d.data.name===selectedGenre)
        && allowedGenres.has(d.data.name)
        ? 1 : 0.2
      );

  dendroG.selectAll("g.leaf-node")
    .transition().duration(500)
      .style("opacity", d => {
        const genre = d.parent.data.name;
        return (!selectedGenre || genre===selectedGenre)
            && allowedGenres.has(genre)
            ? 1 : 0.2;
      });
}
