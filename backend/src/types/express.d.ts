declare global {
  namespace Express {
    interface Request {
      user: {
        id: string
      }
      tenant: {
        organisation_id: string
        branch_id: string | null
        role: string
      }
    }
  }
}

export {};
