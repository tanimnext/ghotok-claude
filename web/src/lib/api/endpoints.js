import { api } from './client.js';

// One function per API endpoint used by the website, grouped by resource.
// Components and hooks call these instead of building URLs themselves.

export const authApi = {
  me: () => api.get('/auth/me'),
  login: (body) => api.post('/auth/login', body),
  register: (body) => api.post('/auth/register', body),
  verify: (body) => api.post('/auth/verify', body),
  resendOtp: (body) => api.post('/auth/resend-otp', body),
  forgotPassword: (body) => api.post('/auth/forgot-password', body),
  resetPassword: (body) => api.post('/auth/reset-password', body),
  logout: () => api.post('/auth/logout'),
};

export const biodataApi = {
  // The member's own biodata
  mine: () => api.get('/biodatas/me'),
  saveSection: (section, data) => api.put(`/biodatas/me/sections/${section}`, { data }),
  submit: () => api.post('/biodatas/me/submit'),
  setHidden: (hidden) => api.patch('/biodatas/me/visibility', { hidden }),
  remove: (body) => api.delete('/biodatas/me', body),
  restoreRequest: () => api.get('/biodatas/me/restore-request'),
  requestRestore: (reason) => api.post('/biodatas/me/restore-request', { reason }),
  photoUploadUrl: () => api.post('/biodatas/me/photo/upload-url'),
  attachPhoto: (body) => api.post('/biodatas/me/photo', body),
  setPhotoVisibility: (visibility) => api.patch('/biodatas/me/photo', { visibility }),
  removePhoto: () => api.delete('/biodatas/me/photo'),
  nidUploadUrl: (side, contentType) => api.post('/biodatas/me/nid/upload-url', { side, contentType }),
  submitNid: (body) => api.post('/biodatas/me/nid', body),

  // Other members' biodatas
  search: (query) => api.get('/biodatas', query),
  viewer: (no) => api.get(`/biodatas/${no}/viewer`),
  visit: (no) => api.post(`/biodatas/${no}/visit`),
  unlock: (no) => api.post(`/biodatas/${no}/unlock`),
  favorite: (no) => api.post(`/biodatas/${no}/favorite`),
  unfavorite: (no) => api.delete(`/biodatas/${no}/favorite`),
  dislike: (no) => api.post(`/biodatas/${no}/dislike`),
  undislike: (no) => api.delete(`/biodatas/${no}/dislike`),
  propose: (no, message) => api.post(`/biodatas/${no}/proposals`, { message }),
  report: (no, body) => api.post(`/biodatas/${no}/report`, body),
};

export const accountApi = {
  dashboard: () => api.get('/me/dashboard'),
  updateProfile: (body) => api.patch('/me', body),
  changePassword: (body) => api.post('/me/change-password', body),
  deactivate: (body) => api.delete('/me', body),
  favorites: (page) => api.get('/me/favorites', { page }),
  dislikes: (page) => api.get('/me/dislikes', { page }),
  favoritedMe: (page) => api.get('/me/favorited-me', { page }),
  unlocks: (page) => api.get('/me/unlocks', { page }),
  proposals: (box, page) => api.get('/me/proposals', { box, page }),
  respondToProposal: (id, action) => api.post(`/me/proposals/${id}/respond`, { action }),
  withdrawProposal: (id) => api.post(`/me/proposals/${id}/withdraw`),
  notifications: (page) => api.get('/me/notifications', { page }),
  markAllRead: () => api.post('/me/notifications/read-all'),
  connections: (page) => api.get('/me/connections', { page }),
};

export const billingApi = {
  catalogue: () => api.get('/packages'),
  createPayment: (body) => api.post('/payments', body),
  myPayments: (page) => api.get('/payments/mine', { page }),
  requestRefund: (body) => api.post('/refunds', body),
};

export const supportApi = {
  tickets: (page) => api.get('/tickets', { page }),
  open: (body) => api.post('/tickets', body),
  get: (id) => api.get(`/tickets/${id}`),
  reply: (id, message) => api.post(`/tickets/${id}/messages`, { message }),
  close: (id) => api.post(`/tickets/${id}/close`),
  contact: (body) => api.post('/contact', body),
};
