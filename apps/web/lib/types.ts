// Shared API response types for the storefront.

export type ProductType = "ACCOUNT" | "LICENSE" | "GIFTCARD";

export type Category = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
};

export type CategoryRef = { id: string; name: string; slug: string };

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  type: ProductType;
  category: CategoryRef;
  priceFrom: number | null;
  currency: string;
  availableStock: number;
  inStock: boolean;
  soldCount?: number;
};

export type PlanDetail = {
  id: string;
  label: string;
  durationDays: number | null;
  price: number;
  currency: string;
  availableStock: number;
  inStock: boolean;
};

export type ProductDetail = ProductSummary & {
  description: string;
  plans: PlanDetail[];
};

export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
export type Paginated<T> = { items: T[]; pagination: Pagination };

export type OrderSummary = {
  id: string;
  totalAmount: number;
  currency: string;
  paymentStatus: string;
  itemCount: number;
  createdAt: string;
  paidAt: string | null;
};

export type Credential = {
  id: string;
  type: ProductType;
  accountEmail: string | null;
  accountPassword: string | null;
  licenseKey: string | null;
  giftCardCode: string | null;
};

export type OrderItemDetail = {
  id: string;
  product: { id: string; name: string; slug: string; type: ProductType };
  plan: { id: string; label: string };
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  credentials: Credential[];
};

export type OrderDetail = {
  id: string;
  totalAmount: number;
  currency: string;
  paymentStatus: string;
  paymentProvider: string | null;
  paymentRefId: string | null;
  createdAt: string;
  paidAt: string | null;
  items: OrderItemDetail[];
};

export type CreateOrderResponse = {
  order: { id: string; totalAmount: number; currency: string; paymentStatus: string };
  payment: { authority: string; redirectUrl: string };
};
