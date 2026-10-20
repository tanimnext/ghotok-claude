import { api } from '@ghotok/shared/api-client';

// One function per admin API endpoint, grouped by area. Pages call these and
// never build URLs themselves. See docs/API.md for the server side.

export const authApi = {
  me: () => api.get('/auth/me'),
  login: (body) => api.post('/auth/login', body),
  logout: () => api.post('/auth/logout'),
};

export const adminApi = {
  overview: () => api.get('/admin/overview'),
  analytics: (days) => api.get('/admin/analytics', { days }),
  auditLogs: (query) => api.get('/admin/audit-logs', query),

  biodatas: (query) => api.get('/admin/biodatas', query),
  biodata: (id) => api.get(`/admin/biodatas/${id}`),
  approveBiodata: (id) => api.post(`/admin/biodatas/${id}/approve`),
  rejectBiodata: (id, reason) => api.post(`/admin/biodatas/${id}/reject`, { reason }),
  editSection: (id, section, data) => api.put(`/admin/biodatas/${id}/sections/${section}`, { data }),
  blockBiodata: (id, blocked, reason) => api.post(`/admin/biodatas/${id}/block`, { blocked, reason }),
  deleteBiodata: (id, reason) => api.post(`/admin/biodatas/${id}/delete`, { reason }),
  restoreBiodata: (id) => api.post(`/admin/biodatas/${id}/restore`, {}),
  nidDocuments: (id) => api.get(`/admin/biodatas/${id}/nid`),
  verifyNid: (id) => api.post(`/admin/biodatas/${id}/nid/verify`, {}),
  rejectNid: (id, note) => api.post(`/admin/biodatas/${id}/nid/reject`, { note }),
  restoreRequests: (query) => api.get('/admin/restore-requests', query),
  approveRestore: (id) => api.post(`/admin/restore-requests/${id}/approve`, {}),
  declineRestore: (id, note) => api.post(`/admin/restore-requests/${id}/decline`, { note }),

  users: (query) => api.get('/admin/users', query),
  user: (id) => api.get(`/admin/users/${id}`),
  updateUser: (id, body) => api.patch(`/admin/users/${id}`, body),
  createUser: (body) => api.post('/admin/users', body),
  resetUserPassword: (id, password) => api.post(`/admin/users/${id}/reset-password`, { password }),

  payments: (query) => api.get('/admin/payments', query),
  verifyPayment: (id) => api.post(`/admin/payments/${id}/verify`),
  rejectPayment: (id, reason) => api.post(`/admin/payments/${id}/reject`, { reason }),
  refunds: (query) => api.get('/admin/refunds', query),
  approveRefund: (id, body) => api.post(`/admin/refunds/${id}/approve`, body),
  rejectRefund: (id, note) => api.post(`/admin/refunds/${id}/reject`, { note }),
  adjustConnections: (body) => api.post('/admin/connections/adjust', body),
  ledger: (query) => api.get('/admin/connections/ledger', query),
  packages: () => api.get('/admin/packages'),
  createPackage: (body) => api.post('/admin/packages', body),
  updatePackage: (id, body) => api.patch(`/admin/packages/${id}`, body),
  removePackage: (id) => api.delete(`/admin/packages/${id}`),

  reports: (query) => api.get('/admin/reports', query),
  updateReport: (id, body) => api.patch(`/admin/reports/${id}`, body),
  tickets: (query) => api.get('/admin/tickets', query),
  ticket: (id) => api.get(`/admin/tickets/${id}`),
  replyToTicket: (id, body) => api.post(`/admin/tickets/${id}/messages`, body),
  updateTicket: (id, body) => api.patch(`/admin/tickets/${id}`, body),
  contactMessages: (query) => api.get('/admin/contact-messages', query),
  updateContactMessage: (id, status) => api.patch(`/admin/contact-messages/${id}`, { status }),

  settings: () => api.get('/admin/settings'),
  updateSettings: (key, value) => api.put(`/admin/settings/${key}`, { value }),
  pages: () => api.get('/admin/pages'),
  savePage: (slug, body) => api.put(`/admin/pages/${slug}`, body),
  deletePage: (slug) => api.delete(`/admin/pages/${slug}`),
  faqs: () => api.get('/admin/faqs'),
  createFaq: (body) => api.post('/admin/faqs', body),
  updateFaq: (id, body) => api.patch(`/admin/faqs/${id}`, body),
  deleteFaq: (id) => api.delete(`/admin/faqs/${id}`),
};
