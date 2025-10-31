"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface Admin {
  id: number
  email: string
  name: string
  role: string
  region: string | null
}

interface SiteStats {
  total_sites: number
  high_utility: number
  avg_utility: number
  low_utility: number
  avg_traffic_tb: number
  avg_users: number
}

export default function AdminDashboard() {
  const router = useRouter()
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SiteStats | null>(null)

  useEffect(() => {
    // Check if admin is logged in
    const adminData = localStorage.getItem("admin")
    if (!adminData) {
      router.push("/login")
      return
    }

    const parsedAdmin = JSON.parse(adminData)
    setAdmin(parsedAdmin)

    // Fetch region-specific stats
    fetchStats(parsedAdmin)
    setLoading(false)
  }, [router])

  const fetchStats = async (adminData: Admin) => {
    try {
      // In a real app, this would call your Flask backend
      // For now, we'll show placeholder data
      setStats({
        total_sites: adminData.region ? 45 : 250,
        high_utility: adminData.region ? 12 : 65,
        avg_utility: adminData.region ? 18 : 95,
        low_utility: adminData.region ? 15 : 90,
        avg_traffic_tb: adminData.region ? 3.2 : 3.5,
        avg_users: adminData.region ? 52 : 58,
      })
    } catch (error) {
      console.error("Error fetching stats:", error)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("admin")
    localStorage.removeItem("adminToken")
    router.push("/login")
  }

  const handleGoToMap = () => {
    // Store admin info for the map to use
    router.push("/")
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  if (!admin) {
    return null
  }

  const isAdmin = admin.role === "super_admin"

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-1">Welcome, {admin.name}</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>

        {/* Admin Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Your Access Level</CardTitle>
            <CardDescription>Admin account information and permissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <p className="font-semibold">{admin.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-semibold text-sm">{admin.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Role</p>
                <p className="font-semibold">{isAdmin ? "Super Admin" : "Region Admin"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Access Region</p>
                <p className="font-semibold">{admin.region || "All Regions"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Access Info Banner */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">Access Information</CardTitle>
          </CardHeader>
          <CardContent className="text-blue-800">
            {isAdmin ? (
              <p>
                You have <strong>full access</strong> to all regions and can view all site data, statistics, and perform
                administrative tasks across the entire network.
              </p>
            ) : (
              <p>
                You have access to <strong>{admin.region}</strong> region only. You can view and manage sites and
                statistics for this region. Contact your administrator for access to other regions.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_sites}</div>
                <p className="text-xs text-gray-600 mt-1">{isAdmin ? "All regions" : `In ${admin.region}`}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Avg Traffic</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.avg_traffic_tb.toFixed(1)} TB</div>
                <p className="text-xs text-gray-600 mt-1">Per site monthly</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Avg Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.avg_users}</div>
                <p className="text-xs text-gray-600 mt-1">Per site</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Utility Distribution */}
        {stats && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Site Utility Distribution</CardTitle>
              <CardDescription>{isAdmin ? "All regions" : `${admin.region} region`}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-3xl font-bold text-green-600">{stats.high_utility}</div>
                  <p className="text-sm text-gray-600 mt-2">High Utility Sites</p>
                  <p className="text-xs text-gray-500">
                    {((stats.high_utility / stats.total_sites) * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="text-3xl font-bold text-yellow-600">{stats.avg_utility}</div>
                  <p className="text-sm text-gray-600 mt-2">Average Utility Sites</p>
                  <p className="text-xs text-gray-500">{((stats.avg_utility / stats.total_sites) * 100).toFixed(1)}%</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="text-3xl font-bold text-red-600">{stats.low_utility}</div>
                  <p className="text-sm text-gray-600 mt-2">Low Utility Sites</p>
                  <p className="text-xs text-gray-500">{((stats.low_utility / stats.total_sites) * 100).toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Interactive Map</CardTitle>
              <CardDescription>
                View and manage sites on the map
                {!isAdmin && ` for ${admin.region}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={handleGoToMap}>
                Open Map
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detailed Reports</CardTitle>
              <CardDescription>Export and view detailed site statistics</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full bg-transparent" variant="outline" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
