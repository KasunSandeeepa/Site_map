// ============================
// Admin Info & Authentication
// ============================
function loadAdminInfo() {
  fetch("/get_admin_info")
    .then((r) => r.json())
    .then((payload) => {
      console.log("[v0] Admin info response:", payload)
      if (!payload.success) {
        window.location.href = "/login"
        return
      }

      const username = payload.username
      const role = payload.role
      const region = payload.region

      // Store admin info globally
      currentAdminRole = role
      currentAdminRegion = region

      const adminUsernameEl = document.getElementById("adminUsername")
      const adminRoleEl = document.getElementById("adminRole")

      const roleDisplay = role === "super_admin" ? "Super Admin" : `${region} Admin`
      adminUsernameEl.textContent = `User: ${username}`
      adminRoleEl.textContent = roleDisplay

      const regionFilter = document.getElementById("regionFilter")
      if (role === "region_admin" && region) {
        regionFilter.value = region
        regionFilter.disabled = true
        // Trigger update to show only the admin's region
        updateRtomFilter()
        updateMarkers()
        updateUtilityTable()
      }
    })
    .catch((err) => {
      console.error("Error loading admin info:", err)
      window.location.href = "/login"
    })
}

function logout() {
  window.location.href = "/logout"
}

loadAdminInfo()

// ============================
// Map Setup
// ============================
const sriLankaBounds = [
  [5.85, 79.65],
  [9.85, 81.95],
]

const L = window.L
const map = L.map("map", {
  maxBounds: sriLankaBounds,
  maxBoundsViscosity: 0.5, // Reduced viscosity to allow popup to show near edges
  maxBoundsViscosity: 1.0,
}).setView([7.8731, 80.7718], 8)

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map)

let allSites = []
let markers = []
let allCities = []
let utilityStats = {}
let trafficChart = null
let userChart = null
let currentSiteId = null
let currentAdminRole = null
let currentAdminRegion = null

// ============================
// Data Loading
// ============================
let dataLoadPromises = {
  sites: null,
  cities: null,
  stats: null,
  adminInfo: null
}

// Load admin info first
dataLoadPromises.adminInfo = fetch("/get_admin_info")
  .then((r) => r.json())
  .then((payload) => {
    console.log("[v0] Admin info loaded:", payload)
    if (!payload.success) {
      window.location.href = "/login"
      throw new Error("Not authenticated")
    }

    const username = payload.username
    const role = payload.role
    const region = payload.region

    // Store admin info globally
    currentAdminRole = role
    currentAdminRegion = region

    const adminUsernameEl = document.getElementById("adminUsername")
    const adminRoleEl = document.getElementById("adminRole")

    const roleDisplay = role === "super_admin" ? "Super Admin" : `${region} Admin`
    adminUsernameEl.textContent = `User: ${username}`
    adminRoleEl.textContent = roleDisplay

    const regionFilter = document.getElementById("regionFilter")
    if (role === "region_admin" && region) {
      regionFilter.value = region
      regionFilter.disabled = true
    }
    
    return payload
  })
  .catch((err) => {
    console.error("Error loading admin info:", err)
    window.location.href = "/login"
  })

dataLoadPromises.sites = fetch("/get_sites")
  .then((r) => r.json())
  .then((payload) => {
    if (!payload.success) {
      alert("Failed to load data: " + (payload.error || "Unknown error"))
      return
    }
    allSites = payload.sites || []
    console.log("[v0] Loaded", allSites.length, "sites")
  })
  .catch((err) => {
    console.error("[v0] Fetch error:", err)
    alert("Error loading data: " + err.message)
  })

dataLoadPromises.cities = fetch("/get_cities")
  .then((r) => r.json())
  .then((payload) => {
    if (!payload.success) return
    allCities = payload.cities || []
    console.log("[v0] Loaded", allCities.length, "cities")
  })
  .catch((err) => console.error("[v0] Cities error:", err))

dataLoadPromises.stats = fetch("/get_utility_stats")
  .then((r) => r.json())
  .then((payload) => {
    if (!payload.success) return
    utilityStats = payload
  })
  .catch((err) => console.error("[v0] Stats error:", err))

// Wait for all data to load, then initialize
Promise.all([
  dataLoadPromises.adminInfo,
  dataLoadPromises.sites,
  dataLoadPromises.cities,
  dataLoadPromises.stats
]).then(() => {
  console.log("[v0] All data loaded, initializing UI")
  populateRtomFilter()
  updateRtomFilter()
  updateMarkers()
  updateUtilityTable()
}).catch(err => {
  console.error("[v0] Error during initialization:", err)
})

// ============================
// Helper Functions
// ============================
function populateRtomFilter() {
  const rtomSelect = document.getElementById("rtomSelect")
  rtomSelect.innerHTML = '<option value="All">All RTOMs</option>'
  
  console.log("[v0] populateRtomFilter - Role:", currentAdminRole, "Region:", currentAdminRegion)
  
  let citiesToShow = []
  
  if (currentAdminRole === 'region_admin' && currentAdminRegion) {
    // For region admin, only show RTOMs from their region
    console.log("[v0] Filtering RTOMs for region admin:", currentAdminRegion)
    citiesToShow = allSites
      .filter(site => {
        const siteRegion = (site.Sales_Region || "").trim()
        return siteRegion === currentAdminRegion
      })
      .map(site => site.RTOM)
      .filter((rtom, index, self) => rtom && self.indexOf(rtom) === index)
      .sort()
    
    console.log("[v0] RTOMs for", currentAdminRegion, ":", citiesToShow)
  } else {
    // For super admin, show all RTOMs
    console.log("[v0] Super admin - showing all RTOMs")
    citiesToShow = allCities
  }
  
  citiesToShow.forEach((city) => {
    const option = document.createElement("option")
    option.value = city
    option.textContent = city
    rtomSelect.appendChild(option)
  })
  
  console.log("[v0] Populated", citiesToShow.length, "RTOMs in dropdown")
}

function updateRtomFilter() {
  const region = document.getElementById("regionFilter").value
  const rtomSelect = document.getElementById("rtomSelect")
  rtomSelect.value = "All"

  if (region === "All") {
    rtomSelect.style.display = "none"
    return
  }

  rtomSelect.style.display = "block"
  
  // Get RTOMs for the selected region
  const regionRtoms = allSites
    .filter((site) => (site.Sales_Region || "").trim() === region)
    .map((site) => site.RTOM)
    .filter((rtom, index, self) => rtom && self.indexOf(rtom) === index)
    .sort()

  rtomSelect.innerHTML = '<option value="All">All RTOMs</option>'
  regionRtoms.forEach((rtom) => {
    const option = document.createElement("option")
    option.value = rtom
    option.textContent = rtom
    rtomSelect.appendChild(option)
  })
  
  // For region admins, automatically show their RTOM dropdown
  if (currentAdminRole === 'region_admin' && currentAdminRegion === region) {
    rtomSelect.style.display = "block"
  }
}

function toFixedSafe(x, d = 2) {
  return x === null || x === undefined || isNaN(x) ? "-" : Number(x).toFixed(d)
}

function formatNum(x) {
  return x === null || x === undefined || !isFinite(x)
    ? "-"
    : Number(x).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function escapeHtml(str) {
  if (str === null || str === undefined) return ""
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function generateLegendHtml(mode) {
  if (mode === "traffic") {
    return `
      <div class="legend-title">Legend: Traffic (TB)</div>
      <div class="legend-item"><div class="legend-dot green"></div><span>&gt;4 TB</span></div>
      <div class="legend-item"><div class="legend-dot yellow"></div><span>2–4 TB</span></div>
      <div class="legend-item"><div class="legend-dot red"></div><span>&lt;2 TB</span></div>
    `
  } else {
    return `
      <div class="legend-title">Legend: User Count</div>
      <div class="legend-item"><div class="legend-dot green"></div><span>&gt;80</span></div>
      <div class="legend-item"><div class="legend-dot yellow"></div><span>40–80</span></div>
      <div class="legend-item"><div class="legend-dot red"></div><span>&lt;40</span></div>
    `
  }
}

function getMarkerColor(site, mode) {
  if (mode === "traffic") {
    const tb = site.Monthly_Traffic_Total_TB
    if (tb === null) return "gray"
    if (tb > 4) return "green"
    if (tb > 2) return "yellow"
    return "red"
  } else {
    const u = site.User_Count
    if (u === null) return "gray"
    if (u > 80) return "green"
    if (u > 40) return "yellow"
    return "red"
  }
}

function clearMarkers() {
  markers.forEach((m) => map.removeLayer(m))
  markers = []
}

function destroyCharts() {
  if (trafficChart) {
    trafficChart.destroy()
    trafficChart = null
  }
  if (userChart) {
    userChart.destroy()
    userChart = null
  }
}

// ============================
// Trend Loading (In Sidebar)
// ============================
function formatMonthLabel(label) {
  // Convert "Jul-24" to "Jul" or "Jun-25" to "Jun"
  // Handle various formats
  if (!label) return label
  
  const parts = String(label).split('-')
  if (parts.length >= 1) {
    return parts[0] // Return just the month part
  }
  return label
}

async function loadAndDisplayTrends(site) {
  try {
    const normalizedId = String(site.eNodeB_ID).trim()
    
    // Prevent reloading same site
    if (currentSiteId === normalizedId && trafficChart && userChart) {
      console.log("[v0] Same site, skipping reload")
      return
    }
    
    currentSiteId = normalizedId
    console.log("[v0] Loading trends for:", normalizedId, site.eNodeB_Name)

    // Destroy existing charts
    destroyCharts()

    // Update sidebar title
    const trendsSection = document.getElementById("trendsSection")
    const trendsSiteTitle = document.getElementById("trendsSiteTitle")
    trendsSiteTitle.textContent = site.eNodeB_Name || "Unknown Site"
    trendsSection.style.display = "block"

    // Show loading state
    const trendsContainer = document.getElementById("trendsContainer")
    trendsContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Loading trends...</p>'

    const response = await fetch(`/get_site_trends/${normalizedId}`)
    const data = await response.json()

    console.log("[v0] Response:", {
      success: data.success,
      traffic: data.traffic_trend?.length || 0,
      users: data.user_trend?.length || 0
    })

    if (!data.success) {
      trendsContainer.innerHTML = `<p style="text-align: center; color: #ef4444; padding: 20px; font-size: 13px;">${data.error || "No trend data"}</p>`
      return
    }

    const hasTraffic = data.traffic_trend && data.traffic_trend.length > 0
    const hasUsers = data.user_trend && data.user_trend.length > 0

    if (!hasTraffic && !hasUsers) {
      trendsContainer.innerHTML = `<p style="text-align: center; color: #999; padding: 20px; font-size: 13px;">No trend data available</p>`
      return
    }

    // Build HTML for charts
    let html = ''
    
    if (hasTraffic) {
      html += `
        <div style="margin-bottom: 20px;">
          <h5 style="font-size: 13px; font-weight: 600; color: #60a5fa; margin-bottom: 10px;">Traffic Trend (GB)</h5>
          <div style="position: relative; height: 180px;">
            <canvas id="sidebarTrafficChart"></canvas>
          </div>
        </div>
      `
    }

    if (hasUsers) {
      html += `
        <div>
          <h5 style="font-size: 13px; font-weight: 600; color: #10b981; margin-bottom: 10px;">User Count Trend</h5>
          <div style="position: relative; height: 180px;">
            <canvas id="sidebarUserChart"></canvas>
          </div>
        </div>
      `
    }

    trendsContainer.innerHTML = html

    // Wait for DOM
    await new Promise(resolve => setTimeout(resolve, 100))

    // Create traffic chart
    if (hasTraffic) {
      const ctx = document.getElementById("sidebarTrafficChart")
      if (ctx) {
        trafficChart = new window.Chart(ctx, {
          type: "line",
          data: {
            labels: data.traffic_trend.map(d => formatMonthLabel(d.period)),
            datasets: [{
              label: "Traffic (GB)",
              data: data.traffic_trend.map(d => d.value),
              borderColor: "#60a5fa",
              backgroundColor: "rgba(96, 165, 250, 0.1)",
              tension: 0.3,
              fill: true,
              pointRadius: 3,
              pointBackgroundColor: "#60a5fa",
              borderWidth: 2,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: "rgba(51, 65, 85, 0.3)" },
                ticks: { color: "#94a3b8", font: { size: 10 } },
              },
              x: {
                grid: { display: false },
                ticks: { 
                  color: "#94a3b8", 
                  font: { size: 9 }, 
                  maxRotation: 0,
                  minRotation: 0
                },
              },
            },
          },
        })
        console.log("[v0] Traffic chart created")
      }
    }

    // Create user chart
    if (hasUsers) {
      const ctx = document.getElementById("sidebarUserChart")
      if (ctx) {
        userChart = new window.Chart(ctx, {
          type: "line",
          data: {
            labels: data.user_trend.map(d => formatMonthLabel(d.period)),
            datasets: [{
              label: "User Count",
              data: data.user_trend.map(d => d.value),
              borderColor: "#10b981",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              tension: 0.3,
              fill: true,
              pointRadius: 3,
              pointBackgroundColor: "#10b981",
              borderWidth: 2,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: "rgba(51, 65, 85, 0.3)" },
                ticks: { color: "#94a3b8", font: { size: 10 } },
              },
              x: {
                grid: { display: false },
                ticks: { 
                  color: "#94a3b8", 
                  font: { size: 9 }, 
                  maxRotation: 0,
                  minRotation: 0
                },
              },
            },
          },
        })
        console.log("[v0] User chart created")
      }
    }

  } catch (err) {
    console.error("[v0] Error:", err)
    const trendsContainer = document.getElementById("trendsContainer")
    if (trendsContainer) {
      trendsContainer.innerHTML = `<p style="text-align: center; color: #ef4444; padding: 20px; font-size: 13px;">Error: ${err.message}</p>`
    }
  }
}

// ============================
// Marker Updates
// ============================
function updateMarkers() {
  clearMarkers()

  const region = document.getElementById("regionFilter").value
  const rtom = document.getElementById("rtomSelect").value
  const mode = document.getElementById("colorMode").value
  const legendContent = document.getElementById("legend-content")

  legendContent.innerHTML = generateLegendHtml(mode)

  allSites.forEach((site) => {
    const siteRegion = (site.Sales_Region || "").trim()
    const siteRtom = (site.RTOM || "").trim()

    if (region !== "All" && siteRegion !== region) return
    if (rtom !== "All" && siteRtom !== rtom) return
    if (!site.Lat || !site.Lon) return

    const color = getMarkerColor(site, mode)
    const marker = L.circleMarker([site.Lat, site.Lon], {
      radius: 8,
      fillColor: color,
      color: "#000",
      weight: 0.6,
      fillOpacity: 0.9,
    })

    // Smaller popup - no trends, removed DL/UL/Avg DL
    const popupHtml = `
      <div style="width: 350px; max-width: 90vw;">
        <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #334155;">
          <h4 style="font-size: 15px; font-weight: 700; color: #60a5fa; margin-bottom: 8px;">${escapeHtml(site.eNodeB_Name || "")}</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: #cbd5e1;">
            <div><b style="color: #94a3b8;">ID:</b> ${escapeHtml(String(site.eNodeB_ID || "-"))}</div>
            <div><b style="color: #94a3b8;">Region:</b> ${escapeHtml(String(site.Sales_Region || "-"))}</div>
            <div><b style="color: #94a3b8;">RTOM:</b> ${escapeHtml(String(site.RTOM || "-"))}</div>
            <div><b style="color: #94a3b8;">Traffic:</b> ${site.Monthly_Traffic_Total_TB ? toFixedSafe(site.Monthly_Traffic_Total_TB, 2) + " TB" : "-"}</div>
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #0f172a;">
              <th style="padding: 6px; text-align: left; color: #94a3b8; font-size: 10px; text-transform: uppercase;">Metric</th>
              <th style="padding: 6px; text-align: right; color: #94a3b8; font-size: 10px; text-transform: uppercase;">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 6px; border-bottom: 1px solid #334155; color: #cbd5e1;">Total Traffic</td>
              <td style="padding: 6px; border-bottom: 1px solid #334155; color: #cbd5e1; text-align: right;">${formatNum(site.Monthly_Traffic_Total_GB)} GB</td>
            </tr>
            <tr>
              <td style="padding: 6px; border-bottom: 1px solid #334155; color: #cbd5e1;">Bandwidth</td>
              <td style="padding: 6px; border-bottom: 1px solid #334155; color: #cbd5e1; text-align: right;">${escapeHtml(String(site.Bandwidth || "-"))}</td>
            </tr>
            <tr>
              <td style="padding: 6px; color: #cbd5e1;">User Count</td>
              <td style="padding: 6px; color: #cbd5e1; text-align: right;">${site.User_Count || "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `

    const popup = L.popup({ 
      maxWidth: 400,
      closeButton: true,
      autoPan: true,
      autoPanPadding: [50, 50], // Add padding so popup doesn't get cut off
      keepInView: true // Keep popup in view
    }).setContent(popupHtml)
    
    marker.bindPopup(popup)

    // Load trends in sidebar when marker is clicked
    marker.on("click", () => {
      console.log("[v0] Marker clicked:", site.eNodeB_Name)
      loadAndDisplayTrends(site)
    })

    marker.addTo(map)
    markers.push(marker)
  })

  console.log("[v0] Displayed", markers.length, "markers")

  if (markers.length > 0) {
    const group = L.featureGroup(markers)
    map.fitBounds(group.getBounds().pad(0.2))
    if (map.getZoom() > 12) map.setZoom(12)
  } else {
    map.setView([7.8731, 80.7718], 8)
  }

  // Don't enforce strict bounds to allow popups near edges to be visible
  // map.setMaxBounds(sriLankaBounds)
}

// ============================
// Utility Table
// ============================
function updateUtilityTable() {
  const tableBody = document.querySelector("#utilityTable tbody")
  tableBody.innerHTML = ""

  const region = document.getElementById("regionFilter").value
  const rtom = document.getElementById("rtomSelect").value
  const mode = document.getElementById("colorMode").value

  let filteredSites = allSites
  if (region !== "All") {
    filteredSites = filteredSites.filter((s) => (s.Sales_Region || "").trim() === region)
  }
  if (rtom !== "All") {
    filteredSites = filteredSites.filter((s) => (s.RTOM || "").trim() === rtom)
  }

  let high = 0, avg = 0, low = 0
  filteredSites.forEach((site) => {
    const color = getMarkerColor(site, mode)
    if (color === "green") high++
    else if (color === "yellow") avg++
    else if (color === "red") low++
  })

  const total = high + avg + low
  const highPct = total > 0 ? ((high / total) * 100).toFixed(1) : 0
  const avgPct = total > 0 ? ((avg / total) * 100).toFixed(1) : 0
  const lowPct = total > 0 ? ((low / total) * 100).toFixed(1) : 0

  const rows = [
    { level: "High", count: high, pct: highPct, color: "high" },
    { level: "Average", count: avg, pct: avgPct, color: "avg" },
    { level: "Low", count: low, pct: lowPct, color: "low" },
  ]

  rows.forEach((row) => {
    const tr = document.createElement("tr")
    const levelTd = document.createElement("td")
    levelTd.textContent = row.level
    levelTd.style.textAlign = "left"

    const countTd = document.createElement("td")
    countTd.textContent = `${row.count} (${row.pct}%)`
    countTd.className = row.color

    tr.appendChild(levelTd)
    tr.appendChild(countTd)
    tableBody.appendChild(tr)
  })
}

// ============================
// Event Listeners
// ============================
document.getElementById("regionFilter").addEventListener("change", () => {
  updateRtomFilter()
  updateMarkers()
  updateUtilityTable()
})

document.getElementById("rtomSelect").addEventListener("change", () => {
  updateMarkers()
  updateUtilityTable()
})

document.getElementById("colorMode").addEventListener("change", () => {
  updateMarkers()
  updateUtilityTable()
})