import { Outlet } from "react-router-dom"
import { useEffect } from "react"
import { AppSidebar } from "./AppSidebar"
import { useAuthStore } from "@/store"
import { useOrganisation } from "@/hooks"

type AppLayoutProps = {
  variant: "admin" | "dashboard"
}

export function AppLayout({ variant }: AppLayoutProps) {
  const { organisationId } = useAuthStore()
  const { data: org } = useOrganisation(
    variant === "dashboard" ? (organisationId ?? '') : ''
  )

  useEffect(() => {
    if (variant !== "dashboard") return
    if (!org?.branding_config) return

    const config = org.branding_config as {
      primary_color?: string
      secondary_color?: string
      font?: string
    }

    const root = document.documentElement

    if (config.primary_color) {
      const hsl = hexToHsl(config.primary_color)
      if (hsl) root.style.setProperty('--primary', hsl)
    }

    if (config.secondary_color) {
      const hsl = hexToHsl(config.secondary_color)
      if (hsl) root.style.setProperty('--rose', hsl)
    }

    return () => {
      root.style.removeProperty('--primary')
      root.style.removeProperty('--rose')
    }
  }, [org, variant])

  return (
    <div className="min-h-screen w-full flex bg-background text-foreground">
      <AppSidebar variant={variant} org={org} />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 px-6 md:px-10 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return null

  let r = parseInt(result[1], 16) / 255
  let g = parseInt(result[2], 16) / 255
  let b = parseInt(result[3], 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export default AppLayout
