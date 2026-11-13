// Where each role lands after signing in. ASMs, RTMs and managers share the manager view.
export const VIEWERS = ['manager', 'rtm', 'asm', 'admin', 'ka', 'kam']
// Roles that record visits. ASMs and RTMs record too, from the button on their team view.
export const RECORDERS = ['sales', 'asm', 'rtm', 'ka', 'kam']
export const ROLE_NAME = { sales: 'Sales', asm: 'ASM', rtm: 'RTM', manager: 'Manager', admin: 'Admin', ka: 'Key Account', kam: 'Key Account Manager' }
export const homeFor = (user) => (user?.role === 'admin' ? '/admin' : VIEWERS.includes(user?.role) ? '/manager' : '/')
export const isSales = (user) => !!user && !VIEWERS.includes(user.role)
export const canRecord = (user) => !!user && RECORDERS.includes(user.role)
