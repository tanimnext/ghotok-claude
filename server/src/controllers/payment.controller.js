import { env } from '../config/env.js';
import * as paymentService from '../services/payment.service.js';
import * as refundService from '../services/refund.service.js';
import { requestContext } from '../utils/request.js';

export async function catalogue(_req, res) {
  res.json(await paymentService.catalogue());
}

export async function create(req, res) {
  res.status(201).json(await paymentService.createPayment(req.user, req.body, requestContext(req)));
}

/** bKash / Nagad send the customer back here; we finish the payment and redirect to the dashboard. */
export async function gatewayCallback(req, res) {
  const { status, invoiceNo } = await paymentService.completeGatewayCheckout(req.params.method, req.query);
  const invoice = invoiceNo ? `&invoice=${encodeURIComponent(invoiceNo)}` : '';
  res.redirect(`${env.WEB_URL}/dashboard/connections?payment=${status}${invoice}`);
}

export async function mine(req, res) {
  res.json(await paymentService.myPayments(req.user, req.query));
}

export async function requestRefund(req, res) {
  res.status(201).json({ refund: await refundService.requestRefund(req.user, req.body) });
}

export async function myRefunds(req, res) {
  res.json({ items: await refundService.myRefunds(req.user) });
}
