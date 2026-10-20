import { bkash } from './bkash.js';
import { nagad } from './nagad.js';

// Automatic checkout providers. Rocket (DBBL) has no public merchant API, so it —
// like bKash and Nagad when their keys are not configured — uses manual
// "Send Money + transaction ID" verification by an admin.
export const gateways = { bkash, nagad };

export function gatewayFor(method) {
  const g = gateways[method];
  return g?.enabled ? g : null;
}
