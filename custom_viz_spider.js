looker.plugins.visualizations.add({
  //Configuration Options
  options: {
    // Style Tab
    style_tab: {
      type: "section",
      label: "Style",
      default: true,
      elements: [], // This will be dynamically populated
    },
    //Legend Tab
    legend_tab: {
      type: "section",
      label: "Legend",
      elements: [{
        type: "boolean",
        label: "Show Legend",
        id: "show_legend",
        default: true,
      }, {
        type: "integer",
        label: "Grid Line Interval",
        id: "grid_line_interval",
        default: 1,
        min: 1,
        max: 10,
        display_as: "range",
      }],
    },
    // Axis Tab
    axis_tab: {
      type: "section",
      label: "Axis",
      elements: [{
        type: "boolean",
        label: "Show Axis Value",
        id: "show_axis_value",
        default: true,
      }, {
        type: "radio_buttons",
        label: "Legend Position",
        id: "legend_position",
        default: "right",
        display_size: "half",
        options: [{
          "Right": "right"
        }, {
          "Left": "left"
        }, {
          "Bottom": "bottom"
        }],
      }],
    },
  },

  // Create function
  create: function(element) {
    // Append SVG element
    this.svg = d3.select(element).append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("font-family", "Inter, sans-serif");

    // Append a group for the chart content
    this.chartGroup = this.svg.append("g")
      .attr("class", "chart-group");

    // Append a group for the legend
    this.legendGroup = this.svg.append("g")
      .attr("class", "legend-group");

    // Append tooltip div
    this.tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("background-color", "rgba(0, 0, 0, 0.7)")
      .style("color", "white")
      .style("padding", "8px")
      .style("border-radius", "4px")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", 1000);
  },

  // UpdateAsync function
  updateAsync: function(data, element, config, queryResponse, done) {
    // Dynamically populate style options based on measures
    const measureFields = queryResponse.fields.measure_like;
    const dimensionField = queryResponse.fields.dimension_like[0];

    // Clear existing style elements to prevent duplication on update
    config.style_tab.elements = [];

    const defaultColors = [
      "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
      "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"
    ];

    measureFields.forEach((measure, i) => {
      config.style_tab.elements.push({
        type: "text",
        label: `${measure.label_short || measure.label} Label`,
        id: `measure_label_${measure.name}`,
        default: measure.label_short || measure.label,
        placeholder: measure.label_short || measure.label,
      });
      config.style_tab.elements.push({
        type: "color",
        label: `${measure.label_short || measure.label} Color`,
        id: `measure_color_${measure.name}`,
        default: defaultColors[i % defaultColors.length],
      });
    });

    // Re-render options in Looker UI
    this.trigger("updateConfig", config);

    // Get dimensions of the container
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const margin = {
      top: 40,
      right: 40,
      bottom: 40,
      left: 40
    };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const radius = Math.min(chartWidth, chartHeight) / 2;

    // Center the chart group
    this.chartGroup.attr("transform", `translate(${width / 2}, ${height / 2})`);

    // Extract data
    const dimensionName = dimensionField.name;
    const measureNames = measureFields.map(m => m.name);

    let dataProcessed = [];
    let allValues = [];

    data.forEach(row => {
      const dimensionValue = row[dimensionName].value;
      let entry = {
        name: dimensionValue,
        axes: []
      };
      measureNames.forEach(measureName => {
        const value = row[measureName].value;
        entry.axes.push({
          axis: config[`measure_label_${measureName}`] || queryResponse.fields.measure_like.find(m => m.name === measureName).label_short || queryResponse.fields.measure_like.find(m => m.name === measureName).label,
          value: value,
          originalMeasureName: measureName
        });
        allValues.push(value);
      });
      dataProcessed.push(entry);
    });

    const maxValue = d3.max(allValues);
    const numAxes = measureNames.length;
    const angleSlice = (2 * Math.PI) / numAxes;

    // Scales
    const radialScale = d3.scaleLinear()
      .range([0, radius])
      .domain([0, maxValue]);

    // Grid Lines (Concentric Circles)
    const gridLevels = config.grid_line_interval; // Use the configured interval
    const gridCircles = this.chartGroup.selectAll(".grid-circle")
      .data(d3.range(1, gridLevels + 1).map(d => d * radius / gridLevels))
      .join(
        enter => enter.append("circle")
        .attr("class", "grid-circle")
        .attr("r", d => d)
        .style("fill", "#CDCDCD")
        .style("stroke", "#CDCDCD")
        .style("fill-opacity", 0.1),
        update => update
        .attr("r", d => d),
        exit => exit.remove()
      );

    // Axis Lines
    const axisLines = this.chartGroup.selectAll(".axis-line")
      .data(measureNames)
      .join(
        enter => enter.append("line")
        .attr("class", "axis-line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", (d, i) => radialScale(maxValue) * Math.cos(angleSlice * i - Math.PI / 2))
        .attr("y2", (d, i) => radialScale(maxValue) * Math.sin(angleSlice * i - Math.PI / 2))
        .style("stroke", "black")
        .style("stroke-width", "1px"),
        update => update
        .attr("x2", (d, i) => radialScale(maxValue) * Math.cos(angleSlice * i - Math.PI / 2))
        .attr("y2", (d, i) => radialScale(maxValue) * Math.sin(angleSlice * i - Math.PI / 2)),
        exit => exit.remove()
      );

    // Axis Labels
    const axisLabels = this.chartGroup.selectAll(".axis-label")
      .data(measureFields)
      .join(
        enter => enter.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("x", (d, i) => (radialScale(maxValue) + 20) * Math.cos(angleSlice * i - Math.PI / 2))
        .attr("y", (d, i) => (radialScale(maxValue) + 20) * Math.sin(angleSlice * i - Math.PI / 2))
        .text(d => config[`measure_label_${d.name}`] || d.label_short || d.label)
        .style("font-size", "12px")
        .style("fill", "black"),
        update => update
        .attr("x", (d, i) => (radialScale(maxValue) + 20) * Math.cos(angleSlice * i - Math.PI / 2))
        .attr("y", (d, i) => (radialScale(maxValue) + 20) * Math.sin(angleSlice * i - Math.PI / 2))
        .text(d => config[`measure_label_${d.name}`] || d.label_short || d.label)
        .style("opacity", config.show_axis_value ? 1 : 0),
        exit => exit.remove()
      );

    // Radar Line Generator
    const radarLine = d3.lineRadial()
      .curve(d3.curveLinearClosed)
      .radius(d => radialScale(d.value))
      .angle((d, i) => angleSlice * i);

    // Draw the polygons
    const polygons = this.chartGroup.selectAll(".radar-polygon")
      .data(dataProcessed)
      .join(
        enter => enter.append("path")
        .attr("class", "radar-polygon")
        .attr("d", d => radarLine(d.axes))
        .style("fill", (d, i) => config[`measure_color_${measureNames[i]}`] || defaultColors[i % defaultColors.length]) // Use first measure's color for simplicity
        .style("fill-opacity", 0.4)
        .style("stroke-width", 2)
        .style("stroke", (d, i) => config[`measure_color_${measureNames[i]}`] || defaultColors[i % defaultColors.length]),
        update => update
        .attr("d", d => radarLine(d.axes))
        .style("fill", (d, i) => config[`measure_color_${measureNames[i]}`] || defaultColors[i % defaultColors.length])
        .style("stroke", (d, i) => config[`measure_color_${measureNames[i]}`] || defaultColors[i % defaultColors.length]),
        exit => exit.remove()
      );

    // Draw the data points (circles) and add tooltips
    const circles = this.chartGroup.selectAll(".radar-circle-group")
      .data(dataProcessed)
      .join(
        enter => enter.append("g").attr("class", "radar-circle-group"),
        update => update,
        exit => exit.remove()
      );

    circles.selectAll(".radar-circle")
      .data(d => d.axes.map(axis => ({
        ...axis,
        parentName: d.name
      })))
      .join(
        enter => enter.append("circle")
        .attr("class", "radar-circle")
        .attr("r", 5)
        .attr("cx", (d, i) => radialScale(d.value) * Math.cos(angleSlice * i - Math.PI / 2))
        .attr("cy", (d, i) => radialScale(d.value) * Math.sin(angleSlice * i - Math.PI / 2))
        .style("fill", (d, i) => config[`measure_color_${d.originalMeasureName}`] || defaultColors[i % defaultColors.length])
        .style("fill-opacity", 0.8)
        .style("stroke", "white")
        .style("stroke-width", 1)
        .on("mouseover", (event, d) => {
          this.tooltip.transition()
            .duration(200)
            .style("opacity", .9);
          this.tooltip.html(`
              <strong>${d.parentName}</strong><br/>
              ${d.axis}: ${d.value}
            `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", () => {
          this.tooltip.transition()
            .duration(500)
            .style("opacity", 0);
        }),
        update => update
        .attr("cx", (d, i) => radialScale(d.value) * Math.cos(angleSlice * i - Math.PI / 2))
        .attr("cy", (d, i) => radialScale(d.value) * Math.sin(angleSlice * i - Math.PI / 2))
        .style("fill", (d, i) => config[`measure_color_${d.originalMeasureName}`] || defaultColors[i % defaultColors.length]),
        exit => exit.remove()
      );

    // Legend
    if (config.show_legend) {
      this.legendGroup.style("display", "block");

      const legendRectSize = 18;
      const legendSpacing = 4;

      const legendItems = this.legendGroup.selectAll(".legend-item")
        .data(dataProcessed)
        .join(
          enter => {
            const item = enter.append("g")
              .attr("class", "legend-item");
            item.append("rect")
              .attr("width", legendRectSize)
              .attr("height", legendRectSize)
              .style("fill", (d, i) => config[`measure_color_${measureNames[i]}`] || defaultColors[i % defaultColors.length])
              .style("stroke", "black")
              .style("stroke-width", 1);
            item.append("text")
              .attr("x", legendRectSize + legendSpacing)
              .attr("y", legendRectSize / 2)
              .attr("dy", "0.35em")
              .text(d => d.name)
              .style("font-size", "12px")
              .style("fill", "black");
            return item;
          },
          update => {
            update.select("rect")
              .style("fill", (d, i) => config[`measure_color_${measureNames[i]}`] || defaultColors[i % defaultColors.length]);
            update.select("text")
              .text(d => d.name);
            return update;
          },
          exit => exit.remove()
        );

      let legendX = 0;
      let legendY = 0;

      if (config.legend_position === "right") {
        legendX = width - margin.right - 100; // Adjust as needed
        legendY = margin.top;
        legendItems.attr("transform", (d, i) => `translate(${legendX}, ${legendY + i * (legendRectSize + legendSpacing)})`);
      } else if (config.legend_position === "left") {
        legendX = margin.left;
        legendY = margin.top;
        legendItems.attr("transform", (d, i) => `translate(${legendX}, ${legendY + i * (legendRectSize + legendSpacing)})`);
      } else if (config.legend_position === "bottom") {
        legendX = (width - legendItems.node().getBBox().width) / 2; // Center horizontally
        legendY = height - margin.bottom - (dataProcessed.length * (legendRectSize + legendSpacing));
        legendItems.attr("transform", (d, i) => `translate(${legendX + i * (legendRectSize + legendSpacing + 50)}, ${legendY})`); // Arrange horizontally
      }

    } else {
      this.legendGroup.style("display", "none");
    }

    done();
  }
});
