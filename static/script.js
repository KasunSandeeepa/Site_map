// ============================
// ============================
function loadAdminInfo() {
  fetch("/get_admin_info")
    .then((r) => r.json())
    .then((payload) => {
      if (!payload.success) {
        window.location.href = "/login"
        return
      }

      const username = payload.username
      const role = payload.role
      const region = payload.region

      // Display admin info
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

// Load admin info on page load
loadAdminInfo()

// ============================
// Sri Lanka Map Boundaries
// ============================
const sriLankaBounds = [
  [5.85, 79.65],
  [9.85, 81.95],
]

const L = window.L // Declare the L variable before using it
const map = L.map("map", {
  maxBounds: sriLankaBounds,
  maxBoundsViscosity: 0.9,
}).setView([7.8731, 80.7718], 8)

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map)

let allSites = []
let markers = []
let allCities = []
let utilityStats = {}

// ============================
// Data Loading
// ============================
fetch("/get_sites")
  .then((r) => r.json())
  .then((payload) => {
    if (!payload.success) {
      alert("Failed to load data")
      return
    }
    allSites = payload.sites || []
    updateMarkers()
  })
  .catch((err) => {
    console.error(err)
    alert("Error loading data")
  })

fetch("/get_cities")
  .then((r) => r.json())
  .then((payload) => {
    if (!payload.success) {
      console.error("Failed to load cities")
      return
    }
    allCities = payload.cities || []
    populateRtomFilter()
  })
  .catch((err) => {
    console.error("Error loading cities:", err)
  })

fetch("/get_utility_stats")
  .then((r) => r.json())
  .then((payload) => {
    if (!payload.success) {
      console.error("Failed to load utility stats")
      return
    }
    utilityStats = payload
    updateUtilityTable()
  })
  .catch((err) => {
    console.error("Error loading utility stats:", err)
  })

function populateRtomFilter() {
  const rtomSelect = document.getElementById("rtomSelect")
  rtomSelect.innerHTML = '<option value="All">All RTOMs</option>'

  allCities.forEach((city) => {
    const option = document.createElement("option")
    option.value = city
    option.textContent = city
    rtomSelect.appendChild(option)
  })
}

function updateRtomFilter() {
  const region = document.getElementById("regionFilter").value
  const rtomSelect = document.getElementById("rtomSelect")

  if (region === "All") {
    rtomSelect.style.display = "none"
    rtomSelect.value = "All"
    return
  }

  rtomSelect.style.display = "block"

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

  rtomSelect.value = "All"
}

// ============================
// Utility Functions
// ============================
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
      <div class="legend-item">
        <div class="legend-dot green"></div>
        <span>&gt;4 TB</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot yellow"></div>
        <span>2–4 TB</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot red"></div>
        <span>&lt;2 TB</span>
      </div>
    `
  } else {
    return `
      <div class="legend-title">Legend: User Count</div>
      <div class="legend-item">
        <div class="legend-dot green"></div>
        <span>&gt;80</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot yellow"></div>
        <span>40–80</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot red"></div>
        <span>&lt;40</span>
      </div>
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

// ============================
// Marker & Popup Logic
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

    const popupHtml = `
      <div style="min-width: 600px">
        <h4 style="margin: 6px 0;">${escapeHtml(site.eNodeB_Name || "")}</h4>
        <div><b>ID:</b> ${escapeHtml(String(site.eNodeB_ID || "-"))}</div>
        <div><b>Sales Region:</b> ${escapeHtml(String(site.Sales_Region || "-"))}</div>
        <div><b>RTOM:</b> ${escapeHtml(String(site.RTOM || "-"))}</div>
        <div><b>Monthly Total Traffic:</b> ${site.Monthly_Traffic_Total_TB ? toFixedSafe(site.Monthly_Traffic_Total_TB, 2) + " TB" : "-"}</div>
        <div><b>User Count:</b> ${site.User_Count || "-"}</div>
        <hr/>
        <table class="site-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>DL (GB)</th>
              <th>UL (GB)</th>
              <th>Total (GB)</th>
              <th>Bandwidth</th>
              <th>User Count</th>
              <th>Avg DL (Mbps)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(site.eNodeB_Name || "")}</td>
              <td>${formatNum(site.Monthly_Traffic_DL_GB)}</td>
              <td>${formatNum(site.Monthly_Traffic_UL_GB)}</td>
              <td>${formatNum(site.Monthly_Traffic_Total_GB)}</td>
              <td>${escapeHtml(String(site.Bandwidth || "-"))}</td>
              <td>${site.User_Count || "-"}</td>
              <td>${formatNum(site.Avg_DL_Throughput_Mbps)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `

    marker.bindPopup(popupHtml)
    marker.addTo(map)
    markers.push(marker)
  })

  if (markers.length > 0) {
    const group = L.featureGroup(markers)
    map.fitBounds(group.getBounds().pad(0.2))

    if (map.getZoom() > 12) {
      map.setZoom(12)
    }
  } else {
    map.setView([7.8731, 80.7718], 8)
  }

  map.setMaxBounds(sriLankaBounds)
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

function updateUtilityTable() {
  const region = document.getElementById("regionFilter").value
  const rtom = document.getElementById("rtomSelect").value
  const metric = document.getElementById("colorMode").value
  const tbody = document.getElementById("utilityTableBody")
  const table = document.getElementById("utilityTable")
  const titleDiv = document.querySelector(".utility-table-title")

  const params = new URLSearchParams()
  params.append("region", region)
  params.append("rtom", rtom)
  params.append("metric", metric)

  fetch(`/get_utility_stats?${params}`)
    .then((r) => r.json())
    .then((payload) => {
      if (!payload.success) {
        console.error("Failed to load utility stats")
        return
      }

      const stats = payload.stats
      const regions = payload.regions
      const isRtom = payload.is_rtom
      const rtomBreakdown = payload.rtom_breakdown

      tbody.innerHTML = ""

      const headerRow = table.querySelector("thead tr")
      while (headerRow.children.length > 1) {
        headerRow.removeChild(headerRow.lastChild)
      }

      let titleText = "Site Utility Distribution"
      if (rtom !== "All") {
        const metricLabel = metric === "traffic" ? "(Traffic)" : "(User Count)"
        titleText = `Site Utility Distribution - ${rtom} ${metricLabel}`
      } else if (metric === "users") {
        titleText = "Site Utility Distribution (User Count)"
      }
      titleDiv.textContent = titleText

      let displayRegions = regions
      if (rtomBreakdown && Object.keys(rtomBreakdown).length > 0) {
        displayRegions = [region, ...Object.keys(rtomBreakdown)]
      }

      displayRegions.forEach((r) => {
        const th = document.createElement("th")
        th.textContent = r
        headerRow.appendChild(th)
      })

      const levels = [
        { key: "high", label: "High Utility", class: "high" },
        { key: "avg", label: "Average Utility", class: "avg" },
        { key: "low", label: "Low Utility", class: "low" },
      ]

      levels.forEach((level) => {
        const row = document.createElement("tr")
        const labelCell = document.createElement("td")
        labelCell.textContent = level.label
        labelCell.style.fontWeight = "500"
        row.appendChild(labelCell)

        displayRegions.forEach((r) => {
          const cell = document.createElement("td")
          let value = "-"

          if (r === region && stats[r]) {
            value = stats[r][level.key] + "%"
          } else if (rtomBreakdown && rtomBreakdown[r]) {
            value = rtomBreakdown[r][level.key] + "%"
          }

          cell.textContent = value
          cell.className = level.class
          row.appendChild(cell)
        })

        tbody.appendChild(row)
      })

      if (rtom === "All" && region === "All") {
        const totalRow = document.createElement("tr")
        const totalLabelCell = document.createElement("td")
        totalLabelCell.textContent = "Total"
        totalLabelCell.style.fontWeight = "600"
        totalRow.appendChild(totalLabelCell)

        regions.forEach((r) => {
          const cell = document.createElement("td")
          const regionStats = stats[r]
          if (regionStats) {
            const total = regionStats.high + regionStats.avg + regionStats.low
            cell.textContent = total.toFixed(1) + "%"
          } else {
            cell.textContent = "-"
          }
          cell.className = "total"
          totalRow.appendChild(cell)
        })

        tbody.appendChild(totalRow)
      }
    })
    .catch((err) => {
      console.error("Error loading utility stats:", err)
    })
}
