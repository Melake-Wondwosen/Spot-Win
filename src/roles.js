// Where each role lands after signing in. ASMs and managers share the manager view.
export const VIEWERS = ['manager', 'asm', 'admin']
export const homeFor = (user) => (user?.role === 'admin' ? '/admin' : user?.role === 'manager' || user?.role === 'asm' ? '/manager' : '/')
export const isSales = (user) => !!user && !VIEWERS.includes(user.role)
