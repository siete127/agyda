export const SOCKET_EVENTS = {
  TICKET_COMMENT: 'ticket:comment',
  TICKET_COMMENT_CREATE: 'ticket:comment:create',
  TICKET_TYPING: 'ticket:typing',
  JOIN_TICKET: 'joinTicket',
  LEAVE_TICKET: 'leaveTicket',
  JOIN_USER: 'joinUser',
  LEAVE_USER: 'leaveUser',
  NEWS_LAYOUT_UPDATE: 'newsLayout:update',
  NEWS_LAYOUT_CHANGED: 'noticia:layoutChanged',
} as const

export type SocketEventKey = keyof typeof SOCKET_EVENTS
export type SocketEventValue = typeof SOCKET_EVENTS[SocketEventKey]
