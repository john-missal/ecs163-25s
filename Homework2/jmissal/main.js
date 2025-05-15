const ovSVG = d3.select("#ov-chart svg");
const fcSVG = d3.select("#fc-chart svg");
const adSVG = d3.select("#ad-chart svg");
const tooltip = d3.select("#tooltip");

const margin = { top: 30, right: 30, bottom: 60, left: 60 };
const fullW  = parseInt(ovSVG.style("width"));
const fullH  = parseInt(ovSVG.style("height"));
const W      = fullW  - margin.left - margin.right;
const H      = fullH - margin.top  - margin.bottom;

d3.csv("music_mental.csv", d => {
  d["Hours per day"] = +d["Hours per day"];
  d.Anxiety          = +d["Anxiety"];
  d.Depression       = +d["Depression"];
  d["Fav genre"]     = d["Fav genre"];
  d["Music effects"] = d["Music effects"];
  return d;
})
.then(raw => {
  const data = raw.filter(d =>
    !isNaN(d["Hours per day"]) &&
    !isNaN(d.Anxiety) &&
    !isNaN(d.Depression) &&
    d["Fav genre"] &&
    d["Music effects"]
  );

  drawHistogram(data, ovSVG);
  drawPie(data,       fcSVG);
  drawDendrogram(data,adSVG);
})
.catch(console.error);

function drawHistogram(data, svg) {
  const g = svg.append("g")
               .attr("transform", `translate(${margin.left},${margin.top})`);
  const hours = data.map(d=>d["Hours per day"]);
  const x = d3.scaleLinear().domain(d3.extent(hours)).nice().range([0,W]);
  const bins = d3.bin().domain(x.domain()).thresholds(20)(hours);
  const y = d3.scaleLinear().domain([0,d3.max(bins,b=>b.length)]).nice().range([H,0]);

  g.selectAll("rect").data(bins)
   .enter().append("rect")
     .attr("x", d=>x(d.x0)+1)
     .attr("y", d=>y(d.length))
     .attr("width", d=>Math.max(0, x(d.x1)-x(d.x0)-1))
     .attr("height", d=>H - y(d.length))
     .attr("fill","#69b3a2")
     .on("mouseenter",(e,d)=>{
       tooltip.style("display","block")
              .html(
                `<strong>${d.x0.toFixed(1)}–${d.x1.toFixed(1)} hrs</strong><br>`+
                `Count: ${d.length}`
              );
     })
     .on("mousemove", e=>{
       tooltip.style("top",(e.pageY+10)+"px")
              .style("left",(e.pageX+10)+"px");
     })
     .on("mouseleave",()=>tooltip.style("display","none"));

  g.append("g").attr("transform",`translate(0,${H})`).call(d3.axisBottom(x));
  g.append("g").call(d3.axisLeft(y));
  g.append("text").attr("x",W/2).attr("y",H+45).attr("text-anchor","middle")
    .text("Hours per day");
  g.append("text").attr("transform","rotate(-90)")
    .attr("x",-H/2).attr("y",-45).attr("text-anchor","middle")
    .text("Count");
}

function drawPie(data, svg) {
  const g = svg.append("g")
               .attr("transform", `translate(${margin.left+W/2},${margin.top+H/2})`);
  const counts = d3.rollup(data, v=>v.length, d=>d["Fav genre"]);
  const total  = d3.sum(counts.values());
  const pieGen  = d3.pie().value(d=>d[1]);
  const arcGen  = d3.arc().innerRadius(0).outerRadius(Math.min(W,H)/2-10);
  const color   = d3.scaleOrdinal(d3.schemeCategory10)
                    .domain([...counts.keys()]);

  g.selectAll("path").data(pieGen([...counts]))
   .enter().append("path")
     .attr("d", arcGen)
     .attr("fill", d=>color(d.data[0]))
     .attr("stroke","white")
     .attr("stroke-width",1)
     .on("mouseenter",(e,d)=>{
       const [gname,cnt]=d.data;
       const pct=((cnt/total)*100).toFixed(1);
       tooltip.style("display","block")
              .html(`<strong>${gname}</strong><br>${pct}%`);
     })
     .on("mousemove", e=>{
       tooltip.style("top",(e.pageY+10)+"px")
              .style("left",(e.pageX+10)+"px");
     })
     .on("mouseleave",()=>tooltip.style("display","none"));

  const legend = svg.append("g")
                    .attr("transform",`translate(${margin.left},${margin.top})`);
  [...counts.keys()].forEach((gname,i)=>{
    const row=legend.append("g").attr("transform",`translate(0,${i*20})`);
    row.append("rect").attr("width",12).attr("height",12).attr("fill",color(gname));
    row.append("text").attr("x",18).attr("y",10).text(gname).attr("font-size","12px");
  });
}

function drawDendrogram(data, svg) {
  const roll = d3.rollup(
    data,
    v=>d3.rollup(v, vv=>vv.length, d=>d["Music effects"]),
    d=>d["Fav genre"]
  );

  const nested = {
    name: "Genres",
    children: Array.from(roll, ([genre,m])=>({
      name: genre,
      children: ["Improve","No effect","Worsen"].map(effect=>({
        name: `${effect} (${m.get(effect)||0})`,
        value: m.get(effect)||0
      }))
    }))
  };

  const root = d3.hierarchy(nested)
    .sum(d=>d.value)
    .sort((a,b)=>d3.descending(a.value,b.value));

  const leafCount = root.leaves().length;
  const rowHeight  = 30;
  const vSize      = leafCount * rowHeight;
  const hSize      = fullW - margin.left - margin.right;

  adSVG.attr("height", vSize + margin.top + margin.bottom);

  const tree = d3.tree().size([vSize, hSize]);
  tree(root);

  const g = svg.selectAll("g.dendro").data([0])
    .join("g")
      .attr("class","dendro")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  g.selectAll("path.link")
    .data(root.links())
    .join("path")
      .attr("fill","none")
      .attr("stroke","#555")
      .attr("d", d3.linkHorizontal().x(d=>d.y).y(d=>d.x));

  const node = g.selectAll("g.node")
    .data(root.descendants())
    .join("g")
      .attr("transform", d=>`translate(${d.y},${d.x})`);

  node.append("circle")
      .attr("r",6)
      .attr("fill", d=>
        d.children ? "#999"
        : d.data.name.startsWith("Improve") ? "#2ca02c"
        : d.data.name.startsWith("Worsen")  ? "red"
        : "#ccc"
      )
      .attr("stroke","#000")
      .on("mouseenter",(e,d)=>{
        if(!d.children){
          const [eff,cnt]=d.data.name.match(/^([^ ]+) \((\d+)\)$/).slice(1);
          tooltip.style("display","block")
                 .html(`<strong>${d.parent.data.name} → ${eff}</strong><br>Count: ${cnt}`);
        }
      })
      .on("mousemove",e=>{
        tooltip.style("top",(e.pageY+10)+"px")
               .style("left",(e.pageX+10)+"px");
      })
      .on("mouseleave",()=>tooltip.style("display","none"));

  node.append("text")
      .attr("dy",3)
      .attr("x", d=> d.children ? -8 : 8)
      .attr("text-anchor", d=> d.children ? "end" : "start")
      .style("font-size", d=> d.children ? "12px" : "11px")
      .style("pointer-events","none")
      .text(d=>d.data.name);
}
