import { HttpTransport } from "../../core/http.js";
import { endpoints } from "./endpoints.js";
import {
  normalizeOrders,
  normalizePrescriptions,
  normalizePreferences,
  normalizeOrderDetails,
} from "./normalize.js";
import { KpError } from "../../core/errors.js";
/** @param {string} profile @param {(transport: HttpTransport) => Promise<any>} callback */
export async function withPharmacy(profile, callback) {
  const http = await HttpTransport.create(profile);
  try {
    return await callback(http);
  } finally {
    await http.close();
  }
}
/** @param {HttpTransport} http */
export async function orders(http) {
  return normalizeOrders(
    await http.getJson(endpoints.orderStatus, "orderStatus"),
  );
}
/** @param {HttpTransport} http */
export async function prescriptions(http) {
  return normalizePrescriptions(
    await http.getJson(endpoints.rxDetails, "rxDetails"),
  );
}
/** @param {HttpTransport} http */
export async function preferences(http) {
  return normalizePreferences(
    await http.getJson(
      endpoints.rxnotificationpreferences,
      "rxnotificationpreferences",
    ),
  );
}
/** @param {HttpTransport} http @param {string | undefined} id */
export async function orderDetails(http, id) {
  const list = await orders(http);
  const order = id
    ? list.find((/** @type {any} */ o) => o.id === id)
    : list.length === 1
      ? list[0]
      : null;
  if (!id && list.length > 1)
    throw new KpError(
      "ORDER_ID_REQUIRED",
      "There are multiple orders. Use kp orders list and select an order ID.",
      2,
    );
  if (!order)
    throw new KpError(
      "NOT_FOUND",
      "Order not found in the current account.",
      5,
    );
  if (!order.pharmacyId)
    throw new KpError(
      "DETAILS_UNAVAILABLE",
      "KP did not provide a pharmacy identifier for this order.",
      4,
    );
  const query = new URLSearchParams({
    ordernum: order.id,
    pharmacyId: order.pharmacyId,
  });
  return normalizeOrderDetails(
    await http.getJson(endpoints.orderDetails + "?" + query, "orderDetails"),
  );
}
/** @param {HttpTransport} http */
export async function summary(http) {
  const [orderList, rx] = await Promise.all([
    orders(http),
    prescriptions(http),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    transport: "http",
    orders: orderList,
    prescriptions: rx,
  };
}
/** @param {HttpTransport} http @param {string} reference */
export async function refillPlan(http, reference) {
  const rx = await prescriptions(http);
  const item = rx.items.find(
    (/** @type {any} */ item) =>
      item.id === reference || item.reference === reference,
  );
  if (!item)
    throw new KpError(
      "NOT_FOUND",
      "Prescription not found. Use kp rx list to find its reference.",
      5,
    );
  return {
    action: "refill",
    submitted: false,
    prescription: item,
    eligible: item.canOrder && item.refillEligible,
    reason:
      item.canOrder && item.refillEligible
        ? "Available on KP; checkout submission has not been verified."
        : item.sourceError ||
          "KP currently marks this prescription unavailable to order.",
    webUrl: "https://healthy.kaiserpermanente.org/secure/pharmacy/landingPage",
    partial: rx.partial,
  };
}
