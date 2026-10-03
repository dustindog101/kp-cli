import { randomUUID } from "node:crypto";
import { paths } from "../../core/config.js";
import { readPrivate, savePrivate } from "../../core/store.js";
/** @param {any[]} before @param {any[]} after */
export function diffOrders(before, after) {
  const old = new Map(before.map((order) => [order.id, order]));
  const current = new Set(after.map((order) => order.id));
  const events = [];
  for (const order of after) {
    const previous = old.get(order.id);
    if (!previous)
      events.push({
        kind: "new_order",
        orderId: order.id,
        previousStatus: null,
        status: order.status,
      });
    else if (
      previous.status !== order.status ||
      JSON.stringify(previous.prescriptions) !==
        JSON.stringify(order.prescriptions)
    )
      events.push({
        kind: "order_updated",
        orderId: order.id,
        previousStatus: previous.status,
        status: order.status,
      });
  }
  for (const order of before)
    if (!current.has(order.id))
      events.push({
        kind: "order_no_longer_listed",
        orderId: order.id,
        previousStatus: order.status,
        status: null,
      });
  return events;
}
/** @param {string} profile @param {any[]} orders */
export async function syncUpdates(profile, orders) {
  const p = paths(profile);
  const previous = await readPrivate(p.updates);
  const now = new Date().toISOString();
  const events = previous
    ? diffOrders(previous.orders, orders).map((event) => ({
        ...event,
        id: randomUUID(),
        detectedAt: now,
      }))
    : [];
  // Bounded local history. First sync establishes a baseline, not a new-order alert.
  const history = [...(previous?.history || []), ...events].slice(-200);
  await savePrivate(p.updates, { checkedAt: now, orders, history });
  return {
    checkedAt: now,
    baselineCreated: !previous,
    updates: events,
    source: "local_snapshot_comparison",
  };
}
/** @param {string} profile */
export async function listUpdates(profile) {
  const cache = await readPrivate(paths(profile).updates);
  return {
    checkedAt: cache?.checkedAt || null,
    updates: cache?.history || [],
    source: "local_snapshot_comparison",
  };
}
