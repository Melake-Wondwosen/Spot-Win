// Where each role lands after signing in. ASMs, RTMs and managers share the manager view.
export const VIEWERS = ['manager', 'rtm', 'asm', 'admin']
export const homeFor = (user) => (user?.role === 'admin' ? '/admin' : VIEWERS.includes(user?.role) ? '/manager' : '/')
export const isSales = (user) => !!user && !VIEWERS.includes(user.role)
