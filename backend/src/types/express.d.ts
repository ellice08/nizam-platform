declare module 'express-serve-static-core' {
  interface Request {
    tenant: {
      user_id: string
      tenant_id: string
      role: string
    }
  }
}
