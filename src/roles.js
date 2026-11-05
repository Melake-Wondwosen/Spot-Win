// Where each role lands after signing in. ASMs, RTMs and managers share the manager view.
export const VIEWERS = ['manager', 'rtm', 'asm', 'admin']
// Roles that record visits. ASMs and RTMs record too, from the button on their team view.
export const RECORDERS = ['sales', 'asm', 'rtm']
export const homeFor = (user) => (user?.role === 'admin' ? '/admin' : VIEWERS.includes(user?.role) ? '/manager' : '/')
export const isSales = (user) => !!user && !VIEWERS.includes(user.role)
export const canRecord = (user) => !!user && RECORDERS.includes(user.role)
