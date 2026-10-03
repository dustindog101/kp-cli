import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOrders,
  normalizePrescriptions,
  normalizeOrderDetails,
} from "../src/features/pharmacy/normalize.js";
import { diffOrders } from "../src/features/notifications/service.js";

test("digital pickup status wins over generic in-progress status", () => {
  const [order] = normalizeOrders({
    statusCode: "000",
    orderList: [
      {
        orderNum: "synthetic-order",
        orderStatus: "INPROGRESS",
        digitalStatus: "Ready for Pickup",
        rxList: [
          {
            rxInfo: [
              {
                kprxnum: "test-rx",
                drugName: "Synthetic medication",
                rxStatus: "READYFORPICKUP",
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(order.status, "Ready for Pickup");
  assert.equal(order.rawStatus, "INPROGRESS");
  assert.equal(order.prescriptions[0].rawStatus, "READYFORPICKUP");
});
test("backend error cannot masquerade as an empty order list", () => {
  assert.throws(() => normalizeOrders({ statusCode: "500", orderList: [] }), {
    code: "SCHEMA_CHANGED",
  });
  assert.deepEqual(normalizeOrders({ statusCode: "000", orderList: [] }), []);
});
test("partial prescription results preserve warnings, null IDs, and unavailable eligibility", () => {
  const data = normalizePrescriptions({
    executionContext: { statusCode: "000" },
    prescriptions: {
      fillable: [],
      nonFillable: [
        {
          medicineName: "Synthetic medication",
          canOrderRx: false,
          refillsRemaining: "0",
          medicineCodes: null,
        },
      ],
      executionContext: { warnings: [{ code: "8051", message: "" }] },
    },
  });
  assert.equal(data.partial, true);
  assert.equal(data.items[0].id, null);
  assert.equal(data.items[0].refillsRemaining, "0");
  assert.equal(data.items[0].canOrder, false);
  assert.equal(data.warnings[0].code, "8051");
});
test("missing pharmacy details stay unavailable, cancellation is never guessed", () => {
  const data = normalizeOrderDetails({
    orderNumber: "test-order",
    digitalStatus: "Ready for Pickup",
    rxList: [],
  });
  assert.equal(data.pharmacy, null);
  assert.equal(data.cancellation.verified, false);
});
test("update detection distinguishes new, changed, and disappeared orders", () => {
  const before = [
    { id: "a", status: "In progress", prescriptions: [] },
    { id: "b", status: "Ready", prescriptions: [] },
  ];
  const after = [
    { id: "a", status: "Ready", prescriptions: [] },
    { id: "c", status: "Submitted", prescriptions: [] },
  ];
  assert.deepEqual(
    diffOrders(before, after).map((e) => e.kind),
    ["order_updated", "new_order", "order_no_longer_listed"],
  );
  assert.deepEqual(diffOrders(after, after), []);
});

test("missing prescription IDs remain incomplete even without a backend warning", () => {
  const data = normalizePrescriptions({
    executionContext: { statusCode: "000" },
    prescriptions: {
      fillable: [],
      nonFillable: [
        { medicineName: "Synthetic medication", medicineCodes: null },
      ],
      partialFailure: false,
    },
  });
  assert.equal(data.partial, true);
  assert.ok(
    data.warnings.some((warning) => warning.code === "MISSING_IDENTIFIERS"),
  );
});
