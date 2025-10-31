import { type NextRequest, NextResponse } from "next/server"

// Admin credentials with roles
const ADMINS = [
  {
    id: 1,
    username: "admin",
    password: "admin123",
    name: "Super Admin",
    role: "super_admin",
    region: null, // Full access to all regions
  },
  {
    id: 2,
    username: "region1",
    password: "region123",
    name: "Region 1 Admin",
    role: "region_admin",
    region: "Metro",
  },
  {
    id: 3,
    username: "region2",
    password: "region123",
    name: "Region 2 Admin",
    role: "region_admin",
    region: "Western",
  },
  {
    id: 4,
    username: "region3",
    password: "region123",
    name: "Region 3 Admin",
    role: "region_admin",
    region: "Central",
  },
  {
    id: 5,
    username: "region4",
    password: "region123",
    name: "Region 4 Admin",
    role: "region_admin",
    region: "Southern",
  },
]

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    // Find admin by username and password
    const admin = ADMINS.find((a) => a.username === username && a.password === password)

    if (!admin) {
      return NextResponse.json({ message: "Invalid username or password" }, { status: 401 })
    }

    // Create a simple token (in production, use JWT)
    const token = Buffer.from(`${admin.id}:${Date.now()}`).toString("base64")

    // Return admin data without password
    const { password: _, ...adminData } = admin

    return NextResponse.json({
      admin: adminData,
      token,
    })
  } catch (error) {
    return NextResponse.json({ message: "An error occurred" }, { status: 500 })
  }
}
