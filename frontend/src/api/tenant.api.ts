import { apiClient } from '@/lib/axios'
import type {
  Tenant,
  TenantWithCounts,
  TenantStats,
  CreateTenantPayload,
  UpdateTenantPayload,
  ApiSuccess,
} from '@/types/api.types'

const getAllTenants = async (): Promise<Tenant[]> => {
  const response = await apiClient.get<ApiSuccess<Tenant[]>>('/api/tenants')
  return response.data.data
}

const getTenantById = async (id: string): Promise<TenantWithCounts> => {
  const response = await apiClient.get<ApiSuccess<TenantWithCounts>>(`/api/tenants/${id}`)
  return response.data.data
}

const createTenant = async (payload: CreateTenantPayload): Promise<Tenant> => {
  const response = await apiClient.post<ApiSuccess<Tenant>>('/api/tenants', payload)
  return response.data.data
}

const updateTenant = async (id: string, payload: UpdateTenantPayload): Promise<Tenant> => {
  const response = await apiClient.patch<ApiSuccess<Tenant>>(`/api/tenants/${id}`, payload)
  return response.data.data
}

const getTenantStats = async (id: string): Promise<TenantStats> => {
  const response = await apiClient.get<ApiSuccess<TenantStats>>(`/api/tenants/${id}/stats`)
  return response.data.data
}

export const tenantApi = {
  getAllTenants,
  getTenantById,
  createTenant,
  updateTenant,
  getTenantStats,
}
