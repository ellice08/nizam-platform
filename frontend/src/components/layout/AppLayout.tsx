import { Outlet, useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AppSidebar } from "./AppSidebar"
import { MobileTopBar } from "./MobileTopBar"
import { useAuthStore } from "@/store"
import { useOrganisation } from "@/hooks"
import { PlatformAssistantEmbed } from "@/components/PlatformAssistantEmbed"

type AppLayoutProps = {
  variant: "admin" | "dashboard"
}

export function AppLayout({ variant }: AppLayoutProps) {
  const { organisationId, tenantOrgId, tenantOrgName, clearTenantOrg } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const activeOrgId = variant === "dashboard"
    ? (tenantOrgId ?? organisationId ?? '')
    : ''

  const { data: org } = useOrganisation(activeOrgId)

  useEffect(() => {
    if (variant !== "dashboard") return
    if (!org?.branding_config) return

    const config = org.branding_config as {
      primary_color?: string
      primary_hover_color?: string
      secondary_color?: string
      accent_color?: string
      background_color?: string
      font?: string
    }

    const root = document.documentElement

    if (config.primary_color) {
      const hsl = hexToHsl(config.primary_color)
      if (hsl) {
        root.style.setProperty('--primary', hsl)
        root.style.setProperty('--ring', hsl)
        root.style.setProperty('--sidebar-primary', hsl)
        root.style.setProperty('--sidebar-ring', hsl)
      }
    }

    if (config.primary_hover_color) {
      const hsl = hexToHsl(config.primary_hover_color)
      if (hsl) root.style.setProperty('--primary-hover', hsl)
    } else if (config.primary_color) {
      const hsl = hexToHsl(config.primary_color)
      if (hsl) {
        const parts = hsl.split(' ')
        const l = parseFloat(parts[2])
        const darkenedL = Math.max(0, l - 6)
        root.style.setProperty('--primary-hover', `${parts[0]} ${parts[1]} ${darkenedL}%`)
      }
    }

    if (config.secondary_color) {
      const hsl = hexToHsl(config.secondary_color)
      if (hsl) root.style.setProperty('--rose', hsl)
    }

    if (config.accent_color) {
      const hsl = hexToHsl(config.accent_color)
      if (hsl) {
        root.style.setProperty('--accent', hsl)
        root.style.setProperty('--destructive', hsl)
      }
    }

    if (config.background_color) {
      const hsl = hexToHsl(config.background_color)
      if (hsl) {
        root.style.setProperty('--background', hsl)
        root.style.setProperty('--sidebar-background', hsl)
      }
    }

    return () => {
      root.style.removeProperty('--primary')
      root.style.removeProperty('--primary-hover')
      root.style.removeProperty('--ring')
      root.style.removeProperty('--sidebar-primary')
      root.style.removeProperty('--sidebar-ring')
      root.style.removeProperty('--rose')
      root.style.removeProperty('--accent')
      root.style.removeProperty('--destructive')
      root.style.removeProperty('--background')
      root.style.removeProperty('--sidebar-background')
    }
  }, [org, variant])

  useEffect(() => {
    if (variant !== 'dashboard') return
    void queryClient.invalidateQueries()
  }, [tenantOrgId])

  const handleExitTenantMode = () => {
    clearTenantOrg()
    navigate('/admin')
  }

  return (
    <div className="min-h-screen w-full flex bg-background text-foreground">
      <AppSidebar variant={variant} org={org} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopBar variant={variant} org={org} />
        {variant === "dashboard" && tenantOrgId && (
          <div className="w-full bg-[#7A2535] px-6 py-2.5 flex items-center justify-between shrink-0">
            <p className="text-xs text-white font-medium tracking-wide">
              Viewing as: <span className="font-bold">{tenantOrgName}</span>
            </p>
            <button
              onClick={handleExitTenantMode}
              className="text-xs text-white/80 hover:text-white underline underline-offset-2 transition-colors"
            >
              Exit client view
            </button>
          </div>
        )}
        <main className="flex-1 px-4 sm:px-6 md:px-10 py-6 md:py-8 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
      {variant === "dashboard" && <PlatformAssistantEmbed />}
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
