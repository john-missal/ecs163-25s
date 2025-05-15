// Select the three SVG containers and the tooltip DIV
const ovSVG = d3.select("#ov-chart svg");
const fcSVG = d3.select("#fc-chart svg");
const adSVG = d3.select("#ad-chart svg");
const tooltip = d3.select("#tooltip");

// Shared margins for Overview & Pie
const margin = { top: 30, right: 30, bottom: 60, left: 60 };
const fullW  = parseInt(ovSVG.style("width"));
const fullH  = parseInt(ovSVG.style("height"));
const W      = fullW  - margin.left - margin.right;
const H      = fullH - margin.top  - margin.bottom;

// 1) Load & parse CSV
d3.csv("music_mental.csv", d => {
  d["Hours per day"] = +d["Hours per day"];
  d.Anxiety          = +d["Anxiety"];
  d.Depression       = +d["Depression"];
  d["Fav genre"]     = d["Fav genre"];
  d["Music effects"] = d["Music effects"];
  return d;
})
.then(raw => {
  // Filter out invalid rows
  const data = raw.filter(d =>
    !isNaN(d["Hours per day"]) &&
    !isNaN(d.Anxiety) &&
    !isNaN(d.Depression) &&
    d["Fav genre"] &&
    d["Music effects"]
  );

  // Draw the three views
  drawHistogram(data, ovSVG);
  drawPie(data,       fcSVG);
  drawDendrogram(data,adSVG);
})
.catch(console.error);


// ──────────────────────────────────────────────────────────────────────────────
// 2) Overview: Histogram of Listening Hours Per Day
// ──────────────────────────────────────────────────────────────────────────────
function drawHistogram(data, svg) {
  // 2.1) Append a group in the SVG with proper margins
  const g = svg.append("g")
               .attr("transform", `translate(${margin.left},${margin.top})`);

  // 2.2) Extract the “Hours per day” array
  const hours = data.map(d => d["Hours per day"]);

  // 2.3) Build x-scale (linear), domain = [min, max], range = [0, W]
  const x = d3.scaleLinear()
              .domain(d3.extent(hours))
              .nice()
              .range([0, W]);

  // 2.4) Bin the data into 20 buckets
  const bins = d3.bin()
                 .domain(x.domain())
                 .thresholds(20)(hours);

  // 2.5) Build y-scale (linear), domain = [0, max bin count], range = [H, 0]
  const y = d3.scaleLinear()
              .domain([0, d3.max(bins, b => b.length)])
              .nice()
              .range([H, 0]);

  // 2.6) Draw bars
  g.selectAll("rect")
   .data(bins)
   .enter().append("rect")
     .attr("x",      d => x(d.x0) + 1)
     .attr("y",      d => y(d.length))
     .attr("width",  d => Math.max(0, x(d.x1) - x(d.x0) - 1))
     .attr("height", d => H - y(d.length))
     .attr("fill",   "#69b3a2")
     // tooltip on hover
     .on("mouseenter", (e,d) => {
       tooltip.style("display","block")
              .html(
                `<strong>${d.x0.toFixed(1)}–${d.x1.toFixed(1)} hrs</strong><br>` +
                `Count: ${d.length}`
              );
     })
     .on("mousemove", e => {
       tooltip.style("top", (e.pageY+10)+"px")
              .style("left",(e.pageX+10)+"px");
     })
     .on("mouseleave", () => tooltip.style("display","none"));

  // 2.7) Axes
  g.append("g")
   .attr("transform", `translate(0,${H})`)
   .call(d3.axisBottom(x));
  g.append("g")
   .call(d3.axisLeft(y));

  // 2.8) Axis labels
  g.append("text")
   .attr("x", W/2).attr("y", H+45)
   .attr("text-anchor","middle")
   .text("Hours per day");

  g.append("text")
   .attr("transform","rotate(-90)")
   .attr("x", -H/2).attr("y", -45)
   .attr("text-anchor","middle")
   .text("Count");
}


// ──────────────────────────────────────────────────────────────────────────────
// 3) Genre Breakdown: Pie Chart of Favorite Genres
// ──────────────────────────────────────────────────────────────────────────────
function drawPie(data, svg) {
  // 3.1) Group counts by genre
  const counts = d3.rollup(data, v => v.length, d => d["Fav genre"]);
  const total  = d3.sum(counts.values());

  // 3.2) Create pie generator
  const pieGen = d3.pie().value(d => d[1]);
  const arcGen = d3.arc()
                   .innerRadius(0)
                   .outerRadius(Math.min(W,H)/2 - 10);

  // 3.3) Color scale
  const color = d3.scaleOrdinal(d3.schemeCategory10)
                  .domain([...counts.keys()]);

  // 3.4) Center group
  const g = svg.append("g")
               .attr("transform", `translate(${margin.left+W/2},${margin.top+H/2})`);

  // 3.5) Draw slices
  g.selectAll("path")
   .data(pieGen([...counts]))
   .enter().append("path")
     .attr("d", arcGen)
     .attr("fill", d => color(d.data[0]))
     .attr("stroke","white")
     .attr("stroke-width",1)
     // tooltip on hover
     .on("mouseenter",(e,d) => {
       const [genre, cnt] = d.data;
       const pct = ((cnt/total)*100).toFixed(1);
       tooltip.style("display","block")
              .html(`<strong>${genre}</strong><br>${pct}%`);
     })
     .on("mousemove", e => {
       tooltip.style("top",(e.pageY+10)+"px")
              .style("left",(e.pageX+10)+"px");
     })
     .on("mouseleave", () => tooltip.style("display","none"));

  // 3.6) Legend
  const legend = svg.append("g")
                    .attr("transform",`translate(${margin.left},${margin.top})`);
  [...counts.keys()].forEach((gname,i) => {
    const row = legend.append("g").attr("transform",`translate(0,${i*20})`);
    row.append("rect")
       .attr("width",12).attr("height",12)
       .attr("fill", color(gname));
    row.append("text")
       .attr("x",18).attr("y",10)
       .text(gname)
       .attr("font-size","12px");
  });
}


// ──────────────────────────────────────────────────────────────────────────────
// 4) Advanced: Genre → Music Effects Dendrogram
// ──────────────────────────────────────────────────────────────────────────────
function drawDendrogram(data, svg) {
  // 4.1) Roll up counts: genre → effect → count
  const roll = d3.rollup(
    data,
    v => d3.rollup(v, vv => vv.length, d => d["Music effects"]),
    d => d["Fav genre"]
  );

  // 4.2) Build nested tree data
  const nested = {
    name: "Genres",
    children: Array.from(roll, ([genre, m]) => ({
      name: genre,
      children: ["Improve","No effect","Worsen"].map(effect => ({
        name: `${effect} (${m.get(effect)||0})`,
        value: m.get(effect)||0
      }))
    }))
  };

  // 4.3) Create hierarchy & sort by count
  const root = d3.hierarchy(nested)
    .sum(d => d.value)
    .sort((a,b) => d3.descending(a.value, b.value));

  // 4.4) Compute spacing: 30px per leaf + margins
  const leafCount = root.leaves().length;
  const rowHeight  = 30;                             // ample vertical padding
  const vSize      = leafCount * rowHeight;         // total tree height
  const hSize      = fullW - margin.left - margin.right;

  // 4.5) Override the dendrogram SVG height
  adSVG.attr("height", vSize + margin.top + margin.bottom);

  // 4.6) Tree layout
  const tree = d3.tree().size([vSize, hSize]);
  tree(root);

  // 4.7) Append group with margins
  const g = svg.selectAll("g.dendro").data([0])
    .join("g")
      .attr("class","dendro")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  // 4.8) Draw links
  g.selectAll("path.link")
    .data(root.links())
    .join("path")
      .attr("fill","none")
      .attr("stroke","#555")
      .attr("d", d3.linkHorizontal().x(d=>d.y).y(d=>d.x));

  // 4.9) Draw nodes
  const node = g.selectAll("g.node")
    .data(root.descendants())
    .join("g")
      .attr("transform", d => `translate(${d.y},${d.x})`);

  // 4.10) Circles + hover interactions
  node.append("circle")
      .attr("r", 6)
      .attr("fill", d =>
        d.children ? "#999" :
        d.data.name.startsWith("Improve") ? "#2ca02c" :
        d.data.name.startsWith("Worsen")  ? "red" : "#ccc"
      )
      .attr("stroke","#000")
      .on("mouseenter", (e,d) => {
        if (!d.children) {
          const [eff,cnt] = d.data.name.match(/^([^ ]+) \((\d+)\)$/).slice(1);
          tooltip.style("display","block")
                 .html(`<strong>${d.parent.data.name} → ${eff}</strong><br>Count: ${cnt}`);
        }
      })
      .on("mousemove", e => {
        tooltip.style("top",(e.pageY+10)+"px")
               .style("left",(e.pageX+10)+"px");
      })
      .on("mouseleave", () => tooltip.style("display","none"));

  // 4.11) Labels (ignore pointer-events so circle always catches hover)
  node.append("text")
      .attr("dy", 3)
      .attr("x", d => d.children ? -8 : 8)
      .attr("text-anchor", d => d.children ? "end" : "start")
      .style("font-size", d => d.children ? "12px" : "11px")
      .style("pointer-events","none")
      .text(d => d.data.name);
}
