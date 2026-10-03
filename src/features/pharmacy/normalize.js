import { KpError } from "../../core/errors.js";
/** @param {any} data */
export function normalizeOrders(data) {
  if (
    !data ||
    (data.statusCode != null && data.statusCode !== "000") ||
    !Array.isArray(data.orderList)
  )
    throw new KpError(
      "SCHEMA_CHANGED",
      "KP returned an unexpected order-status response. Run kp auth login to refresh the pharmacy session.",
      4,
    );
  return data.orderList.map((/** @type {any} */ o) => ({
    id: o.orderNum,
    pharmacyId: o.nhinid || null,
    status: o.digitalStatus || o.orderStatus || "Unknown",
    rawStatus: o.orderStatus || null,
    type: o.orderType || null,
    submittedAt: o.orderPlaceDate || null,
    prescriptions: (o.rxList || []).flatMap((/** @type {any} */ group) =>
      (group.rxInfo || []).map((/** @type {any} */ rx) => ({
        id: rx.kprxnum || null,
        name: rx.drugName || "Unknown medication",
        status:
          rx.rxStatusDetail || rx.rxStatus || o.digitalStatus || "Unknown",
        rawStatus: rx.rxStatus || null,
        copay: rx.copay || null,
      })),
    ),
  }));
}
/** @param {any} data */
export function normalizePrescriptions(data) {
  const prescriptions = data?.prescriptions;
  if (
    data?.executionContext?.statusCode !== "000" ||
    !prescriptions ||
    !Array.isArray(prescriptions.fillable) ||
    !Array.isArray(prescriptions.nonFillable)
  )
    throw new KpError(
      "SCHEMA_CHANGED",
      "KP returned an unexpected prescription-list response.",
      4,
    );
  const warnings = (prescriptions.executionContext?.warnings || []).map(
    (/** @type {any} */ w) => ({
      code: w.code || null,
      message: w.message || "KP returned a prescription data warning.",
    }),
  );
  const items = [...prescriptions.fillable, ...prescriptions.nonFillable].map(
    (/** @type {any} */ rx, i) => ({
      // A missing server identifier stays missing; row references are snapshot-only.
      reference: `rx-${i + 1}`,
      id: rx.medicineCodes?.rxNumber || rx.medicineCodes?.kprxnum || null,
      name: rx.medicineName || "Unknown medication",
      prescribedOn: rx.prescribedOn || null,
      refillsRemaining:
        rx.refillsRemaining == null || rx.refillsRemaining === ""
          ? null
          : String(rx.refillsRemaining),
      canOrder: rx.canOrderRx === true,
      refillEligible: rx.refillEligible === true,
      refillReminder: rx.refillReminder === true,
      autoRefill: rx.autoRefill === true,
      instructions: rx.consumerInstructions || null,
      status:
        rx.canOrderRx === true
          ? "Available to order"
          : "Not available to order",
      sourceError: rx.afcInfo?.errdesc || null,
    }),
  );
  if (items.some((item) => !item.id))
    warnings.push({
      code: "MISSING_IDENTIFIERS",
      message:
        "KP omitted server identifiers for some prescriptions. Snapshot references are for reads only.",
    });
  return {
    items,
    warnings,
    partial:
      prescriptions.partialFailure === true ||
      prescriptions.partialViewAccess === true ||
      warnings.length > 0,
    message: data.executionContext?.statusDetails || null,
  };
}
/** @param {any} data */
export function normalizePreferences(data) {
  const prefs = data?.eppCommunicationPreferences?.preferences;
  if (data?.status !== "SUCCESS" || !Array.isArray(prefs))
    throw new KpError(
      "SCHEMA_CHANGED",
      "KP returned an unexpected pharmacy notification response.",
      4,
    );
  return prefs.map((/** @type {any} */ p) => ({
    code: p.communicationCode,
    name: p.displayName,
    channels: (p.communicationChannels || []).map((/** @type {any} */ c) => ({
      name: c.communicationChannel,
      enabled: c.unsubscribe === false,
    })),
  }));
}
/** @param {any} data */
export function normalizeOrderDetails(data) {
  if (!data?.orderNumber || !Array.isArray(data.rxList))
    throw new KpError(
      "SCHEMA_CHANGED",
      "KP returned unexpected order details.",
      4,
    );
  const pharmacy = data.pharmacyDetails;
  return {
    id: data.orderNumber,
    status: data.digitalStatus || data.orderStatus || "Unknown",
    rawStatus: data.orderStatus || null,
    type: data.orderType,
    submittedAt: data.orderPlacedDate || null,
    prescriptions: data.rxList.map((/** @type {any} */ rx) => ({
      id: rx.rxNumber,
      name: rx.drugName,
      status: rx.rxStatusDetails || rx.rxStatus,
      copay: rx.copay || null,
      quantity: rx.quantity ?? null,
      nextFillDate: rx.nextFillDate || null,
    })),
    pharmacy: pharmacy
      ? {
          name: pharmacy.pharmacyName || pharmacy.facilityName,
          address: pharmacy.facilityAddress,
          hours: pharmacy.facilityHours || [],
          phones: (pharmacy.phoneNumberDetails || []).map(
            (/** @type {any} */ p) => ({
              label: p.description || p.label,
              number: p.number,
            }),
          ),
        }
      : null,
    cancellation: {
      verified: false,
      reason:
        "No cancellation control was exposed on the inspected pickup-ready order. Other order states have not been verified.",
    },
  };
}
