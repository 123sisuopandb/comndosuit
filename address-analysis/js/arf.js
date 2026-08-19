var margin = [20, 120, 20, 140],
    width = 1280 - margin[1] - margin[3],
    height = 800 - margin[0] - margin[2],
    i = 0,
    duration = 1250,
    root,
    allSearchNodes = [],
    searchMatches = [];

var tree = d3.tree()
    .nodeSize([34, 1])
    .separation(function(a, b) { return 1; });

var diagonal = d3.linkHorizontal()
    .x(function(d) { return d.y; })
    .y(function(d) { return d.x; });

var svgW = width + margin[1] + margin[3];
var svgH = height + margin[0] + margin[2];

var svgEl = d3.select("#body").append("svg")
    .attr("viewBox", "0 0 " + svgW + " " + svgH)
    .attr("preserveAspectRatio", "xMidYMid meet");

var zoom = d3.zoom()
    .scaleExtent([0.1, 3])
    .on("zoom", function(event) {
      var t = event.transform;
      vis.attr("transform",
        "translate(" + (margin[3] + t.x) + "," + (margin[0] + t.y) + ")" +
        " scale(" + t.k + ")");
    });

svgEl.call(zoom);

// Close panel when clicking SVG background (not a node or link)
svgEl.on("click", function(event) {
  if (event.target === svgEl.node() || event.target.tagName === "svg") {
    closePanel();
  }
});

var vis = svgEl.append("g")
    .attr("transform", "translate(" + margin[3] + "," + margin[0] + ")");

function getCSSVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

// Parse "(T)", "(D)", "(R)", "(M)" suffixes out of a name.
// Returns { cleanName: string, badges: string[] }.
var BADGE_TYPES = ['T', 'D', 'R', 'M'];
function parseName(name) {
  var badges = [];
  var clean = name;
  BADGE_TYPES.forEach(function(b) {
    var suffix = ' (' + b + ')';
    if (clean.indexOf(suffix) !== -1) {
      badges.push(b);
      clean = clean.replace(suffix, '');
    }
  });
  return { cleanName: clean, badges: badges };
}

// Render (or re-render) the whole tree from a hierarchy data object.
// Called by the Address Analysis controller (address-graph.js) once a
// Bitcoin address has been fetched and turned into a {name, children[]} tree.
// Exposed on window so the controller can drive it.
function renderGraph(json) {
  // Reset the canvas so a fresh address can be analysed cleanly.
  vis.selectAll("*").remove();
  i = 0;

  root = d3.hierarchy(json, function(d) {
    return d && d.children ? d.children.filter(function(c) { return c != null; }) : null;
  });
  root.x0 = height / 2;
  root.y0 = 0;

  // Collect searchable nodes (everything below the root that carries a label).
  allSearchNodes = root.descendants().filter(function(d) {
    return d.depth > 0 && d.data && d.data.name;
  });

  function collapse(d) {
    if (d.children) {
      d._children = d.children;
      d._children.forEach(collapse);
      d.children = null;
    }
  }

  if (root.children) root.children.forEach(collapse);

  // Stretch the viewBox to match the actual rendered aspect ratio so the
  // zoom-to-fill calculation uses the real visible area, not the fixed
  // 1280x800 letterboxed region.
  var rect = svgEl.node().getBoundingClientRect();
  if (rect.width && rect.height) {
    svgH = Math.round(svgW * (rect.height / rect.width));
    svgEl.attr("viewBox", "0 0 " + svgW + " " + svgH);
  }

  // Run tree layout to get final node positions, then compute zoom from data.
  tree(root);
  root.descendants().forEach(function(d) { d.y = d.depth * 720; });
  var visibleNodes = root.descendants();
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  visibleNodes.forEach(function(d) {
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
    if (d.y < minY) minY = d.y;
    if (d.y > maxY) maxY = d.y;
  });
  var pad = 40;
  var bw = (maxY - minY) || 1;
  var bh = (maxX - minX) || 1;
  var k = Math.min((svgW - pad * 2) / bw, (svgH - pad * 2) / bh, 3);
  var tx = pad - minY * k;
  var cy = (minX + maxX) / 2;
  var ty = svgH / 2 - margin[0] - cy * k;
  svgEl.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));

  update(root);
  initSearch();
}
window.renderGraph = renderGraph;

function update(source) {
  tree(root);
  var nodes = root.descendants().reverse();
  var links = root.links();

  // Normalize for fixed-depth.
  nodes.forEach(function(d) { d.y = d.depth * 720; });

  // Update the nodes
  var node = vis.selectAll("g.node")
      .data(nodes, function(d) { return d.id || (d.id = ++i); });

  // Enter any new nodes at the parent's previous position.
  var nodeEnter = node.enter().append("g")
      .attr("class", "node")
      .attr("transform", function(d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
      .on("click", function(event, d) {
        event.preventDefault();
        // Address Analysis owns click behaviour (open panel + lazy expand).
        if (typeof window.handleNodeClick === "function") {
          window.handleNodeClick(d);
          return;
        }
        // Fallback (original OSINT behaviour).
        if (d.data.url && !d.children && !d._children) {
          openPanel(d);
        } else {
          toggle(d);
          update(d);
        }
      });

  nodeEnter.append("circle")
      .attr("r", 1e-6)
      .style("fill", function(d) {
        if (d._highlighted) return getCSSVar("--color-accent");
        return d._children ? getCSSVar("--color-node-fill-branch") : getCSSVar("--color-node-fill-leaf");
      });

  nodeEnter.append('a')
      .attr("target", function(d) { return d.data.url && !d.children && !d._children ? null : "_blank"; })
      .attr('href', function(d) { return d.data.url && !d.children && !d._children ? null : d.data.url; })
      .append("text")
      .attr("x", 16)
      .attr("dy", ".35em")
      .attr("text-anchor", "start")
      .style("fill", function(d) {
        return d.data.free ? getCSSVar("--color-text-primary") : getCSSVar("--color-text-secondary");
      })
      .style("fill-opacity", 1e-6)
      .each(function(d) {
        var parsed = parseName(d.data.name);
        var el = d3.select(this);
        el.append("tspan").text(parsed.cleanName);
        parsed.badges.forEach(function(b) {
          el.append("tspan")
            .attr("dx", "4")
            .style("font-size", "10px")
            .style("fill", getCSSVar("--badge-" + b))
            .text("(" + b + ")");
        });
      });

  nodeEnter.append("title")
    .text(function(d) {
      return d.data.description;
    });

  // Transition nodes to their new position.
  var nodeUpdate = node.merge(nodeEnter).transition()
      .duration(duration)
      .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

  nodeUpdate.select("circle")
      .attr("r", function(d) { return d._highlighted ? 13 : 9; })
      .style("fill", function(d) {
        if (d._highlighted) return getCSSVar("--color-accent");
        return d._children ? getCSSVar("--color-node-fill-branch") : getCSSVar("--color-node-fill-leaf");
      })
      .style("stroke", function(d) {
        return d._panelSelected ? getCSSVar("--color-accent") : getCSSVar("--color-node-stroke");
      })
      .style("stroke-width", function(d) {
        if (d._panelSelected) return "3px";
        return d._highlighted ? "2.5px" : "1.5px";
      });

  nodeUpdate.select("text")
      .style("fill-opacity", 1)
      .style("font-weight", function(d) { return d._highlighted ? "bold" : "normal"; })
      .style("fill", function(d) {
        return d.data.free ? getCSSVar("--color-text-primary") : getCSSVar("--color-text-secondary");
      });

  // Transition exiting nodes to the parent's new position.
  var nodeExit = node.exit().transition()
      .duration(duration)
      .attr("transform", function(d) { return "translate(" + source.y + "," + source.x + ")"; })
      .remove();

  nodeExit.select("circle")
      .attr("r", 1e-6);

  nodeExit.select("text")
      .style("fill-opacity", 1e-6);

  // Update the links
  var link = vis.selectAll("path.link")
      .data(links, function(d) { return d.target.id; });

  // Enter any new links at the parent's previous position.
  var linkEnter = link.enter().insert("path", "g")
      .attr("class", "link")
      .attr("d", function(d) {
        var o = {x: source.x0, y: source.y0};
        return diagonal({source: o, target: o});
      });

  linkEnter.transition()
      .duration(duration)
      .attr("d", diagonal);

  // Transition links to their new position.
  link.merge(linkEnter).transition()
      .duration(duration)
      .attr("d", diagonal);

  // Transition exiting links to the parent's new position.
  link.exit().transition()
      .duration(duration)
      .attr("d", function(d) {
        var o = {x: source.x, y: source.y};
        return diagonal({source: o, target: o});
      })
      .remove();

  // Stash the old positions for transition.
  nodes.forEach(function(d) {
    d.x0 = d.x;
    d.y0 = d.y;
  });
}

// Toggle children.
function toggle(d) {
  if (d.children) {
    d._children = d.children;
    d.children = null;
  } else {
    d.children = d._children;
    d._children = null;
  }
}

// Zoom the tree so visible nodes fill the SVG viewport (used on mobile init).
function zoomToFill() {
  var bbox = vis.node().getBBox();
  if (!bbox.width || !bbox.height) return;
  var pad = 40;
  var scaleX = (svgW - pad * 2) / bbox.width;
  var scaleY = (svgH - pad * 2) / bbox.height;
  var k = Math.min(scaleX, scaleY, 3);
  var tx = svgW / 2 - (bbox.x + bbox.width / 2) * k - margin[3];
  var ty = svgH / 2 - (bbox.y + bbox.height / 2) * k - margin[0];
  svgEl.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
}

// Auto-pan viewport to center on a node after expand/click.
function zoomToNode(d) {
  var currentK = d3.zoomTransform(svgEl.node()).k;
  var rect = svgEl.node().getBoundingClientRect();
  var svgScale = rect.width / svgW;
  // Use the visible viewport center (accounts for header/nav above the SVG).
  var vpCenterX = rect.width / 2 / svgScale;
  var vpCenterY = (window.innerHeight / 2 - rect.top) / svgScale;
  var tx = vpCenterX - margin[3] - d.y * currentK;
  var ty = vpCenterY - margin[0] - d.x * currentK;
  svgEl.transition().duration(duration)
    .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(currentK));
}

// Client-side search over all nodes.
var searchDebounceTimer = null;
var _searchWired = false;

function initSearch() {
  if (_searchWired) return;
  var input = document.getElementById("search-input");
  if (!input) return;
  _searchWired = true;
  input.addEventListener("input", function() {
    clearTimeout(searchDebounceTimer);
    var query = input.value.trim();
    searchDebounceTimer = setTimeout(function() { doSearch(query); }, 200);
  });

  var results = document.getElementById("search-results");
  if (results) {
    results.addEventListener("click", function(e) {
      var item = e.target.closest(".search-result-item");
      if (!item) return;
      // If the click was on the external link, let it navigate normally
      if (e.target.closest(".search-result-ext")) return;
      var idx = parseInt(item.getAttribute("data-node-idx"), 10);
      if (!isNaN(idx) && searchMatches[idx]) {
        revealNode(searchMatches[idx]);
      }
    });
    results.addEventListener("keydown", function(e) {
      if (e.key !== "Enter") return;
      var item = e.target.closest(".search-result-item");
      if (!item) return;
      if (e.target.closest(".search-result-ext")) return;
      var idx = parseInt(item.getAttribute("data-node-idx"), 10);
      if (!isNaN(idx) && searchMatches[idx]) {
        revealNode(searchMatches[idx]);
      }
    });
  }
}

function doSearch(query) {
  var results = document.getElementById("search-results");
  if (!results || !root) return;

  // Clear highlights whenever the query changes
  root.descendants().forEach(function(n) { n._highlighted = false; });

  if (!query) {
    searchMatches = [];
    results.innerHTML = "";
    results.classList.remove("visible");
    update(root);
    return;
  }

  var lower = query.toLowerCase();
  searchMatches = allSearchNodes.filter(function(d) {
    var name = (d.data.name || "").toLowerCase();
    var desc = (d.data.description || "").toLowerCase();
    return name.indexOf(lower) !== -1 || desc.indexOf(lower) !== -1;
  }).slice(0, 50);

  results.classList.add("visible");

  if (searchMatches.length === 0) {
    results.innerHTML = '<div class="search-no-results">No results found for “' + escapeHtml(query) + '”</div>';
    return;
  }

  var html = searchMatches.map(function(d, idx) {
    var path = d.ancestors().reverse().slice(1, -1).map(function(a) {
      return escapeHtml(a.data.name);
    }).join(" › ");
    var name = escapeHtml(parseName(d.data.name).cleanName);
    return '<div class="search-result-item" role="option" tabindex="0" data-node-idx="' + idx + '">' +
      '<div class="search-result-header">' +
      '<span class="search-result-name">' + name + '</span>' +
      '</div>' +
      (path ? '<div class="search-result-path">' + path + '</div>' : '') +
      '</div>';
  }).join("");

  results.innerHTML = html;
}

// Reveal a node in the tree: collapse everything, expand ancestors, highlight and pan to it.
function revealNode(d) {
  // Collapse entire tree
  root.descendants().forEach(function(n) {
    n._highlighted = false;
    if (n.children) {
      n._children = n.children;
      n.children = null;
    }
  });

  // Expand all ancestors from root down to d's parent
  d.ancestors().forEach(function(ancestor) {
    if (ancestor._children) {
      ancestor.children = ancestor._children;
      ancestor._children = null;
    }
  });

  // Highlight the target node
  d._highlighted = true;

  // Re-render and pan
  update(root);
  zoomToNode(d);

  // Close the search dropdown
  var results = document.getElementById("search-results");
  if (results) {
    results.innerHTML = "";
    results.classList.remove("visible");
  }
  var input = document.getElementById("search-input");
  if (input) input.value = "";
  searchMatches = [];
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return (str || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeUrl(url) {
  if (!url) return "#";
  return /^https?:\/\//i.test(url) ? url : "#";
}

// === Details Panel ===
// Content is populated by the Address Analysis controller (address-graph.js)
// via window.renderPanelContent(d); this file only handles open/close + the
// node selection ring.

var _panelNode = null;

function openPanel(d) {
  var panel = document.getElementById("tool-panel");
  var overlay = document.getElementById("panel-overlay");
  if (!panel) return;

  // Clear previous selection ring
  if (_panelNode) {
    _panelNode._panelSelected = false;
  }

  _panelNode = d;
  d._panelSelected = true;

  // Populate the panel with blockchain-aware content.
  if (typeof window.renderPanelContent === "function") {
    window.renderPanelContent(d);
  }

  // Show panel and overlay
  panel.classList.add("open");
  if (overlay) overlay.classList.add("visible");

  // Re-render to show selection ring
  if (root) update(root);
}

function closePanel() {
  var panel = document.getElementById("tool-panel");
  var overlay = document.getElementById("panel-overlay");
  if (panel) panel.classList.remove("open");
  if (overlay) overlay.classList.remove("visible");

  if (_panelNode) {
    _panelNode._panelSelected = false;
    _panelNode = null;
  }

  // Re-render to remove selection ring
  if (root) update(root);
}

// Keyboard: Escape closes panels
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    var notesPanel = document.getElementById("notes-panel");
    if (notesPanel && notesPanel.classList.contains("open")) {
      toggleNotesPanel();
    } else {
      closePanel();
    }
  }
});

// Wire close button once DOM is ready
document.addEventListener("DOMContentLoaded", function() {
  var closeBtn = document.getElementById("panel-close");
  if (closeBtn) closeBtn.addEventListener("click", closePanel);
});

// Toggle light/dark mode and persist preference.
function goDark() {
  var body = document.body;
  var isLight = body.classList.toggle("light-mode");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  var btn = document.getElementById("header-theme-toggle");
  if (btn) {
    btn.textContent = isLight ? "Dark Mode" : "Light Mode";
  }
  // Re-render to pick up new CSS variable values for D3 inline styles.
  if (root) update(root);
}

// Notes/About panel toggle
function toggleNotesPanel() {
  var panel = document.getElementById("notes-panel");
  var overlay = document.getElementById("notes-overlay");
  if (!panel) return;

  var isOpen = panel.classList.toggle("open");
  if (overlay) overlay.classList.toggle("visible", isOpen);

  // Populate panel body on first open
  if (isOpen && !panel._populated) {
    var body = document.getElementById("notes-panel-body");
    var source = document.getElementById("notes-content");
    var legend = document.querySelector(".legend");
    if (body) {
      body.innerHTML = "";
      if (legend) body.innerHTML += legend.innerHTML;
      if (source) body.innerHTML += source.innerHTML;
    }
    panel._populated = true;
  }
}

// Close notes panel when overlay is clicked
(function() {
  var overlay = document.getElementById("notes-overlay");
  if (overlay) {
    overlay.addEventListener("click", function() { toggleNotesPanel(); });
  }
})();
