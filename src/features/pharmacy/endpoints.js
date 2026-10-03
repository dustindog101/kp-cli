const BASE =
  "https://apims.kaiserpermanente.org/kp/mycare/pharmacy-microservices";
export const endpoints = {
  orderStatus: `${BASE}/rx-order-management-bff/v1/orderStatus`,
  orderDetails: `${BASE}/rx-order-management-bff/v1/orderDetails`,
  rxDetails: `${BASE}/rx-cost-inventory-bff/v1/rxDetails?prescriptions_filter=all`,
  rxnotificationpreferences: `${BASE}/pharmacy-center-kpweb-bff/v1/rxnotificationpreferences`,
};
